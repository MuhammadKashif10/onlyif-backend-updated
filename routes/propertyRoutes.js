const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const { uploadFields } = require('../middleware/uploadMiddleware');

// Import all controller functions
const {
  getAllProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
  assignAgent,
  getPriceCheck,
  getSellerProperties,
  getPropertyStats,
  submitPropertyPublic,
  getFilterOptions,
  getFavoriteProperties,
  createPropertyWithFiles,
  approveProperty,
  rejectProperty,
  updatePropertySalesStatus  // Add new sales status update import
} = require('../controllers/propertyController');

// Public routes
router.get('/', asyncHandler(getAllProperties));
router.get('/stats', asyncHandler(getPropertyStats));
router.get('/filter-options', asyncHandler(getFilterOptions));
router.get('/favorites/:userId?', authMiddleware, asyncHandler(getFavoriteProperties));
router.get('/:id', asyncHandler(getPropertyById));
router.get('/:id/price-check', asyncHandler(getPriceCheck));
router.post('/public-submit', asyncHandler(submitPropertyPublic));

// Protected routes (require authentication)
// Use uploadFields middleware for file uploads
router.post('/', authMiddleware, uploadFields, asyncHandler(createProperty));
// Add the missing upload route for file uploads (alternative endpoint)
router.post('/upload', authMiddleware, uploadFields, asyncHandler(createPropertyWithFiles));
router.put('/:id', authMiddleware, asyncHandler(updateProperty));
router.delete('/:id', authMiddleware, asyncHandler(deleteProperty));
router.post('/:id/assign-agent', authMiddleware, asyncHandler(assignAgent));
// Admin approval and rejection routes
router.patch('/:id/approve', authMiddleware, asyncHandler(approveProperty));
router.patch('/:id/reject', authMiddleware, asyncHandler(rejectProperty));
// Professional agent sales status update route with comprehensive validation
const {
  statusUpdateValidation,
  handleValidationErrors,
  checkStatusUpdateAuthorization,
  sanitizeStatusInput,
  logStatusUpdate,
  statusUpdateRateLimit
} = require('../middleware/statusValidationMiddleware');

// Professional status update route with validation, invoice generation, and notifications
router.patch('/:id/status', 
  logStatusUpdate,
  authMiddleware,
  sanitizeStatusInput,
  statusUpdateValidation,
  handleValidationErrors,
  checkStatusUpdateAuthorization,
  asyncHandler(updatePropertySalesStatus)
);

// Get buyers for a property
router.get('/:id/buyers', authMiddleware, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const Purchase = require('../models/Purchase');
    
    // Find all purchases for this property
    const purchases = await Purchase.find({
      property: id,
      status: { $in: ['paid', 'pending', 'processing'] } // Include various purchase statuses
    })
    .populate('user', 'name email _id')
    .lean();
    
    if (!purchases || purchases.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No buyers found for this property'
      });
    }
    
    // Transform the data to match expected format
    const buyers = purchases.map(purchase => ({
      _id: purchase.user._id,
      name: purchase.user.name,
      email: purchase.user.email,
      purchaseId: purchase._id,
      purchaseStatus: purchase.status,
      purchaseDate: purchase.createdAt
    }));
    
    res.json({
      success: true,
      data: buyers
    });
    
  } catch (error) {
    console.error('Error fetching buyers for property:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch buyers for this property'
    });
  }
}));

module.exports = router;
