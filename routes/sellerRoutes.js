const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateMongoId } = require('../middleware/validationMiddleware');
const { getSellerProperties } = require('../controllers/propertyController');
const { getSellerOverview, getSellerListings, getSellerAnalytics } = require('../controllers/sellerController');

// All seller routes require authentication
router.use(authMiddleware);

// Seller overview statistics
router.get('/:id/overview', asyncHandler(getSellerOverview));

// Seller analytics with detailed chart data
router.get('/:id/analytics', asyncHandler(getSellerAnalytics));

// Helper to reuse controller with req.user.id
const useUserIdParam = (req, res, next) => {
  req.params.id = req.user.id.toString();
  next();
};

// Seller listings (secure, validated)
router.get('/:id/listings', validateMongoId, asyncHandler(getSellerListings));

// Companion route: /sellers/me/listings
router.get('/me/listings', useUserIdParam, asyncHandler(getSellerListings));

// Legacy route (keeping for backward compatibility)
router.get('/properties', asyncHandler(getSellerProperties));

module.exports = router;