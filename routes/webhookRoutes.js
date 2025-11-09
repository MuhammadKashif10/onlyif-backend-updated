const express = require('express');
const Stripe = require('stripe');
const Purchase = require('../models/Purchase');
const PaymentRecord = require('../models/PaymentRecord');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
console.log(req.body,"+++++++++++++++")
console.log(process.env.STRIPE_WEBHOOK_SECRET)
  try {
    // req.body is a Buffer here 👇
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      // Commission payments for invoices
      if (session.metadata && session.metadata.type === 'commission_payment' && session.metadata.invoiceId) {
        try {
          const Invoice = require('../models/Invoice');
          const invoice = await Invoice.findById(session.metadata.invoiceId);
          if (invoice) {
            const amount = (session.amount_total || 0) / 100;
            invoice.payments.push({
              amount,
              paymentDate: new Date(),
              paymentMethod: 'stripe_checkout',
              transactionId: session.payment_intent,
              reference: session.id,
              notes: 'Stripe checkout session completed',
              recordedBy: null
            });
            // Update status if fully paid (tolerance for rounding)
            const paidTotal = invoice.amountPaid; // includes pushed amount above
            if (paidTotal + 0.005 >= invoice.totalAmount) {
              invoice.status = 'paid';
            }
            await invoice.save();
            console.log(`✅ Invoice ${invoice.invoiceNumber} marked with payment ${amount} via Stripe`);

            // Update Payment Record Status
            try {
              console.log(`🔍 Searching for payment record with invoice ID: ${session.metadata.invoiceId}`);
              const paymentRecord = await PaymentRecord.findOne({ invoice: session.metadata.invoiceId });
              
              if (paymentRecord) {
                console.log(`📝 Updating payment record ${paymentRecord._id} to completed status`);
                
                // Extract payment method details from Stripe session
                const paymentMethodDetails = {
                  last4: session.payment_method_details?.card?.last4 || null,
                  brand: session.payment_method_details?.card?.brand || null,
                  customerEmail: session.customer_details?.email || paymentRecord.sellerDetails.email
                };
                
                await paymentRecord.markAsCompleted({
                  transactionId: session.payment_intent,
                  paymentIntentId: session.payment_intent,
                  paymentMethod: paymentMethodDetails
                });
                
                console.log('✅ Payment record marked as completed from Stripe webhook');
                
                // Notify admin dashboard of payment completion via Socket.IO
                try {
                  const io = req.app?.locals?.io || global.io;
                  if (io) {
                    io.emit('payment_completed', {
                      paymentRecordId: paymentRecord._id.toString(),
                      invoiceNumber: paymentRecord.invoiceDetails.invoiceNumber,
                      amount: paymentRecord.amount,
                      propertyTitle: paymentRecord.propertyDetails.title,
                      sellerName: paymentRecord.sellerDetails.name,
                      completedAt: new Date().toISOString()
                    });
                    console.log('📡 Payment completion broadcasted to admin dashboard');
                  }
                } catch (socketErr) {
                  console.error('Failed to broadcast payment completion:', socketErr?.message);
                }
              } else {
                console.log(`⚠️ No payment record found for invoice ID: ${session.metadata.invoiceId}`);
              }
            } catch (paymentRecordErr) {
              console.error('Failed to update payment record:', paymentRecordErr?.message);
            }

            // Persist a Transaction record for Admin payments view (idempotent on payment_intent)
            try {
              const Transaction = require('../models/Transaction');
              const existingTxn = await Transaction.findOne({ transactionId: session.payment_intent });
              if (!existingTxn) {
                const txn = new Transaction({
                  user: invoice.seller,
                  property: invoice.property,
                  transactionId: session.payment_intent,
                  transactionType: 'commission',
                  items: [{
                    itemType: 'commission',
                    description: `Commission Payment - Invoice ${invoice.invoiceNumber}`,
                    unitPrice: amount,
                    quantity: 1,
                    totalPrice: amount
                  }],
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
            } catch (txnErr) {
              console.error('Failed to persist Transaction for commission payment:', txnErr?.message);
            }

            // Realtime notify seller UI if socket available
            try {
              const io = req.app?.locals?.io || global.io;
              if (io) {
                io.to(`seller-${invoice.seller.toString()}`).emit('invoice_paid', { invoiceId: invoice._id.toString(), status: invoice.status });
              }
            } catch {}
          }
        } catch (e) {
          console.error('Invoice payment webhook handling failed:', e?.message);
        }
      }

      // Property access purchases (existing flow)
      const userId = session.metadata?.userId;
      const propertyId = session.metadata?.propertyId;
      if (userId && propertyId) {
        await Purchase.findOneAndUpdate(
          { user: userId, property: propertyId },
          {
            status: 'paid',
            checkoutSessionId: session.id,
            paymentIntentId: session.payment_intent
          },
          { new: true }
        );
        console.log(`✅ Purchase marked as paid for user ${userId}, property ${propertyId}`);

        // Persist a Transaction record for Admin payments view (buyer property unlock)
        try {
          const Transaction = require('../models/Transaction');
          const Property = require('../models/Property');
          const User = require('../models/User');

          const existingTxn = await Transaction.findOne({ transactionId: session.payment_intent });
          if (!existingTxn) {
            const amount = (session.amount_total || 4900) / 100;
            const property = await Property.findById(propertyId).select('title');
            const user = await User.findById(userId).select('name');

            const txn = new Transaction({
              user: userId,
              property: propertyId,
              transactionId: session.payment_intent,
              transactionType: 'unlock_fee',
              items: [{
                itemType: 'service',
                description: `Property unlock access - ${property?.title || 'Property'}`,
                unitPrice: amount,
                quantity: 1,
                totalPrice: amount
              }],
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
            // Optional: broadcast to admin dashboards
            try {
              const io = req.app?.locals?.io || global.io;
              if (io) {
                io.emit('payment_completed', {
                  paymentRecordId: txn._id.toString(),
                  invoiceNumber: 'UNLOCK',
                  amount,
                  propertyTitle: property?.title || 'Property',
                  sellerName: user?.name || 'Buyer',
                  completedAt: new Date().toISOString()
                });
              }
            } catch {}
          }
        } catch (txnErr) {
          console.error('Failed to persist Transaction for property unlock:', txnErr?.message);
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

module.exports = router;

// // routes/webhookRoutes.js
// const express = require('express');
// const Stripe = require('stripe');
// const Purchase = require('../models/Purchase');

// const router = express.Router();
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
//   const sig = req.headers['stripe-signature'];
// console.log(req.body,"+++++++++++++++")
//   try {
//     const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

//     if (event.type === 'checkout.session.completed') {
//       const session = event.data.object;

//       const userId = session.metadata.userId;
//       console.log("🚀 ~ userId:", userId)
//       const propertyId = session.metadata.propertyId;
//       console.log("🚀 ~ propertyId:", propertyId)

//       await Purchase.findOneAndUpdate(
//         { user: userId, property: propertyId },
//         {
//           status: 'paid',
//           paymentIntentId: session.payment_intent, // store real payment intent ID
//         },
//         { new: true }
//       );

//       console.log(`✅ Purchase marked as paid for user ${userId}, property ${propertyId}`);
//     }

//     res.send();
//   } catch (err) {
//     console.error('❌ Webhook error:', err.message);
//     res.status(400).send(`Webhook Error: ${err.message}`);
//   }
// });

// module.exports = router;

// // routes/webhookRoutes.js
// const express = require('express');
// const Stripe = require('stripe');
// const Purchase = require('../models/Purchase');

// const router = express.Router();
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
//   const sig = req.headers['stripe-signature'];

//   try {
//     const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

//     if (event.type === 'checkout.session.completed') {
//       const session = event.data.object;

//       await Purchase.findOneAndUpdate(
//         { paymentIntentId: session.id },
//         { status: 'paid' },
//         { new: true }
//       );
//     }

//     res.send();
//   } catch (err) {
//     console.error(err);
//     res.status(400).send(`Webhook Error: ${err.message}`);
//   }
// });

// module.exports = router;