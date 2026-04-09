const express = require('express');
const router = express.Router();
const buyerController = require('../controllers/buyerController');
const authMiddleware = require('../middleware/authMiddleware');
const { allowBuyer } = require('../middleware/roleMiddleware');

// Apply authentication middleware to all routes
router.use(authMiddleware);
router.use(allowBuyer);

// Profile Management
router.post('/profile', buyerController.createProfile);
router.get('/profile', buyerController.getProfile);
router.put('/profile', buyerController.updateProfile);

// Notifications
router.get('/notifications', buyerController.getNotifications);
router.put('/notifications/:notificationId/read', buyerController.markNotificationRead);
router.put('/notifications/read-all', buyerController.markAllNotificationsRead);

// Saved Searches
router.post('/saved-searches', buyerController.createSavedSearch);
router.get('/saved-searches', buyerController.getSavedSearches);
router.put('/saved-searches/:searchId', buyerController.updateSavedSearch);
router.delete('/saved-searches/:searchId', buyerController.deleteSavedSearch);

// Recommendations
router.get('/recommendations', buyerController.getRecommendations);

// Dashboard Stats
router.get('/dashboard-stats', buyerController.getDashboardStats);

// Unlocked Properties
router.get('/unlocked-properties', buyerController.getUnlockedProperties);

// Property Watchlist and Tracking
const { asyncHandler } = require('../middleware/errorHandler');
const Property = require('../models/Property');
const PropertyStatusHistory = require('../models/PropertyStatusHistory');
const User = require('../models/User');
const mongoose = require('mongoose');

