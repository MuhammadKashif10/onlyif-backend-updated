const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const {
  submitCashOffer,
  getCashOfferById,
  scheduleInspection,
  acceptCashOffer,
  updateClosingChecklist,
  completeCashOffer,
  getCashOffersByEmail
} = require('../controllers/cashOfferController');

// Public routes
router.post('/', asyncHandler(submitCashOffer));
router.get('/:offerId', asyncHandler(getCashOfferById));
router.get('/email/:email', asyncHandler(getCashOffersByEmail));
router.put('/:offerId/schedule-inspection', asyncHandler(scheduleInspection));
router.put('/:offerId/accept', asyncHandler(acceptCashOffer));
router.put('/:offerId/checklist', asyncHandler(updateClosingChecklist));
router.put('/:offerId/close', asyncHandler(completeCashOffer));

module.exports = router;