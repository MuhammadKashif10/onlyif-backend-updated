const mongoose = require('mongoose');

const buyerProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  preferences: {
    location: {
      preferredCities: [String],
      preferredStates: [String],
      maxCommute: Number, // in minutes
      avoidAreas: [String]
    },
    budget: {
      minPrice: {
        type: Number,
        required: true
      },
      maxPrice: {
        type: Number,
        required: true
      },
      preApprovalAmount: Number,
      downPaymentPercentage: Number,
      financingType: {
        type: String,
        enum: ['conventional', 'fha', 'va', 'usda', 'cash'],
        default: 'conventional'
      }
    },
    propertyTypes: {
      type: [String],
      enum: ['house', 'condo', 'townhouse', 'apartment', 'land', 'commercial'],
      default: ['house']
    },
    features: {
      minBedrooms: Number,
      minBathrooms: Number,
      minSquareFootage: Number,
      mustHave: [String], // garage, pool, fireplace, etc.
      niceToHave: [String],
      dealBreakers: [String]
    },
    lifestyle: {
      familySize: Number,
      pets: Boolean,
      workFromHome: Boolean,
      entertainingFrequency: {
        type: String,
        enum: ['never', 'rarely', 'sometimes', 'often', 'frequently']
      }
    }
  },
  notifications: {
    newListings: {
      type: Boolean,
      default: true
    },
    priceDrops: {
      type: Boolean,
      default: true
    },
    marketUpdates: {
      type: Boolean,
      default: false
    },
    savedSearchAlerts: {
      type: Boolean,
      default: true
    },
    emailFrequency: {
      type: String,
      enum: ['immediate', 'daily', 'weekly'],
      default: 'daily'
    }
  },
  searchHistory: [{
    searchCriteria: mongoose.Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now
    },
    resultsCount: Number
  }],
  viewedProperties: [{
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property'
    },
    viewedAt: {
      type: Date,
      default: Date.now
    },
    timeSpent: Number, // in seconds
    rating: {
      type: Number,
      min: 1,
      max: 5
    }
  }],
  isComplete: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
buyerProfileSchema.index({ userId: 1 });
buyerProfileSchema.index({ 'preferences.budget.minPrice': 1, 'preferences.budget.maxPrice': 1 });
buyerProfileSchema.index({ 'preferences.location.preferredCities': 1 });

module.exports = mongoose.model('BuyerProfile', buyerProfileSchema);