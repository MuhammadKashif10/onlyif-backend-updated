const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  searchCriteria: {
    location: {
      city: String,
      state: String,
      zipCode: String,
      radius: Number // in miles
    },
    priceRange: {
      min: Number,
      max: Number
    },
    propertyType: {
      type: [String],
      enum: ['house', 'condo', 'townhouse', 'apartment', 'land', 'commercial']
    },
    bedrooms: {
      min: Number,
      max: Number
    },
    bathrooms: {
      min: Number,
      max: Number
    },
    squareFootage: {
      min: Number,
      max: Number
    },
    features: [String], // pool, garage, fireplace, etc.
    keywords: String
  },
  alertSettings: {
    emailAlerts: {
      type: Boolean,
      default: true
    },
    pushNotifications: {
      type: Boolean,
      default: true
    },
    frequency: {
      type: String,
      enum: ['immediate', 'daily', 'weekly'],
      default: 'daily'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastMatchCount: {
    type: Number,
    default: 0
  },
  lastChecked: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
savedSearchSchema.index({ userId: 1, isActive: 1 });
savedSearchSchema.index({ 'searchCriteria.location.city': 1 });
savedSearchSchema.index({ 'searchCriteria.priceRange.min': 1, 'searchCriteria.priceRange.max': 1 });

module.exports = mongoose.model('SavedSearch', savedSearchSchema);