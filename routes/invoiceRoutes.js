const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const Invoice = require('../models/Invoice');
const Property = require('../models/Property');
const User = require('../models/User');
// const PDFDocument = require('pdfkit'); // Removed for now to prevent import issues
const path = require('path');

// Get invoices for a buyer
router.get('/buyer/:buyerId', authMiddleware, asyncHandler(async (req, res) => {
  try {
    const { buyerId } = req.params;
    
    // Verify the user is accessing their own invoices or is an admin
    if (req.user.id !== buyerId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own invoices.'
      });
    }
    
    const invoices = await Invoice.find({ buyer: buyerId })
      .populate('property', 'title address price')
      .populate('agent', 'name email bankAccountNumber')
      .sort({ createdAt: -1 })
      .lean();
    
    // Add computed fields
    const invoicesWithComputed = invoices.map(invoice => {
      const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
      const lastPayment = payments.length > 0 ? payments[payments.length - 1] : null;
      return ({
        ...invoice,
        amountPaid: payments.reduce((sum, payment) => sum + payment.amount, 0) || 0,
        amountDue: invoice.totalAmount - (payments.reduce((sum, payment) => sum + payment.amount, 0) || 0),
        isOverdue: invoice.status !== 'paid' && new Date(invoice.dueDate) < new Date(),
        daysPastDue: invoice.status !== 'paid' && new Date(invoice.dueDate) < new Date() 
          ? Math.ceil((new Date() - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24)) 
          : 0,
        lastPaymentTransactionId: lastPayment?.transactionId || null
      });
    });
    
    res.json({
      success: true,
      data: invoicesWithComputed
    });
    
  } catch (error) {
    console.error('Error fetching buyer invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices'
    });
  }
}));

// Get invoices for a seller
router.get('/seller/:sellerId', authMiddleware, asyncHandler(async (req, res) => {
  try {
    const { sellerId } = req.params;
    
    // Verify the user is accessing their own invoices or is an admin
    if (req.user.id !== sellerId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own invoices.'
      });
    }
    
    const invoices = await Invoice.find({ seller: sellerId })
      .populate('property', 'title address price')
      .populate('agent', 'name email bankAccountNumber')
      .sort({ createdAt: -1 })
      .lean();
    
    // Add computed fields
    const invoicesWithComputed = invoices.map(invoice => {
      const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
      const lastPayment = payments.length > 0 ? payments[payments.length - 1] : null;
      return ({
        ...invoice,
        amountPaid: payments.reduce((sum, payment) => sum + payment.amount, 0) || 0,
        amountDue: invoice.totalAmount - (payments.reduce((sum, payment) => sum + payment.amount, 0) || 0),
        isOverdue: invoice.status !== 'paid' && new Date(invoice.dueDate) < new Date(),
        daysPastDue: invoice.status !== 'paid' && new Date(invoice.dueDate) < new Date() 
          ? Math.ceil((new Date() - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24)) 
          : 0,
        lastPaymentTransactionId: lastPayment?.transactionId || null
      });
    });
    
    res.json({
      success: true,
      data: invoicesWithComputed
    });
    
  } catch (error) {
    console.error('Error fetching seller invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices'
    });
  }
}));

// Get specific invoice details
router.get('/:invoiceId', authMiddleware, asyncHandler(async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    const invoice = await Invoice.findById(invoiceId)
      .populate('property', 'title address price')
      .populate('agent', 'name email phone bankAccountNumber')
      .populate('seller', 'name email')
      .populate('buyer', 'name email');
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    
    // Verify access
    if (req.user.id !== invoice.seller._id.toString() && 
        req.user.id !== invoice.agent._id.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      data: invoice
    });
    
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice'
    });
  }
}));

