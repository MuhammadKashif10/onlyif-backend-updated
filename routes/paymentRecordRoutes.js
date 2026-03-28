const express = require('express');
const router = express.Router();
const PaymentRecord = require('../models/PaymentRecord');
const authMiddleware = require('../middleware/authMiddleware');
const { allowAdmin } = require('../middleware/roleMiddleware');
const { body, validationResult } = require('express-validator');

// @desc    Create payment record
// @route   POST /api/admin/payment-records
// @access  Admin/System
router.post('/', [
  // Validation middleware
  body('seller').notEmpty().withMessage('Seller ID is required'),
  body('agent').notEmpty().withMessage('Agent ID is required'),
  body('property').notEmpty().withMessage('Property ID is required'),
  body('invoice').notEmpty().withMessage('Invoice ID is required'),
  body('amount').isNumeric().withMessage('Amount must be a number'),
  body('invoiceDetails.invoiceNumber').notEmpty().withMessage('Invoice number is required'),
  body('propertyDetails.title').notEmpty().withMessage('Property title is required'),
  body('sellerDetails.name').notEmpty().withMessage('Seller name is required'),
  body('sellerDetails.email').isEmail().withMessage('Seller email must be valid'),
  body('agentDetails.name').notEmpty().withMessage('Agent name is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      seller,
      agent,
      property,
      invoice,
      amount,
      currency = 'AUD',
      invoiceDetails,
      propertyDetails,
      sellerDetails,
      agentDetails
    } = req.body;

    console.log('📝 Creating payment record with data:', {
      seller,
      agent,
      property,
      invoice,
      amount,
      invoiceNumber: invoiceDetails.invoiceNumber
    });

    // Create payment record
    const paymentRecord = new PaymentRecord({
      seller,
      agent,
      property,
      invoice,
      amount,
      currency,
      status: 'pending',
      invoiceDetails,
      propertyDetails,
      sellerDetails,
      agentDetails,
      paymentInitiatedAt: new Date()
    });

    await paymentRecord.save();

    console.log('✅ Payment record created successfully:', paymentRecord._id);

    res.status(201).json({
      success: true,
      message: 'Payment record created successfully',
      data: paymentRecord
    });

  } catch (error) {
    console.error('❌ Error creating payment record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment record',
      error: error.message
    });
  }
});

// @desc    Get all pending payments (Admin Dashboard)
// @route   GET /api/admin/payment-records/pending
// @access  Admin
router.get('/pending', authMiddleware, allowAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = req.query;

    console.log('📊 Fetching pending payments for admin dashboard...');

    const options = {
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit),
      sortBy: sort,
      sortOrder: order
    };

    const pendingPayments = await PaymentRecord.getPendingPayments(options);
    const totalPending = await PaymentRecord.countDocuments({ status: 'pending' });

    console.log(`✅ Found ${pendingPayments.length} pending payments`);

    res.json({
      success: true,
      data: {
        payments: pendingPayments,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalPending / parseInt(limit)),
          totalRecords: totalPending,
          hasNext: parseInt(page) * parseInt(limit) < totalPending,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching pending payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending payments',
      error: error.message
    });
  }
});

// @desc    Get payment statistics (Admin Dashboard)
// @route   GET /api/admin/payment-records/stats
// @access  Admin
router.get('/stats', authMiddleware, allowAdmin, async (req, res) => {
  try {
    console.log('📊 Fetching payment statistics...');

    const [paymentStats, overduePayments] = await Promise.all([
      PaymentRecord.getPaymentStats(),
      PaymentRecord.getOverduePayments()
    ]);

    // Process stats for easier consumption
    const stats = {
      pending: { count: 0, totalAmount: 0 },
      completed: { count: 0, totalAmount: 0 },
      failed: { count: 0, totalAmount: 0 },
      processing: { count: 0, totalAmount: 0 },
      overdue: { count: overduePayments.length, totalAmount: 0 }
    };

    if (paymentStats && paymentStats[0]) {
      paymentStats[0].stats.forEach(stat => {
        if (stats[stat.status]) {
          stats[stat.status] = {
            count: stat.count,
            totalAmount: stat.totalAmount
          };
        }
      });
    }

    // Calculate overdue amount
    stats.overdue.totalAmount = overduePayments.reduce((total, payment) => total + payment.amount, 0);

    console.log('✅ Payment statistics calculated:', stats);

    res.json({
      success: true,
      data: {
        stats,
        overduePayments: overduePayments.slice(0, 10), // Top 10 overdue payments
        totalOverdueAmount: stats.overdue.totalAmount,
        overdueCount: stats.overdue.count
      }
    });

  } catch (error) {
    console.error('❌ Error fetching payment statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment statistics',
      error: error.message
    });
  }
});

