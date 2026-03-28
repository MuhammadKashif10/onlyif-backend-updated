const BuyerProfile = require('../models/BuyerProfile');
const User = require('../models/User');
const { validationResult } = require('express-validator');

// Get buyer profile
exports.getBuyerProfile = async (req, res) => {
  try {
    const profile = await BuyerProfile.findOne({ userId: req.user.id })
      .populate('viewedProperties.propertyId', 'title address price images');
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Buyer profile not found'
      });
    }

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('Error fetching buyer profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Create or update buyer profile
exports.createOrUpdateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const profileData = {
      userId: req.user.id,
      ...req.body,
      isComplete: true
    };

    const profile = await BuyerProfile.findOneAndUpdate(
      { userId: req.user.id },
      profileData,
      { new: true, upsert: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: profile
    });
  } catch (error) {
    console.error('Error updating buyer profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Add viewed property
exports.addViewedProperty = async (req, res) => {
  try {
    const { propertyId, timeSpent, rating } = req.body;

    const profile = await BuyerProfile.findOne({ userId: req.user.id });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Buyer profile not found'
      });
    }

    // Check if property already viewed
    const existingView = profile.viewedProperties.find(
      view => view.propertyId.toString() === propertyId
    );

    if (existingView) {
      // Update existing view
      existingView.viewedAt = new Date();
      existingView.timeSpent = timeSpent || existingView.timeSpent;
      existingView.rating = rating || existingView.rating;
    } else {
      // Add new view
      profile.viewedProperties.push({
        propertyId,
        timeSpent,
        rating
      });
    }

    await profile.save();

    res.json({
      success: true,
      message: 'Viewed property added successfully'
    });
  } catch (error) {
    console.error('Error adding viewed property:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Get recommendations
exports.getRecommendations = async (req, res) => {
  try {
    const profile = await BuyerProfile.findOne({ userId: req.user.id });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Buyer profile not found'
      });
    }

    // Simple recommendation logic based on preferences
    const Property = require('../models/Property');
    
    const query = {
      status: 'active'
    };

    // Add price filter
    if (profile.preferences.budget) {
      query.price = {
        $gte: profile.preferences.budget.minPrice || 0,
        $lte: profile.preferences.budget.maxPrice || 999999999
      };
    }

    // Add property type filter
    if (profile.preferences.propertyTypes && profile.preferences.propertyTypes.length > 0) {
      query.propertyType = { $in: profile.preferences.propertyTypes };
    }

    // Add location filter
    if (profile.preferences.location && profile.preferences.location.preferredCities) {
      query['address.city'] = { $in: profile.preferences.location.preferredCities };
    }

    const recommendations = await Property.find(query)
      .limit(10)
      .sort({ createdAt: -1 })
      .select('title address price images propertyType bedrooms bathrooms squareFootage');

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};