// Generate and stream invoice PDF with details
router.get('/:invoiceId/pdf', authMiddleware, asyncHandler(async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Invoice.findById(invoiceId)
      .populate('property', 'title address price')
      .populate('agent', 'name email phone bankAccountNumber')
      .populate('seller', 'name email')
      .populate('buyer', 'name email');

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    // Verify access
    if (
      req.user.id !== invoice.seller._id.toString() &&
      req.user.id !== invoice.agent._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });

    // Set headers
    res.setHeader('Content-Type', 'application/pdf');
    const filename = `${invoice.invoiceNumber}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Pipe to response
    doc.pipe(res);

    // Header
    doc
      .fontSize(20)
      .text('OnlyIf Real Estate — Commission Invoice', { align: 'left' })
      .moveDown(0.5);

    // Invoice meta
    doc
      .fontSize(11)
      .text(`Invoice Number: ${invoice.invoiceNumber}`)
      .text(`Invoice Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}`)
      .text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`)
      .moveDown();

    // Party details
    doc
      .fontSize(12)
      .text('Bill To:', { underline: true })
      .text(`${invoice.seller?.name || 'Seller'}`)
      .text(`${invoice.seller?.email || ''}`)
      .moveDown(0.5);

    doc
      .text('Agent:', { underline: true })
      .text(`${invoice.agent?.name || 'Agent'}`)
      .moveDown();

    // Property details
    const addr = invoice.property?.address;
    const addressLine = addr
      ? `${addr.street || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.zipCode || ''}`
      : '—';
    doc
      .fontSize(12)
      .text('Property:', { underline: true })
      .text(`${invoice.property?.title || '—'}`)
      .text(addressLine)
      .moveDown();

    // Financials
    const currency = 'A$';
    const money = (v) => `${currency}${Number(v).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    doc
      .fontSize(12)
      .text(`Sale Price: ${money(invoice.propertyValue)}`)
      .text(`Commission Rate: ${invoice.commissionRate}%`)
      .text(`Commission Amount: ${money(invoice.commissionAmount)}`)
      .text(`GST (10%): ${money(invoice.tax?.gst?.amount || 0)}`)
      .text(`Subtotal: ${money(invoice.subtotal)}`)
      .text(`Total Tax: ${money(invoice.totalTax)}`)
      .font('Helvetica-Bold')
      .text(`Total Amount Due: ${money(invoice.totalAmount)}`)
      .font('Helvetica')
      .moveDown();

    // Line items table (simple)
    if (Array.isArray(invoice.lineItems) && invoice.lineItems.length) {
      doc.fontSize(12).text('Line Items:', { underline: true }).moveDown(0.3);
      invoice.lineItems.forEach((li, idx) => {
        doc.text(`${idx + 1}. ${li.description} — Qty: ${li.quantity || 1} — Unit: ${money(li.unitPrice)} — Total: ${money(li.totalPrice)}`);
      });
      doc.moveDown();
    }

    // If not paid, include a Stripe checkout link
    if (invoice.status !== 'paid') {
      try {
        const Stripe = require('stripe');
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const amountDue = Math.round((invoice.totalAmount - (invoice.payments || []).reduce((s,p)=>s+p.amount,0)) * 100);
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'aud',
              unit_amount: amountDue,
              product_data: { name: `Commission Payment - Invoice ${invoice.invoiceNumber}` }
            },
            quantity: 1
          }],
          success_url: `${process.env.FRONTEND_URL || process.env.BACKEND_URL || ''}/dashboards/seller/account?tab=payments&payment=success&invoice=${invoice._id}`,
          cancel_url: `${process.env.FRONTEND_URL || process.env.BACKEND_URL || ''}/dashboards/seller/account?tab=payments&payment=cancelled`,
          metadata: { type: 'commission_payment', invoiceId: invoice._id.toString(), amount: (amountDue/100).toString() }
        });

        doc
          .moveDown()
          .fillColor('blue')
          .text('Pay Now (Stripe): ' + session.url, { link: session.url, underline: true })
          .fillColor('black')
          .moveDown();
      } catch (e) {
        console.warn('Failed to create Stripe session for PDF:', e?.message);
      }
    }

    // Footer
    doc
      .fontSize(10)
      .text(`Payment Terms: ${invoice.paymentTerms || 'Net 30 days'}`)
      .moveDown(0.5)
      .text('Thank you for using OnlyIf Real Estate!', { align: 'left' });

    doc.end();
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    res.status(500).json({ success: false, message: 'Failed to generate invoice PDF' });
  }
}));

// Record payment for invoice
router.post('/:invoiceId/payment', authMiddleware, asyncHandler(async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { amount, paymentMethod, transactionId, reference, notes } = req.body;
    
    const invoice = await Invoice.findById(invoiceId);
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    
    // Verify access
    if (req.user.id !== invoice.seller.toString() && 
        req.user.id !== invoice.agent.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Add payment
    await invoice.addPayment({
      amount: parseFloat(amount),
      paymentDate: new Date(),
      paymentMethod,
      transactionId,
      reference,
      notes,
      recordedBy: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Payment recorded successfully',
      data: invoice
    });
    
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record payment'
    });
  }
}));

module.exports = router;