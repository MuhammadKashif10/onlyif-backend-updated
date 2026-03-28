const express = require('express');
const router = express.Router();
const {
  getSellerInvoices,
  getSellerInvoiceDetails,
  downloadInvoicePDF,
  recordInvoicePayment,
  getInvoiceNotifications
} = require('../controllers/sellerInvoiceController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Apply seller role middleware to all routes
router.use(roleMiddleware(['seller']));

// @route   GET /api/seller/invoices
// @desc    Get all invoices for seller
// @access  Private (Seller only)
router.get('/', getSellerInvoices);

// @route   GET /api/seller/invoices/:id
// @desc    Get single invoice details
// @access  Private (Seller only)
router.get('/:id', getSellerInvoiceDetails);

// @route   GET /api/seller/invoices/:id/download
// @desc    Download invoice PDF
// @access  Private (Seller only)
router.get('/:id/download', downloadInvoicePDF);

// @route   POST /api/seller/invoices/:id/pay
// @desc    Record payment for invoice
// @access  Private (Seller only)
router.post('/:id/pay', recordInvoicePayment);

// @route   GET /api/seller/notifications/invoices
// @desc    Get seller notifications related to invoices
// @access  Private (Seller only)
router.get('/notifications/invoices', getInvoiceNotifications);

module.exports = router;