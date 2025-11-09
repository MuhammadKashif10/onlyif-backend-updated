const SavedSearch = require('../models/SavedSearch');
const Property = require('../models/Property');
const BuyerNotification = require('../models/BuyerNotification');
const { validationResult } = require('express-validator');

// Get all saved searches for user
exports.getSavedSearches = async (req, res) => {
  try {
    const searches = await SavedSearch.find({ 
      userId: req.user.id,
      isActive: true 
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: searches
    });
  } catch (error) {
    console.error('Error fetching saved searches:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Create new saved search
exports.createSavedSearch = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const savedSearch = new SavedSearch({
      userId: req.user.id,
      ...req.body
    });

    await savedSearch.save();

    res.status(201).json({
      success: true,
      message: 'Saved search created successfully',
      data: savedSearch
    });
  } catch (error) {
    console.error('Error creating saved search:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Update saved search
exports.updateSavedSearch = async (req, res) => {
  try {
    const { id } = req.params;
    
    const savedSearch = await SavedSearch.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!savedSearch) {
      return res.status(404).json({
        success: false,
        message: 'Saved search not found'
      });
    }

    res.json({
      success: true,
      message: 'Saved search updated successfully',
      data: savedSearch
    });
  } catch (error) {
    console.error('Error updating saved search:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Delete saved search
exports.deleteSavedSearch = async (req, res) => {
  try {
    const { id } = req.params;
    
    const savedSearch = await SavedSearch.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { isActive: false },
      { new: true }
    );

    if (!savedSearch) {
      return res.status(404).json({
        success: false,
        message: 'Saved search not found'
      });
    }

    res.json({
      success: true,
      message: 'Saved search deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting saved search:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Execute saved search
exports.executeSavedSearch = async (req, res) => {
  try {
    const { id } = req.params;
    
    const savedSearch = await SavedSearch.findOne({
      _id: id,
      userId: req.user.id,
      isActive: true
    });

    if (!savedSearch) {
      return res.status(404).json({
        success: false,
        message: 'Saved search not found'
      });
    }

    // Build query from search criteria
    const query = { status: 'active' };
    const criteria = savedSearch.searchCriteria;

    if (criteria.priceRange) {
      query.price = {};
      if (criteria.priceRange.min) query.price.$gte = criteria.priceRange.min;
      if (criteria.priceRange.max) query.price.$lte = criteria.priceRange.max;
    }

    if (criteria.propertyType && criteria.propertyType.length > 0) {
      query.propertyType = { $in: criteria.propertyType };
    }

    if (criteria.location) {
      if (criteria.location.city) query['address.city'] = criteria.location.city;
      if (criteria.location.state) query['address.state'] = criteria.location.state;
      if (criteria.location.zipCode) query['address.zipCode'] = criteria.location.zipCode;
    }

    if (criteria.bedrooms) {
      if (criteria.bedrooms.min) query.bedrooms = { $gte: criteria.bedrooms.min };
      if (criteria.bedrooms.max) {
        query.bedrooms = query.bedrooms || {};
        query.bedrooms.$lte = criteria.bedrooms.max;
      }
    }

    if (criteria.bathrooms) {
      if (criteria.bathrooms.min) query.bathrooms = { $gte: criteria.bathrooms.min };
      if (criteria.bathrooms.max) {
        query.bathrooms = query.bathrooms || {};
        query.bathrooms.$lte = criteria.bathrooms.max;
      }
    }

    const properties = await Property.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    // Update match count
    savedSearch.matchCount = properties.length;
    await savedSearch.save();

    res.json({
      success: true,
      data: {
        savedSearch,
        properties,
        totalMatches: properties.length
      }
    });
  } catch (error) {
    console.error('Error executing saved search:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};