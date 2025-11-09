const Property = require('../models/Property');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const stripeService = require('../services/stripeService');
const { successResponse, errorResponse } = require('../utils/responseFormatter');
const BuyerProfile = require('../models/BuyerProfile');
const BuyerNotification = require('../models/BuyerNotification');
const SavedSearch = require('../models/SavedSearch');
const Purchase = require('../models/Purchase');

// @desc    Purchase property unlock ($49)
// @route   POST /api/buyer/unlock-property
// @access  Private (Buyer only)
const unlockProperty = async (req, res) => {
  const { propertyId, paymentData } = req.body;

  // Validate property exists
  const property = await Property.findById(propertyId);
  if (!property) {
    return res.status(404).json(
      errorResponse('Property not found', 404)
    );
  }

  // Check if user is a buyer
  if (req.user.role !== 'buyer') {
    return res.status(403).json(
      errorResponse('Only buyers can unlock properties', 403)
    );
  }

  // Check if property is already unlocked by this user
  const existingTransaction = await Transaction.findOne({
    user: req.user.id,
    property: propertyId,
    items: { $elemMatch: { addonType: 'property_unlock' } },
    status: 'succeeded'
  });

  if (existingTransaction) {
    return res.status(400).json(
      errorResponse('Property already unlocked by this user', 400)
    );
  }

  const unlockAmount = 4900; // A$49.00 in cents
  // Create Stripe PaymentIntent for property unlock
  const paymentIntent = await stripeService.createPaymentIntent(
    unlockAmount,
    'aud', // Changed from 'usd' to 'aud'
    {
      userId: req.user.id,
      propertyId,
      type: 'property_unlock'
    }
  );

  // Create transaction record
  const transaction = await Transaction.create({
    user: req.user.id,
    property: propertyId,
    items: [{
      addonType: 'property_unlock',
      unitPrice: unlockAmount,
      qty: 1
    }],
    amount: unlockAmount,
    stripePaymentIntentId: paymentIntent.id,
    status: paymentIntent.status
  });

  // If payment succeeded (for demo purposes, we'll mark as succeeded)
  if (paymentIntent.status === 'succeeded' || process.env.NODE_ENV === 'development') {
    // Update transaction status
    transaction.status = 'succeeded';
    await transaction.save();
  
    // Update user's unlocked properties (if you have such a field)
    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { unlockedProperties: propertyId }
    });
  }

  res.json(
    successResponse({
      success: true,
      data: {
        transactionId: transaction._id,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: unlockAmount,
        status: transaction.status,
        propertyId: propertyId,
        userName: req.user.name
      }
    }, 'Property unlock payment processed successfully')
  );
};

