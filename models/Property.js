const mongoose = require('mongoose');

// Property schema definition (add missing assignedAgent field)
const propertySchema = new mongoose.Schema({
  // Required owner field (fixed)
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Property owner is required'] // Made required
  },
  
  // Basic property information
  title: {
    type: String,
    required: [true, 'Property title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  
  // Enhanced address with validation
  address: {
    street: {
      type: String,
      required: [true, 'Street address is required'],
      trim: true
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
      uppercase: true,
      minlength: [2, 'State must be at least 2 characters']
    },
    zipCode: {
      type: String,
      required: [true, 'ZIP code is required'],
      trim: true,
      match: [/^\d{5}(-\d{4})?$/, 'Please provide a valid ZIP code']
    },
    country: {
      type: String,
      default: 'US',
      uppercase: true
    }
  },
  
  // Geographic indexing (2dsphere) - CRITICAL FIX
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: false, // Make this optional
      default: [-98.5795, 39.8283], // Default to center of US
      validate: {
        validator: function(coords) {
          return coords.length === 2 && 
                 coords[0] >= -180 && coords[0] <= 180 && // longitude
                 coords[1] >= -90 && coords[1] <= 90;    // latitude
        },
        message: 'Invalid coordinates format [longitude, latitude]'
      }
    }
  },
  
  // Property details with enhanced validation
  propertyType: {
    type: String,
    enum: ['single-family', 'condo', 'townhouse', 'multi-family', 'land', 'commercial', 'apartment'],
    required: [true, 'Property type is required']
  },
  
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative'],
    max: [100000000, 'Price cannot exceed $100M']
  },
  
  beds: {
    type: Number,
    required: true,
    min: [0, 'Bedrooms cannot be negative'],
    max: [20, 'Bedrooms cannot exceed 20']
  },
  
  baths: {
    type: Number,
    required: true,
    min: [0, 'Bathrooms cannot be negative'],
    max: [50, 'Bathrooms cannot exceed 50']  // Increased limit for commercial/large properties
  },
  
  carSpaces: {
    type: Number,
    min: [0, 'Car spaces cannot be negative'],
    max: [20, 'Car spaces cannot exceed 20'],
    default: 0
  },
  squareMeters: {
    type: Number,
    required: [true, 'Square meters is required'],
    min: [1, 'Square meters must be at least 1'],
    max: [4645, 'Square meters cannot exceed 4,645'] // Converted from 50,000 sq ft
  },
  
  yearBuilt: {
    type: Number,
    min: [1800, 'Year built cannot be before 1800'],
    max: [new Date().getFullYear() + 2, 'Year built cannot be more than 2 years in the future']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },

  // Add contact information fields
  contactInfo: {
    name: {
      type: String,
      required: [true, 'Contact name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Contact email is required'],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
    },
    phone: {
      type: String,
      required: [true, 'Contact phone is required'],
      trim: true
    }
  },

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

  // Add floor plans array
  floorPlans: [{
    url: {
      type: String,
      required: true
    },
    caption: String,
    order: {
      type: Number,
      default: 0
    }
  }],

  // Add videos array
  videos: [{
    url: {
      type: String,
      required: true
    },
    caption: String,
    order: {
      type: Number,
      default: 0
    }
  }],

  // Add mainImage field for quick access
  mainImage: {
    url: {
      type: String,
      default: null
    },
    caption: String
  },

  // Add finalImageUrl for UI rendering priority
  finalImageUrl: {
    url: {
      type: String,
      default: null
    }
  },

  // Add lot size field
  lotSize: {
    type: Number,
    min: [0, 'Lot size cannot be negative'],
    max: [1000000, 'Lot size cannot exceed 1,000,000 sq ft']
  },
  
  status: {
    type: String,
    enum: ['draft', 'pending', 'review', 'active', 'sold', 'withdrawn', 'rejected'],
    default: 'pending'
  },
  // New sales status for agents to track property progress
  salesStatus: {
    type: String,
    enum: ['contract-exchanged', 'unconditional', 'settled', null],
    default: null,
    required: false
  },
  // Add primary assigned agent reference for quick access
  assignedAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Enhanced multi-agent support with history
  agents: [{
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['listing', 'selling', 'co-listing'],
      default: 'listing'
    },
    commissionRate: {
      type: Number,
      min: 0,
      max: 10,
      default: 3
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // Agent assignment history for audit trail
  agentHistory: [{
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    action: {
      type: String,
      enum: ['assigned', 'removed', 'commission_changed'],
      required: true
    },
    previousCommission: Number,
    newCommission: Number,
    reason: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  featured: {
    type: Boolean,
    default: false
  },
  
  dateListed: {
    type: Date,
    default: Date.now
  },
  
  daysOnMarket: {
    type: Number,
    default: 0
  },
  
  // Soft delete implementation - CRITICAL FIX
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
  
  // SEO and search optimization
  slug: {
    type: String,
    unique: true,
    sparse: true
  },
  
  searchKeywords: [String],
  
  // Analytics
  viewCount: {
    type: Number,
    default: 0
  },
  
  lastViewed: {
    type: Date
  }
}, {
  timestamps: true
});

// Geographic indexing for location-based searches
propertySchema.index({ location: '2dsphere' });

// Advanced compound indexes for performance
propertySchema.index({ status: 1, isDeleted: 1, dateListed: -1 });
propertySchema.index({ propertyType: 1, price: 1, isDeleted: 1 });
propertySchema.index({ 'address.city': 1, 'address.state': 1, isDeleted: 1 });
propertySchema.index({ price: 1, beds: 1, baths: 1, isDeleted: 1 });
propertySchema.index({ owner: 1, isDeleted: 1 });
propertySchema.index({ 'agents.agent': 1, 'agents.isActive': 1 });

// Text index for search functionality
propertySchema.index({
  title: 'text',
  description: 'text',
  'address.street': 'text',
  'address.city': 'text',
  searchKeywords: 'text'
}, {
  weights: {
    title: 10,
    'address.city': 5,
    description: 1,
    searchKeywords: 3
  }
});

// Pre-save middleware
propertySchema.pre('save', function(next) {
  // Calculate days on market
  if (this.dateListed) {
    const now = new Date();
    const listed = new Date(this.dateListed);
    this.daysOnMarket = Math.floor((now - listed) / (1000 * 60 * 60 * 24));
  }
  
  // Generate slug
  if (this.isModified('title') || this.isModified('address')) {
    const slugBase = `${this.title}-${this.address.city}-${this.address.state}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    this.slug = `${slugBase}-${this._id.toString().slice(-6)}`;
  }
  
  next();
});

// Soft delete methods
propertySchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

propertySchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

// Query helpers
propertySchema.query.active = function() {
  return this.where({ isDeleted: false });
};

propertySchema.query.deleted = function() {
  return this.where({ isDeleted: true });
};

module.exports = mongoose.model('Property', propertySchema);