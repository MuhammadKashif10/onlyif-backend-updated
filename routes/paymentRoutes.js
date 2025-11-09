// routes/paymentRoutes.js
const express = require('express');
const Stripe = require('stripe');
const Purchase = require('../models/Purchase');
const Property = require('../models/Property');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create checkout session
router.post('/checkout/:propertyId', authMiddleware, async (req, res) => {
  console.log(process.env.STRIPE_WEBHOOK_SECRET,`++++++`)

  try {
    const { propertyId } = req.params;
    console.log("🚀 ~ propertyId:", propertyId)
    console.log("🚀 ~ user:",  req.user._id)
    const property = await Property.findById(propertyId);

    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
// Prevent duplicate purchase for same property
// let existing = await Purchase.findOne({ user: req.user._id, property: propertyId });
// console.log("🚀 ~ existing:", existing)

// if (existing) {
//   if (existing.status === 'paid') {
//     return res.json({ alreadyPaid: true });
//   }
//   if (existing.status === 'pending') {
//     // User already has a pending session → return that session instead of creating a new one
//     return res.json({ url: `https://checkout.stripe.com/pay/${existing.paymentIntentId}` });
//   }
// }

    // Prevent duplicate purchase
    let existing = await Purchase.findOne({ user: req.user._id, property: propertyId, status: 'paid' });
    if (existing) {
      return res.json({ alreadyPaid: true });
    }

    const front = process.env.FRONTEND_URL || 'http://localhost:3010';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aud', // Australian Dollars
            unit_amount: 4900, // 49 AUD (amount in cents)
            product_data: {
              name: `Access property: ${property.title}`
            }
          },
          quantity: 1
        }
      ],
      success_url: `${front}/property/${propertyId}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${front}/property/${propertyId}?payment=cancelled`,
      metadata: {
        type: 'property_unlock',
        userId: req.user._id.toString(),
        propertyId: propertyId
      }
    });
// Save or update pending purchase
await Purchase.findOneAndUpdate(
  { user: req.user._id, property: propertyId },
  {
    user: req.user._id,
    property: propertyId,
    paymentIntentId: session.id,
    amount: 4900,
    status: 'paid'
  },
  { upsert: true, new: true }
);



    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error creating checkout session' });
  }
});
router.get('/purchases/:propertyId', authMiddleware, async (req, res) => {
  try {
    const { propertyId } = req.params;

    // Find ALL purchases for this property
    const purchases = await Purchase.find({
      property: propertyId,
      status: 'paid', // only return paid buyers (optional)
    })
    .populate('user', 'name email'); // populate user info

    if (!purchases || purchases.length === 0) {
      return res.status(404).json({ message: 'No purchases found for this property' });
    }



    res.json(purchases);
  } catch (err) {
    console.error('Error fetching purchases:', err);
    res.status(500).json({ message: 'Server error fetching purchase details' });
  }
});

// Initialize commission payment session
router.post('/initialize', authMiddleware, async (req, res) => {
  try {
    const { invoiceId, amount, type = 'commission_payment' } = req.body;
    const Invoice = require('../models/Invoice');
    
    // Validate input
    if (!invoiceId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Invoice ID and amount are required'
      });
    }
    
    // Find and validate invoice
    const invoice = await Invoice.findById(invoiceId);
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    
    // Verify user can pay this invoice (seller or agent or admin)
    if (req.user._id.toString() !== invoice.seller.toString() &&
        req.user._id.toString() !== invoice.agent.toString() &&
        req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Validate amount
    const amountPaid = invoice.payments?.reduce((sum, payment) => sum + payment.amount, 0) || 0;
    const maxAmount = invoice.totalAmount - amountPaid;
    if (parseFloat(amount) > maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Amount cannot exceed outstanding balance of $${maxAmount.toLocaleString()}`
      });
    }
    
    // Create Stripe checkout session for commission payment
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aud',
            unit_amount: Math.round(parseFloat(amount) * 100), // Convert to cents
            product_data: {
              name: `Commission Payment - Invoice ${invoice.invoiceNumber}`,
              description: `Payment for real estate commission services`
            }
          },
          quantity: 1
        }
      ],
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3010'}/dashboards/seller/account?tab=payments&payment=success&invoice=${invoiceId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3010'}/dashboards/seller/account?tab=payments&payment=cancelled`,
      metadata: {
        type: 'commission_payment',
        invoiceId: invoiceId,
        userId: req.user._id.toString(),
        amount: amount.toString()
      }
    });
    
    console.log(`💳 Commission payment session created: ${session.id} for invoice ${invoice.invoiceNumber}`);
    
    res.json({
      success: true,
      data: {
        invoiceId,
        amount: parseFloat(amount),
        paymentUrl: session.url,
        sessionId: session.id
      }
    });
    
  } catch (error) {
    console.error('Error initializing commission payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize payment'
    });
  }
});