// Buyer Watchlist Model (simple implementation)
const buyerWatchlistSchema = new mongoose.Schema({
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
    index: true
  },
  dateAdded: {
    type: Date,
    default: Date.now
  },
  notifications: {
    statusUpdates: {
      type: Boolean,
      default: true
    },
    priceChanges: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate entries
buyerWatchlistSchema.index({ buyer: 1, property: 1 }, { unique: true });

// Check if model already exists to avoid re-compilation error
const BuyerWatchlist = mongoose.models.BuyerWatchlist || mongoose.model('BuyerWatchlist', buyerWatchlistSchema);

// Get buyer watchlist
router.get('/watchlist', asyncHandler(async (req, res) => {
  try {
    const watchlist = await BuyerWatchlist.find({ buyer: req.user._id })
      .populate({
        path: 'property',
        select: 'title address price salesStatus status images mainImage primaryImage finalImageUrl beds baths carSpaces description agents',
        populate: {
          path: 'agents',
          select: 'name email phone'
        }
      })
      .sort({ dateAdded: -1 });
    
    // Transform data and add computed fields
    const watchlistWithComputed = watchlist
      .filter(item => item.property) // Ensure property exists
      .map(item => ({
        _id: item.property._id,
      title: item.property.title,
      address: item.property.address,
      price: item.property.price,
      salesStatus: item.property.salesStatus,
      status: item.property.status,
      images: item.property.images,
      mainImage: item.property.mainImage,
      primaryImage: item.property.primaryImage,
      finalImageUrl: item.property.finalImageUrl,
      beds: item.property.beds,
      baths: item.property.baths,
      carSpaces: item.property.carSpaces,
      description: item.property.description,
      agent: item.property.agents && item.property.agents.length > 0 ? item.property.agents[0] : null,
      dateAdded: item.dateAdded,
      isWatching: true,
      notifications: item.notifications
    }));
    
    res.json({
      success: true,
      data: watchlistWithComputed
    });
    
  } catch (error) {
    console.error('Error fetching buyer watchlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch watchlist'
    });
  }
}));

// Add property to watchlist
router.post('/watchlist/:propertyId', asyncHandler(async (req, res) => {
  try {
    const { propertyId } = req.params;
    console.log(`[WATCHLIST_ADD] Received propertyId: "${propertyId}" (type: ${typeof propertyId})`);
    
    // Check if propertyId is a valid hex string of 24 characters
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      console.warn(`[WATCHLIST_ADD] Invalid propertyId format detected: "${propertyId}"`);
      return res.status(400).json({
        success: false,
        message: 'Invalid property ID format'
      });
    }
    
    // Explicitly cast to ObjectId
    const oid = new mongoose.Types.ObjectId(propertyId);
    
    // Verify property exists
    const property = await Property.findById(oid);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    // Check if already in watchlist to handle toggle (if needed) or just add
    // The requirement says: "If not -> push to favorites and save. If yes -> remove from favorites (toggle behavior)"
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isFavorite = user.favorites.some(id => id.toString() === propertyId);
    
    if (isFavorite) {
      // Toggle: Remove from watchlist
      await BuyerWatchlist.findOneAndDelete({ buyer: req.user._id, property: oid });
      await User.findByIdAndUpdate(req.user._id, { $pull: { favorites: oid } });
      
      console.log(`❌ Property ${property.title} removed from watchlist (toggle) for buyer ${req.user.name}`);
      return res.json({
        success: true,
        message: 'Property removed from watchlist',
        isWatching: false
      });
    } else {
      // Toggle: Add to watchlist
      const watchlistItem = await BuyerWatchlist.findOneAndUpdate(
        { buyer: req.user._id, property: oid },
        { 
          buyer: req.user._id, 
          property: oid,
          dateAdded: new Date()
        },
        { upsert: true, new: true }
      );
      
      await User.findByIdAndUpdate(req.user._id, { $addToSet: { favorites: oid } });
      
      console.log(`⭐ Property ${property.title} added to watchlist for buyer ${req.user.name}`);
      return res.json({
        success: true,
        message: 'Property added to watchlist',
        data: watchlistItem,
        isWatching: true
      });
    }
    
  } catch (error) {
    console.error('[WATCHLIST_ADD_ERROR]:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating watchlist',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// Remove property from watchlist
router.delete('/watchlist/:propertyId', asyncHandler(async (req, res) => {
  try {
    const { propertyId } = req.params;
    console.log(`[WATCHLIST_REMOVE] Received propertyId: "${propertyId}"`);
    
    // Verify propertyId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid property ID format'
      });
    }
    
    const result = await BuyerWatchlist.findOneAndDelete({
      buyer: req.user._id,
      property: new mongoose.Types.ObjectId(propertyId)
    });
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Property not found in watchlist'
      });
    }
    
    // Also remove from User's favorites array
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { favorites: new mongoose.Types.ObjectId(propertyId) }
    });
    
    console.log(`❌ Property removed from watchlist for buyer ${req.user.name}`);
    
    res.json({
      success: true,
      message: 'Property removed from watchlist'
    });
    
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove property from watchlist'
    });
  }
}));

// Get property status updates for buyer
router.get('/property-updates', asyncHandler(async (req, res) => {
  try {
    // Get properties in buyer's watchlist
    const watchlistItems = await BuyerWatchlist.find({ buyer: req.user._id })
      .select('property')
      .lean();
    
    const watchedPropertyIds = watchlistItems.map(item => item.property);
    
    if (watchedPropertyIds.length === 0) {
      return res.json({
        success: true,
        data: []
      });
    }
    
    // Get status updates for watched properties
    const statusUpdates = await PropertyStatusHistory.find({
      property: { $in: watchedPropertyIds }
    })
      .populate({
        path: 'property',
        select: 'title address price salesStatus'
      })
      .populate('updatedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50); // Limit to recent 50 updates
    
    // Transform data
    const updatesWithDetails = statusUpdates.map(update => ({
      _id: update._id,
      property: {
        _id: update.property._id,
        title: update.property.title,
        address: update.property.address,
        price: update.property.price
      },
      previousStatus: update.previousStatus,
      newStatus: update.newStatus,
      updatedAt: update.createdAt,
      agent: {
        name: update.updatedBy?.name || 'System',
        email: update.updatedBy?.email || ''
      },
      details: update.details
    }));
    
    res.json({
      success: true,
      data: updatesWithDetails
    });
    
  } catch (error) {
    console.error('Error fetching property updates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch property updates'
    });
  }
}));

module.exports = router;
