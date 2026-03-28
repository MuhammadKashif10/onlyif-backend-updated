const Invoice = require('../models/Invoice');
const Property = require('../models/Property');
const User = require('../models/User');
const InvoiceNotificationService = require('../services/invoiceNotificationService');
const { successResponse, errorResponse } = require('../utils/responseFormatter');

/**
 * @desc    Get all invoices for a seller
 * @route   GET /api/seller/invoices
 * @access  Private (Seller only)
 */
const getSellerInvoices = async (req, res) => {
  try {
    if (req.user.role !== 'seller') {
      return res.status(403).json(
        errorResponse('Access denied. Seller role required.', 403)
      );
    }

    const { status, page = 1, limit = 10, sortBy = 'createdAt', order = 'desc' } = req.query;

    // Build query
    const query = { seller: req.user.id };
    if (status && status !== 'all') {
      query.status = status;
    }

    // Get invoices with pagination
    const invoices = await Invoice.find(query)
      .populate('property', 'title address price images mainImage')
      .populate('agent', 'name email phone')
      .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Invoice.countDocuments(query);

    // Calculate summary statistics
    const stats = await Invoice.aggregate([
      { $match: { seller: req.user._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

    const summary = {
      totalInvoices: total,
      pendingCount: stats.find(s => s._id === 'pending')?.count || 0,
      paidCount: stats.find(s => s._id === 'paid')?.count || 0,
      overdueCount: stats.find(s => s._id === 'overdue')?.count || 0,
      totalPendingAmount: stats.find(s => s._id === 'pending')?.totalAmount || 0,
      totalPaidAmount: stats.find(s => s._id === 'paid')?.totalAmount || 0
    };

    return res.json(
      successResponse({
        invoices,
        pagination: {
          current: parseInt(page),
          totalPages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        },
        summary
      }, 'Invoices retrieved successfully')
    );

  } catch (error) {
    console.error('Error fetching seller invoices:', error);
    return res.status(500).json(
      errorResponse('Failed to fetch invoices', 500)
    );
  }
};

/**
 * @desc    Get single invoice details for seller
 * @route   GET /api/seller/invoices/:id
 * @access  Private (Seller only)
 */
const getSellerInvoiceDetails = async (req, res) => {
  try {
    if (req.user.role !== 'seller') {
      return res.status(403).json(
        errorResponse('Access denied. Seller role required.', 403)
      );
    }

    const { id } = req.params;

    const invoice = await Invoice.findOne({
      _id: id,
      seller: req.user.id
    })
      .populate('property', 'title address price images mainImage')
      .populate('agent', 'name email phone')
      .populate('seller', 'name email phone');

    if (!invoice) {
      return res.status(404).json(
        errorResponse('Invoice not found', 404)
      );
    }

    // Mark invoice as viewed if it hasn't been viewed yet
    if (invoice.status === 'sent') {
      invoice.status = 'viewed';
      await invoice.save();
    }

    return res.json(
      successResponse(invoice, 'Invoice details retrieved successfully')
    );

  } catch (error) {
    console.error('Error fetching invoice details:', error);
    return res.status(500).json(
      errorResponse('Failed to fetch invoice details', 500)
    );
  }
};

/**
 * @desc    Download invoice PDF
 * @route   GET /api/seller/invoices/:id/download
 * @access  Private (Seller only)
 */
const downloadInvoicePDF = async (req, res) => {
  try {
    if (req.user.role !== 'seller') {
      return res.status(403).json(
        errorResponse('Access denied. Seller role required.', 403)
      );
    }

    const { id } = req.params;

    const invoice = await Invoice.findOne({
      _id: id,
      seller: req.user.id
    })
      .populate('property', 'title address price')
      .populate('agent', 'name email phone')
      .populate('seller', 'name email phone');

    if (!invoice) {
      return res.status(404).json(
        errorResponse('Invoice not found', 404)
      );
    }

    // For now, return invoice data for PDF generation on frontend
    // In production, you would generate PDF here using libraries like puppeteer or jsPDF
    const invoiceData = {
      invoice: invoice.toObject(),
      downloadUrl: `/api/seller/invoices/${id}/pdf`, // Future PDF endpoint
      generatedAt: new Date().toISOString()
    };

    return res.json(
      successResponse(invoiceData, 'Invoice data prepared for download')
    );

  } catch (error) {
    console.error('Error preparing invoice download:', error);
    return res.status(500).json(
      errorResponse('Failed to prepare invoice download', 500)
    );
  }
};

/**
 * @desc    Record payment for invoice (mock payment)
 * @route   POST /api/seller/invoices/:id/pay
 * @access  Private (Seller only)
 */
const recordInvoicePayment = async (req, res) => {
  try {
    if (req.user.role !== 'seller') {
      return res.status(403).json(
        errorResponse('Access denied. Seller role required.', 403)
      );
    }

    const { id } = req.params;
    const { paymentMethod = 'bank_transfer', reference, notes } = req.body;

    const invoice = await Invoice.findOne({
      _id: id,
      seller: req.user.id
    });

    if (!invoice) {
      return res.status(404).json(
        errorResponse('Invoice not found', 404)
      );
    }

    if (invoice.status === 'paid') {
      return res.status(400).json(
        errorResponse('Invoice is already paid', 400)
      );
    }

    // Record the payment
    const payment = {
      amount: invoice.totalAmount,
      paymentDate: new Date(),
      paymentMethod,
      transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      reference: reference || '',
      notes: notes || '',
      recordedBy: req.user.id,
      recordedAt: new Date()
    };

    await invoice.addPayment(payment);

    // Log payment activity
    console.log(`💰 Payment recorded for invoice ${invoice.invoiceNumber}: A$${invoice.totalAmount}`);

    return res.json(
      successResponse({
        invoice: invoice.toObject(),
        payment: payment,
        message: 'Payment recorded successfully'
      }, 'Payment processed successfully')
    );

  } catch (error) {
    console.error('Error recording invoice payment:', error);
    return res.status(500).json(
      errorResponse('Failed to record payment', 500)
    );
  }
};

/**
 * @desc    Get seller notifications related to invoices
 * @route   GET /api/seller/notifications/invoices
 * @access  Private (Seller only)
 */
const getInvoiceNotifications = async (req, res) => {
  try {
    if (req.user.role !== 'seller') {
      return res.status(403).json(
        errorResponse('Access denied. Seller role required.', 403)
      );
    }

    const Notification = require('../models/Notification');
    const { page = 1, limit = 20, status = 'all' } = req.query;

    const query = {
      recipient: req.user.id,
      type: { $in: ['invoice_generated', 'invoice_overdue', 'payment_received'] }
    };

    if (status !== 'all') {
      query.isRead = status === 'read';
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      recipient: req.user.id,
      type: { $in: ['invoice_generated', 'invoice_overdue', 'payment_received'] },
      isRead: false
    });

    return res.json(
      successResponse({
        notifications,
        pagination: {
          current: parseInt(page),
          totalPages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        },
        unreadCount
      }, 'Invoice notifications retrieved successfully')
    );

  } catch (error) {
    console.error('Error fetching invoice notifications:', error);
    return res.status(500).json(
      errorResponse('Failed to fetch invoice notifications', 500)
    );
  }
};

module.exports = {
  getSellerInvoices,
  getSellerInvoiceDetails,
  downloadInvoicePDF,
  recordInvoicePayment,
  getInvoiceNotifications
};