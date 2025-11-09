const mongoose = require('mongoose');

const inspectionSchema = new mongoose.Schema({
  // Core relationships
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Property is required'],
    index: true
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Agent is required'],
    validate: {
      validator: async function(agentId) {
        const User = mongoose.model('User');
        const agent = await User.findById(agentId);
        return agent && agent.role === 'agent';
      },
      message: 'Referenced user must be an agent'
    }
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Buyer is required'],
    validate: {
      validator: async function(buyerId) {
        const User = mongoose.model('User');
        const buyer = await User.findById(buyerId);
        return buyer && buyer.role === 'buyer';
      },
      message: 'Referenced user must be a buyer'
    }
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Seller is required'],
    validate: {
      validator: async function(sellerId) {
        const User = mongoose.model('User');
        const seller = await User.findById(sellerId);
        return seller && seller.role === 'seller';
      },
      message: 'Referenced user must be a seller'
    }
  },
  
  // Inspection details
  datetime: {
    type: Date,
    required: [true, 'Inspection datetime is required'],
    validate: {
      validator: function(date) {
        return date > new Date();
      },
      message: 'Inspection date must be in the future'
    }
  },
  duration: {
    type: Number, // in minutes
    default: 120,
    min: [30, 'Inspection must be at least 30 minutes'],
    max: [480, 'Inspection cannot exceed 8 hours']
  },
  
  // Status and type
  status: {
    type: String,
    enum: ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rescheduled'],
    default: 'scheduled',
    index: true
  },
  inspectionType: {
    type: String,
    enum: ['general', 'pre_purchase', 'pre_listing', 'warranty', 'insurance'],
    default: 'pre_purchase'
  },
  
  // Location and access
  location: {
    address: {
      type: String,
      trim: true
    },
    accessInstructions: {
      type: String,
      trim: true,
      maxlength: [1000, 'Access instructions cannot exceed 1000 characters']
    },
    keyLocation: {
      type: String,
      trim: true
    },
    contactOnSite: {
      name: String,
      phone: String
    }
  },
  
  // Inspector details
  inspector: {
    name: {
      type: String,
      trim: true
    },
    // REMOVED: licenseNumber field
    company: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    }
  },
  
  // Inspection scope
  scope: {
    areas: [{
      type: String,
      enum: ['interior', 'exterior', 'electrical', 'plumbing', 'hvac', 'structural', 'roof', 'foundation', 'attic', 'basement']
    }],
    specialRequests: [{
      type: String,
      trim: true
    }]
  },
  
  // Results and documentation
  results: {
    overallCondition: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor', 'needs_major_repairs']
    },
    majorIssues: [{
      category: {
        type: String,
        enum: ['structural', 'electrical', 'plumbing', 'hvac', 'roof', 'foundation', 'safety', 'other']
      },
      description: {
        type: String,
        required: true,
        trim: true
      },
      severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
      },
      estimatedCost: {
        type: Number,
        min: 0
      },
      priority: {
        type: String,
        enum: ['immediate', 'short_term', 'long_term'],
        default: 'short_term'
      }
    }],
    recommendations: [{
      type: String,
      trim: true
    }],
    reportUrl: {
      type: String,
      trim: true
    },
    photos: [{
      url: String,
      caption: String,
      category: String
    }]
  },
  
  // Communication and notes
  internalNotes: {
    type: String,
    trim: true,
    maxlength: [5000, 'Internal notes cannot exceed 5000 characters']
  },
  publicNotes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Public notes cannot exceed 2000 characters']
  },
  
  // Notifications and reminders
  remindersSent: {
    type: Boolean,
    default: false
  },
  reminderDates: [{
    type: Date
  }],
  
  // Rescheduling history
  rescheduleHistory: [{
    originalDate: {
      type: Date,
      required: true
    },
    newDate: {
      type: Date,
      required: true
    },
    reason: {
      type: String,
      trim: true
    },
    rescheduledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rescheduledAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Completion details
  completedAt: {
    type: Date
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
inspectionSchema.index({ property: 1, status: 1, isDeleted: 1 });
inspectionSchema.index({ agent: 1, datetime: 1, isDeleted: 1 });
inspectionSchema.index({ buyer: 1, datetime: 1, isDeleted: 1 });
inspectionSchema.index({ seller: 1, datetime: 1, isDeleted: 1 });
inspectionSchema.index({ datetime: 1, status: 1, isDeleted: 1 });
inspectionSchema.index({ status: 1, createdAt: -1, isDeleted: 1 });
inspectionSchema.index({ inspectionType: 1, status: 1, isDeleted: 1 });

// Text search index
inspectionSchema.index({
  'inspector.name': 'text',
  'inspector.company': 'text',
  internalNotes: 'text',
  publicNotes: 'text'
});

// Pre-save middleware
inspectionSchema.pre('save', function(next) {
  // Set completion timestamp when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  
  next();
});

// Instance methods
inspectionSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

inspectionSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

inspectionSchema.methods.reschedule = function(newDate, reason, rescheduledBy) {
  this.rescheduleHistory.push({
    originalDate: this.datetime,
    newDate: newDate,
    reason: reason,
    rescheduledBy: rescheduledBy
  });
  this.datetime = newDate;
  this.status = 'rescheduled';
  return this.save();
};

inspectionSchema.methods.addMajorIssue = function(issue) {
  this.results.majorIssues.push(issue);
  return this.save();
};

// Query helpers
inspectionSchema.query.active = function() {
  return this.where({ isDeleted: false });
};

inspectionSchema.query.byStatus = function(status) {
  return this.where({ status: status, isDeleted: false });
};

inspectionSchema.query.upcoming = function() {
  return this.where({ 
    datetime: { $gte: new Date() }, 
    status: { $in: ['scheduled', 'confirmed'] },
    isDeleted: false 
  });
};

inspectionSchema.query.byProperty = function(propertyId) {
  return this.where({ property: propertyId, isDeleted: false });
};

module.exports = mongoose.model('Inspection', inspectionSchema);