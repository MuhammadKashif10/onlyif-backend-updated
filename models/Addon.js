const mongoose = require('mongoose');

const addonSchema = new mongoose.Schema({
  // Core information
  type: {
    type: String,
    enum: ['photo', 'floorplan', 'drone', 'walkthrough', 'virtual_tour', 'staging', 'marketing_package'],
    required: [true, 'Addon type is required'],
    index: true
  },
  title: {
    type: String,
    required: [true, 'Addon title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  
  // Pricing
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative'],
    max: [50000, 'Price cannot exceed $50,000']
  },
  currency: {
    type: String,
    default: 'AUD', // Changed from 'USD' to 'AUD'
    uppercase: true,
    enum: ['USD', 'CAD', 'EUR', 'GBP', 'AUD'] // Added AUD to enum
  },
  
  // Features and specifications
  features: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    included: {
      type: Boolean,
      default: true
    }
  }],
  
  // Media and assets
  images: [{
    url: {
      type: String,
      required: true
    },
    caption: String,
    isPrimary: {
      type: Boolean,
      default: false
    },
    order: {
      type: Number,
      default: 0
    }
  }],
  
  // Availability and status
  status: {
    type: String,
    enum: ['active', 'inactive', 'discontinued', 'coming_soon'],
    default: 'active',
    index: true
  },
  availability: {
    type: String,
    enum: ['available', 'limited', 'unavailable', 'seasonal'],
    default: 'available'
  },
  
  // Property relationship
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Property is required'],
    index: true
  },
  
  // Purchase information
  purchasedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  purchasedAt: {
    type: Date,
    default: null
  },
  transaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null
  },
  
  // Service details
  serviceProvider: {
    name: {
      type: String,
      trim: true
    },
    contact: {
      email: String,
      phone: String
    },
    rating: {
      type: Number,
      min: 1,
      max: 5
    }
  },
  
  // Delivery and timeline
  estimatedDelivery: {
    type: String,
    trim: true,
    default: '3-5 business days'
  },
  deliveryDate: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  
  // Quality and specifications
  specifications: {
    resolution: String,
    format: String,
    duration: String, // for videos
    quantity: Number, // number of photos, etc.
    includes: [String]
  },
  
  // Reviews and feedback
  reviews: [{
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [500, 'Review comment cannot exceed 500 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Category and tags
  category: {
    type: String,
    enum: ['photography', 'videography', 'marketing', 'staging', 'documentation', 'technology'],
    required: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  // Soft delete implementation
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Metadata
  priority: {
    type: Number,
    default: 0,
    min: 0,
    max: 10
  },
  isPopular: {
    type: Boolean,
    default: false
  },
  salesCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
addonSchema.index({ property: 1, type: 1, status: 1, isDeleted: 1 });
addonSchema.index({ type: 1, status: 1, availability: 1, isDeleted: 1 });
addonSchema.index({ purchasedBy: 1, purchasedAt: -1, isDeleted: 1 });
addonSchema.index({ category: 1, status: 1, isDeleted: 1 });
addonSchema.index({ price: 1, status: 1, isDeleted: 1 });
addonSchema.index({ isPopular: 1, salesCount: -1, status: 1 });
addonSchema.index({ createdAt: -1, status: 1, isDeleted: 1 });

// Text search index
addonSchema.index({
  title: 'text',
  description: 'text',
  'features.name': 'text',
  tags: 'text'
}, {
  weights: {
    title: 10,
    description: 5,
    'features.name': 3,
    tags: 1
  }
});

// Pre-save middleware
addonSchema.pre('save', function(next) {
  // Set purchase timestamp when purchasedBy is set
  if (this.isModified('purchasedBy') && this.purchasedBy && !this.purchasedAt) {
    this.purchasedAt = new Date();
  }
  
  // Increment sales count when purchased
  if (this.isModified('purchasedBy') && this.purchasedBy) {
    this.salesCount += 1;
  }
  
  // Set popular flag based on sales count
  this.isPopular = this.salesCount >= 10;
  
  next();
});

// Instance methods
addonSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

addonSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

addonSchema.methods.purchase = function(buyerId, transactionId) {
  this.purchasedBy = buyerId;
  this.purchasedAt = new Date();
  this.transaction = transactionId;
  return this.save();
};

addonSchema.methods.addReview = function(reviewerId, rating, comment) {
  this.reviews.push({
    reviewer: reviewerId,
    rating: rating,
    comment: comment
  });
  return this.save();
};

addonSchema.methods.getAverageRating = function() {
  if (this.reviews.length === 0) return 0;
  const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
  return (sum / this.reviews.length).toFixed(1);
};

// Query helpers
addonSchema.query.active = function() {
  return this.where({ isDeleted: false, status: 'active' });
};

addonSchema.query.available = function() {
  return this.where({ 
    isDeleted: false, 
    status: 'active', 
    availability: { $in: ['available', 'limited'] }
  });
};

addonSchema.query.byType = function(type) {
  return this.where({ type: type, isDeleted: false });
};

addonSchema.query.byProperty = function(propertyId) {
  return this.where({ property: propertyId, isDeleted: false });
};

addonSchema.query.popular = function() {
  return this.where({ isPopular: true, isDeleted: false, status: 'active' });
};

module.exports = mongoose.model('Addon', addonSchema);