// Get payment history for a user
// Confirm checkout session and update invoice (fallback when webhook not reachable)
router.post('/confirm', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }
    const Invoice = require('../models/Invoice');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session || (session.payment_status !== 'paid' && session.status !== 'complete')) {
      return res.json({ success: false, message: 'Payment not completed yet' });
    }

    // Branch A: Commission invoice payment
    if (session.metadata?.invoiceId) {
      const invoiceId = session.metadata.invoiceId;
      const Invoice = require('../models/Invoice');
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      const amount = (session.amount_total || 0) / 100;
      const exists = (invoice.payments || []).some(p => p.transactionId === session.payment_intent);
      if (!exists) {
        invoice.payments.push({
          amount,
          paymentDate: new Date(),
          paymentMethod: 'stripe_checkout',
          transactionId: session.payment_intent,
          reference: session.id,
          notes: 'Stripe checkout session confirmed',
          recordedBy: req.user._id
        });
      }

      if (invoice.amountPaid + 0.005 >= invoice.totalAmount) {
        invoice.status = 'paid';
      }
      await invoice.save();

      // Persist a Transaction record
      try {
        const Transaction = require('../models/Transaction');
        const existingTxn = await Transaction.findOne({ transactionId: session.payment_intent });
        if (!existingTxn) {
          const txnAmount = (session.amount_total || 0) / 100;
          const txn = new Transaction({
            user: invoice.seller,
            property: invoice.property,
            transactionId: session.payment_intent,
            transactionType: 'commission',
            items: [{ itemType: 'commission', description: `Commission Payment - Invoice ${invoice.invoiceNumber}` , unitPrice: txnAmount, quantity: 1, totalPrice: txnAmount }],
            subtotal: txnAmount,
            tax: { rate: 0, amount: 0 },
            fees: [],
            discounts: [],
            totalAmount: txnAmount,
            currency: 'AUD',
            paymentMethod: 'stripe',
            externalReferences: { stripePaymentIntentId: session.payment_intent },
            status: 'succeeded',
            completedAt: new Date()
          });
          await txn.save();
        }
      } catch (txnErr) {
        console.error('Failed to persist Transaction for commission payment (confirm):', txnErr?.message);
      }

      return res.json({ success: true, data: { invoiceId: invoice._id, status: invoice.status } });
    }

    // Branch B: Buyer property unlock payment
    if (session.metadata?.userId && session.metadata?.propertyId) {
      const Purchase = require('../models/Purchase');
      await Purchase.findOneAndUpdate(
        { user: session.metadata.userId, property: session.metadata.propertyId },
        { status: 'paid', checkoutSessionId: session.id, paymentIntentId: session.payment_intent },
        { new: true, upsert: true }
      );

      try {
        const Transaction = require('../models/Transaction');
        const Property = require('../models/Property');
        const User = require('../models/User');
        const existingTxn = await Transaction.findOne({ transactionId: session.payment_intent });
        if (!existingTxn) {
          const amount = (session.amount_total || 4900) / 100;
          const property = await Property.findById(session.metadata.propertyId).select('title');
          const txn = new Transaction({
            user: session.metadata.userId,
            property: session.metadata.propertyId,
            transactionId: session.payment_intent,
            transactionType: 'unlock_fee',
            items: [{ itemType: 'service', description: `Property unlock access - ${property?.title || 'Property'}`, unitPrice: amount, quantity: 1, totalPrice: amount }],
            subtotal: amount,
            tax: { rate: 0, amount: 0 },
            fees: [],
            discounts: [],
            totalAmount: amount,
            currency: 'AUD',
            paymentMethod: 'stripe',
            externalReferences: { stripePaymentIntentId: session.payment_intent },
            status: 'succeeded',
            completedAt: new Date()
          });
          await txn.save();
        }
      } catch (e) {
        console.error('Failed to persist Transaction for property unlock (confirm):', e?.message);
      }

      return res.json({ success: true, data: { status: 'paid' } });
    }

    return res.json({ success: false, message: 'Unknown payment session' });
  } catch (error) {
    console.error('Payment confirm error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm payment' });
  }
});

router.get('/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const Invoice = require('../models/Invoice');
    
    // Find invoices and their payments for this user
    const invoices = await Invoice.find({ seller: userId })
      .populate('property', 'title address')
      .select('invoiceNumber payments totalAmount status createdAt')
      .sort({ createdAt: -1 });
    
    // Extract all payments
    const allPayments = [];
    
    invoices.forEach(invoice => {
      if (invoice.payments && invoice.payments.length > 0) {
        invoice.payments.forEach(payment => {
          allPayments.push({
            _id: payment._id,
            invoiceId: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            property: invoice.property,
            amount: payment.amount,
            paymentDate: payment.paymentDate,
            paymentMethod: payment.paymentMethod,
            transactionId: payment.transactionId,
            reference: payment.reference,
            notes: payment.notes
          });
        });
      }
    });
    
    // Sort by payment date descending
    allPayments.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
    
    res.json({
      success: true,
      data: allPayments
    });
    
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history'
    });
  }
});

module.exports = router;
