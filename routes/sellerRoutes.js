const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateMongoId } = require('../middleware/validationMiddleware');
const { getSellerProperties } = require('../controllers/propertyController');
const { getSellerOverview, getSellerListings, getSellerAnalytics } = require('../controllers/sellerController');

// All seller routes require authentication
router.use(authMiddleware);

// Helper to reuse controller with req.user.id
const useUserIdParam = (req, res, next) => {
  req.params.id = req.user.id.toString();
  next();
};

// Seller overview statistics
router.get('/me/overview', useUserIdParam, asyncHandler(getSellerOverview));
router.get('/:id/overview', asyncHandler(getSellerOverview));

// Seller analytics with detailed chart data
router.get('/:id/analytics', asyncHandler(getSellerAnalytics));

// Seller listings (secure, validated)
// NOTE: the literal /me/listings MUST be declared before the parameterized
// /:id/listings — otherwise Express matches /:id/listings first with id="me"
// and validateMongoId rejects "me" as an invalid ObjectId (400 Validation failed).
router.get('/me/listings', useUserIdParam, asyncHandler(getSellerListings));
router.get('/:id/listings', validateMongoId, asyncHandler(getSellerListings));

// Legacy route (keeping for backward compatibility)
router.get('/properties', asyncHandler(getSellerProperties));

module.exports = router;