// @desc    Get buyer's unlocked properties
// @route   GET /api/buyer/unlocked-properties
// @access  Private (Buyer only)
const getUnlockedProperties = async (req, res) => {
  try {
    const userId = req.user.id;

    // Collect transactions that represent successful unlocks
    const transactions = await Transaction.find({
      user: userId,
      items: { $elemMatch: { addonType: 'property_unlock' } },
      status: 'succeeded'
    }).select('property');

    // Collect purchases (Stripe checkout path) that represent paid unlocks
    const purchases = await Purchase.find({
      user: userId,
      status: 'paid'
    }).select('property');

    // Combine and dedupe property IDs
    const unlockedPropertyIds = [
      ...new Set([
        ...transactions.map(t => t.property?.toString()),
        ...purchases.map(p => p.property?.toString())
      ].filter(Boolean))
    ];

    // If nothing unlocked, return empty
    if (unlockedPropertyIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Load full property documents
    const unlockedProperties = await Property.find({
      _id: { $in: unlockedPropertyIds },
      isDeleted: false
    }).populate('owner', 'firstName lastName email');

    res.json({
      success: true,
      data: unlockedProperties
    });
  } catch (error) {
    console.error('Error fetching unlocked properties:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create buyer profile
// @route   POST /api/buyer/profile
// @access  Private (Buyer only)
const createProfile = async (req, res) => {
  try {
    const { userId } = req.user;
    
    // Check if profile already exists
    const existingProfile = await BuyerProfile.findOne({ userId });
    if (existingProfile) {
      return res.status(400).json(errorResponse('Profile already exists', 400));
    }

    const profile = new BuyerProfile({ userId, ...req.body });
    await profile.save();
    
    res.status(201).json(successResponse(profile, 'Profile created successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Error creating profile', 500, error.message));
  }
};

// @desc    Get buyer profile
// @route   GET /api/buyer/profile
// @access  Private (Buyer only)
const getProfile = async (req, res) => {
  try {
    const { userId } = req.user;
    const profile = await BuyerProfile.findOne({ userId });
    
    if (!profile) {
      return res.status(404).json(errorResponse('Profile not found', 404));
    }
    
    res.json(successResponse(profile, 'Profile retrieved successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Error retrieving profile', 500, error.message));
  }
};

// @desc    Update buyer profile
// @route   PUT /api/buyer/profile
// @access  Private (Buyer only)
const updateProfile = async (req, res) => {
  try {
    const { userId } = req.user;
    const profile = await BuyerProfile.findOneAndUpdate(
      { userId },
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!profile) {
      return res.status(404).json(errorResponse('Profile not found', 404));
    }
    
    res.json(successResponse(profile, 'Profile updated successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Error updating profile', 500, error.message));
  }
};

// @desc    Get buyer notifications
// @route   GET /api/buyer/notifications
// @access  Private (Buyer only)
const getNotifications = async (req, res) => {
  try {
    const { userId } = req.user;
    const { page = 1, limit = 20, filter = 'all' } = req.query;
    
    let query = { userId };
    if (filter === 'unread') {
      query.isRead = false;
    }
    
    const notifications = await BuyerNotification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await BuyerNotification.countDocuments(query);
    
    res.json(successResponse({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }, 'Notifications retrieved successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Error retrieving notifications', 500, error.message));
  }
};

// @desc    Mark notification as read
// @route   PUT /api/buyer/notifications/:id/read
// @access  Private (Buyer only)
const markNotificationRead = async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    
    const notification = await BuyerNotification.findOneAndUpdate(
      { _id: id, userId },
      { isRead: true },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json(errorResponse('Notification not found', 404));
    }
    
    res.json(successResponse(notification, 'Notification marked as read'));
  } catch (error) {
    res.status(500).json(errorResponse('Error marking notification as read', 500, error.message));
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/buyer/notifications/read-all
// @access  Private (Buyer only)
const markAllNotificationsRead = async (req, res) => {
  try {
    const { userId } = req.user;
    
    await BuyerNotification.updateMany(
      { userId, isRead: false },
      { isRead: true }
    );
    
    res.json(successResponse(null, 'All notifications marked as read'));
  } catch (error) {
    res.status(500).json(errorResponse('Error marking all notifications as read', 500, error.message));
  }
};

// @desc    Create saved search
// @route   POST /api/buyer/saved-searches
// @access  Private (Buyer only)
const createSavedSearch = async (req, res) => {
  try {
    const { userId } = req.user;
    const savedSearch = new SavedSearch({ userId, ...req.body });
    await savedSearch.save();
    
    res.status(201).json(successResponse(savedSearch, 'Saved search created successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Error creating saved search', 500, error.message));
  }
};

const getSavedSearches = async (req, res) => {
  try {
    const { userId } = req.user;
    const savedSearches = await SavedSearch.find({ userId, isActive: true }).sort({ createdAt: -1 });
    
    res.json(successResponse(savedSearches, 'Saved searches retrieved successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Error retrieving saved searches', 500, error.message));
  }
};

const updateSavedSearch = async (req, res) => {
  try {
    const { userId } = req.user;
    const { searchId } = req.params;
    const updates = req.body;
    
    const savedSearch = await SavedSearch.findOneAndUpdate(
      { _id: searchId, userId },
      updates,
      { new: true, runValidators: true }
    );
    
    if (!savedSearch) {
      return res.status(404).json(errorResponse('Saved search not found', 404));
    }
    
    res.json(successResponse(savedSearch, 'Saved search updated successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Error updating saved search', 500, error.message));
  }
};

const deleteSavedSearch = async (req, res) => {
  try {
    const { userId } = req.user;
    const { searchId } = req.params;
    
    const savedSearch = await SavedSearch.findOneAndUpdate(
      { _id: searchId, userId },
      { isActive: false },
      { new: true }
    );
    
    if (!savedSearch) {
      return res.status(404).json(errorResponse('Saved search not found', 404));
    }
    
    res.json(successResponse(null, 'Saved search deleted successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Error deleting saved search', 500, error.message));
  }
};

const getRecommendations = async (req, res) => {
  try {
    const { userId } = req.user;
    
    // Get buyer profile to understand preferences
    const buyerProfile = await BuyerProfile.findOne({ userId });
    if (!buyerProfile) {
      return res.status(404).json(errorResponse('Buyer profile not found', 404));
    }

    // Simple recommendation logic based on buyer preferences
    let query = { status: 'active' };
    
    if (buyerProfile.preferredPropertyTypes && buyerProfile.preferredPropertyTypes.length > 0) {
      query.propertyType = { $in: buyerProfile.preferredPropertyTypes };
    }
    
    if (buyerProfile.maxBudget) {
      query.price = { $lte: buyerProfile.maxBudget };
    }
    
    if (buyerProfile.preferredLocations && buyerProfile.preferredLocations.length > 0) {
      query.$or = buyerProfile.preferredLocations.map(location => ({
        $or: [
          { 'address.suburb': new RegExp(location, 'i') },
          { 'address.state': new RegExp(location, 'i') },
          { 'address.postcode': location }
        ]
      }));
    }
    
    const recommendations = await Property.find(query)
      .limit(10)
      .sort({ createdAt: -1 })
      .populate('owner', 'firstName lastName email');
    
    res.json(successResponse(recommendations, 'Recommendations retrieved successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Error retrieving recommendations', 500, error.message));
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const { userId } = req.user;
    
    // Get various stats for the buyer dashboard
    const savedPropertiesCount = await Property.countDocuments({ 
      savedBy: userId 
    });
    
    const viewedPropertiesCount = await Property.countDocuments({ 
      viewedBy: userId 
    });
    
    const activeOffersCount = await Transaction.countDocuments({ 
      buyer: userId,
      status: { $in: ['pending', 'negotiating'] }
    });
    
    const completedTransactionsCount = await Transaction.countDocuments({ 
      buyer: userId,
      status: 'completed'
    });
    
    const stats = {
      savedProperties: savedPropertiesCount,
      viewedProperties: viewedPropertiesCount,
      activeOffers: activeOffersCount,
      completedTransactions: completedTransactionsCount
    };
    
    res.json(successResponse(stats, 'Dashboard stats retrieved successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Error retrieving dashboard stats', 500, error.message));
  }
};

module.exports = {
  unlockProperty,
  getUnlockedProperties,
  createProfile,
  getProfile,
  updateProfile,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createSavedSearch,
  getSavedSearches,
  updateSavedSearch,
  deleteSavedSearch,
  getRecommendations,
  getDashboardStats
};