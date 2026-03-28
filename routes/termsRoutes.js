const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  getTermsByRole,
  acceptTerms,
  getAcceptanceStatus
} = require('../controllers/termsController');

router.get('/status', authMiddleware, asyncHandler(getAcceptanceStatus));
router.get('/:role', asyncHandler(getTermsByRole));
router.post('/accept', authMiddleware, asyncHandler(acceptTerms));

module.exports = router;