// @desc    Get payment record by ID
// @route   GET /api/admin/payment-records/:id
// @access  Admin
router.get('/:id', authMiddleware, allowAdmin, async (req, res) => {
  try {
    const paymentRecord = await PaymentRecord.findById(req.params.id)
      .populate('seller', 'name email')
      .populate('agent', 'name email')
      .populate('property', 'title address price')
      .populate('invoice');

    if (!paymentRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    res.json({
      success: true,
      data: paymentRecord
    });

  } catch (error) {
    console.error('❌ Error fetching payment record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment record',
      error: error.message
    });
  }
});

// @desc    Update payment record status (mainly for webhook)
// @route   PUT /api/admin/payment-records/:id/status
// @access  System/Webhook
router.put('/:id/status', async (req, res) => {
  try {
    const { status, stripeData, errorDetails } = req.body;
    
    console.log(`📝 Updating payment record ${req.params.id} status to: ${status}`);

    const paymentRecord = await PaymentRecord.findById(req.params.id);
    
    if (!paymentRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    // Update based on status
    if (status === 'completed' && stripeData) {
      await paymentRecord.markAsCompleted(stripeData);
      console.log('✅ Payment record marked as completed');
    } else if (status === 'failed' && errorDetails) {
      await paymentRecord.markAsFailed(errorDetails);
      console.log('❌ Payment record marked as failed');
    } else {
      // General status update
      paymentRecord.status = status;
      await paymentRecord.save();
      console.log(`📝 Payment record status updated to: ${status}`);
    }

    res.json({
      success: true,
      message: 'Payment record updated successfully',
      data: paymentRecord
    });

  } catch (error) {
    console.error('❌ Error updating payment record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment record',
      error: error.message
    });
  }
});

// @desc    Update payment record by Stripe Payment Intent ID (for webhooks)
// @route   PUT /api/admin/payment-records/stripe/:paymentIntentId
// @access  System/Webhook
router.put('/stripe/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const { status, transactionId, paymentMethod } = req.body;
    
    console.log(`🔍 Finding payment record by Stripe Payment Intent ID: ${paymentIntentId}`);

    const paymentRecord = await PaymentRecord.findOne({ 
      stripePaymentIntentId: paymentIntentId 
    });
    
    if (!paymentRecord) {
      console.log('⚠️ Payment record not found for Payment Intent:', paymentIntentId);
      return res.status(404).json({
        success: false,
        message: 'Payment record not found for this Payment Intent'
      });
    }

    console.log(`📝 Updating payment record ${paymentRecord._id} from Stripe webhook`);

    if (status === 'succeeded') {
      await paymentRecord.markAsCompleted({
        transactionId,
        paymentIntentId,
        paymentMethod
      });
      console.log('✅ Payment record marked as completed from Stripe webhook');
    } else if (status === 'failed') {
      await paymentRecord.markAsFailed({
        code: 'stripe_payment_failed',
        message: 'Payment failed in Stripe',
        details: { paymentIntentId, status }
      });
      console.log('❌ Payment record marked as failed from Stripe webhook');
    } else {
      paymentRecord.status = status === 'processing' ? 'processing' : 'pending';
      await paymentRecord.save();
      console.log(`📝 Payment record status updated to: ${paymentRecord.status}`);
    }

    res.json({
      success: true,
      message: 'Payment record updated from Stripe webhook',
      data: {
        id: paymentRecord._id,
        status: paymentRecord.status,
        amount: paymentRecord.amount,
        updatedAt: paymentRecord.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Error updating payment record from Stripe webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment record from webhook',
      error: error.message
    });
  }
});

// @desc    Add admin notes to payment record
// @route   PUT /api/admin/payment-records/:id/notes
// @access  Admin
router.put('/:id/notes', authMiddleware, allowAdmin, [
  body('notes').isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { notes } = req.body;
    
    const paymentRecord = await PaymentRecord.findByIdAndUpdate(
      req.params.id,
      { adminNotes: notes },
      { new: true }
    );
    
    if (!paymentRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    res.json({
      success: true,
      message: 'Admin notes updated successfully',
      data: paymentRecord
    });

  } catch (error) {
    console.error('❌ Error updating admin notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update admin notes',
      error: error.message
    });
  }
});

module.exports = router;