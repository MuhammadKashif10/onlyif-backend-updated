const mongoose = require('mongoose');

const cashOfferSchema = new mongoose.Schema({
  // Property relationship (enhanced)
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Property reference is required'],
    index: true
  },
  
  // User who submitted the offer
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Submitter is required'],
    index: true
  },
  
  // Property Information (enhanced validation)
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
  
  // Contact Information (enhanced validation)
  contactName: {
    type: String,
    required: [true, 'Contact name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  contactEmail: {
    type: String,
    required: [true, 'Contact email is required'],
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
  },
  contactPhone: {
    type: String,
    trim: true,
    match: [/^\+?[1-9]\d{1,14}$/, 'Please provide a valid phone number']
  },
  
  // Offer Details (enhanced)
  offerId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  estimatedValue: {
    type: Number,
    min: [0, 'Estimated value cannot be negative'],
    max: [100000000, 'Estimated value cannot exceed $100M']
  },
  offerAmount: {
    type: Number,
    min: [0, 'Offer amount cannot be negative'],
    max: [100000000, 'Offer amount cannot exceed $100M']
  },
  
  // Property Details (enhanced validation)
  propertyType: {
    type: String,
    enum: ['single-family', 'condo', 'townhouse', 'multi-family', 'land', 'commercial'],
    required: [true, 'Property type is required']
  },
  bedrooms: {
    type: Number,
    min: [0, 'Bedrooms cannot be negative'],
    max: [20, 'Bedrooms cannot exceed 20'],
    default: 3
  },
  bathrooms: {
    type: Number,
    min: [0, 'Bathrooms cannot be negative'],
    max: [20, 'Bathrooms cannot exceed 20'],
    default: 2
  },
  squareFootage: {
    type: Number,
    min: [1, 'Square footage must be at least 1'],
    max: [50000, 'Square footage cannot exceed 50,000'],
    default: 1800
  },
  yearBuilt: {
    type: Number,
    min: [1800, 'Year built cannot be before 1800'],
    max: [new Date().getFullYear() + 2, 'Year built cannot be more than 2 years in the future']
  },
  
  // Flow Status (enhanced)
  status: {
    type: String,
    enum: ['submitted', 'under_review', 'inspection_scheduled', 'inspection_completed', 'offer_made', 'negotiating', 'accepted', 'closed', 'cancelled', 'expired'],
    default: 'submitted',
    index: true
  },
  
  // Inspection Details (enhanced)
  inspectionDate: {
    type: Date,
    validate: {
      validator: function(date) {
        return !date || date > new Date();
      },
      message: 'Inspection date must be in the future'
    }
  },
  inspectionTimeSlot: {
    type: String,
    enum: ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM']
  },
  inspectionStatus: {
    type: String,
    enum: ['pending', 'scheduled', 'completed', 'cancelled', 'rescheduled'],
    default: 'pending'
  },
  inspectionNotes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Inspection notes cannot exceed 2000 characters']
  },
  
  // Closing Details (enhanced)
  estimatedClosingDate: {
    type: Date,
    validate: {
      validator: function(date) {
        return !date || date > new Date();
      },
      message: 'Closing date must be in the future'
    }
  },
  actualClosingDate: {
    type: Date
  },
  
  // Financial Details
  fees: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Fee amount cannot be negative']
    },
    description: {
      type: String,
      trim: true
    },
    category: {
      type: String,
      enum: ['inspection', 'legal', 'administrative', 'closing', 'other'],
      default: 'other'
    }
  }],
  netProceeds: {
    type: Number,
    min: [0, 'Net proceeds cannot be negative']
  },
  
  // Closing Checklist (enhanced)
  closingChecklist: [{
    itemId: {
      type: String,
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    category: {
      type: String,
      enum: ['documentation', 'inspection', 'financial', 'legal', 'other'],
      default: 'other'
    },
    required: {
      type: Boolean,
      default: false
    },
    completed: {
      type: Boolean,
      default: false
    },
    completedAt: {
      type: Date
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Status History
  statusHistory: [{
    status: {
      type: String,
      required: true
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      trim: true
    }
  }],
  
  // Communication
  notes: {
    type: String,
    trim: true,
    maxlength: [5000, 'Notes cannot exceed 5000 characters']
  },
  internalNotes: {
    type: String,
    trim: true,
    maxlength: [5000, 'Internal notes cannot exceed 5000 characters']
  },
  
  // Timestamps
  submittedAt: {
    type: Date,
    default: Date.now
  },
  reviewedAt: {
    type: Date
  },
  acceptedAt: {
    type: Date
  },
  closedAt: {
    type: Date
  },
  
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
  
  // Priority and urgency
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  // Expiration
  expiresAt: {
    type: Date,
    validate: {
      validator: function(date) {
        return !date || date > new Date();
      },
      message: 'Expiration date must be in the future'
    }
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
cashOfferSchema.index({ property: 1, status: 1, isDeleted: 1 });
cashOfferSchema.index({ submittedBy: 1, status: 1, isDeleted: 1 });
cashOfferSchema.index({ contactEmail: 1, isDeleted: 1 });
cashOfferSchema.index({ offerId: 1, isDeleted: 1 });
cashOfferSchema.index({ status: 1, createdAt: -1, isDeleted: 1 });
cashOfferSchema.index({ 'address.zipCode': 1, status: 1, isDeleted: 1 });
cashOfferSchema.index({ propertyType: 1, status: 1, isDeleted: 1 });
cashOfferSchema.index({ inspectionDate: 1, inspectionStatus: 1 });
cashOfferSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Text search index
cashOfferSchema.index({
  contactName: 'text',
  'address.street': 'text',
  'address.city': 'text',
  notes: 'text'
});

// Pre-save middleware
cashOfferSchema.pre('save', function(next) {
  // Generate unique offer ID
  if (!this.offerId) {
    this.offerId = `OFF-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }
  
  // Set default fees if not provided
  if (!this.fees || this.fees.length === 0) {
    this.fees = [
      {
        name: 'Property Inspection',
        amount: 500,
        description: 'Professional inspection and assessment',
        category: 'inspection'
      },
      {
        name: 'Title Search & Insurance',
        amount: 1200,
        description: 'Legal title verification and insurance',
        category: 'legal'
      },
      {
        name: 'Closing Costs',
        amount: 2500,
        description: 'Escrow, recording, and other closing fees',
        category: 'closing'
      },
      {
        name: 'Processing Fee',
        amount: 800,
        description: 'Document processing and administrative costs',
        category: 'administrative'
      }
    ];
  }
  
  // Calculate net proceeds
  if (this.offerAmount && this.fees) {
    const totalFees = this.fees.reduce((sum, fee) => sum + fee.amount, 0);
    this.netProceeds = Math.max(0, this.offerAmount - totalFees);
  }
  
  // Add to status history if status changed
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      changedAt: new Date()
    });
  }
  
  // Set expiration date if not set (default 30 days)
  if (!this.expiresAt && this.isNew) {
    this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  }
  
  next();
});

// Instance methods
cashOfferSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

cashOfferSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

cashOfferSchema.methods.updateStatus = function(newStatus, changedBy, reason) {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    changedAt: new Date(),
    changedBy: changedBy,
    reason: reason
  });
  return this.save();
};

cashOfferSchema.methods.completeChecklistItem = function(itemId, completedBy) {
  const item = this.closingChecklist.id(itemId);
  if (item) {
    item.completed = true;
    item.completedAt = new Date();
    item.completedBy = completedBy;
  }
  return this.save();
};

// Query helpers
cashOfferSchema.query.active = function() {
  return this.where({ isDeleted: false });
};

cashOfferSchema.query.byStatus = function(status) {
  return this.where({ status: status, isDeleted: false });
};

cashOfferSchema.query.byProperty = function(propertyId) {
  return this.where({ property: propertyId, isDeleted: false });
};

cashOfferSchema.query.expired = function() {
  return this.where({ expiresAt: { $lt: new Date() }, isDeleted: false });
};

module.exports = mongoose.model('CashOffer', cashOfferSchema);