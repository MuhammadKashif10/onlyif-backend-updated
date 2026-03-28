const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // User relationship
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  
  // Notification details
  type: {
    type: String,
    enum: ['message', 'property_update', 'inspection', 'offer', 'system', 'marketing', 'reminder', 'alert'],
    required: [true, 'Notification type is required'],
    index: true
  },
  category: {
    type: String,
    enum: ['info', 'success', 'warning', 'error', 'urgent'],
    default: 'info'
  },
  
  // Optional direct links for cross-dashboard syncing (non-breaking additions)
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    default: null
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    default: null
  },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    index: true,
    default: null
  },
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    default: null
  },
  
  // Content
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  // Keep existing body; add optional message alias for convenience
  message: {
    type: String,
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters'],
    default: ''
  },
  body: {
    type: String,
    required: [true, 'Notification body is required'],
    trim: true,
    maxlength: [1000, 'Body cannot exceed 1000 characters']
  },
  
  // Rich content
  actionUrl: {
    type: String,
    trim: true
  },
  actionText: {
    type: String,
    trim: true,
    maxlength: [50, 'Action text cannot exceed 50 characters']
  },
  imageUrl: {
    type: String,
    trim: true
  },
  
  // Metadata and context
  meta: {
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property'
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    inspectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inspection'
    },
    offerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CashOffer'
    },
    additionalData: mongoose.Schema.Types.Mixed
  },
  
  // Status and tracking
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  },
  
  // Delivery channels
  channels: {
    inApp: {
      type: Boolean,
      default: true
    },
    email: {
      type: Boolean,
      default: false
    },
    sms: {
      type: Boolean,
      default: false
    },
    push: {
      type: Boolean,
      default: false
    }
  },
  
  // Delivery status
  deliveryStatus: {
    inApp: {
      status: {
        type: String,
        enum: ['pending', 'delivered', 'failed'],
        default: 'pending'
      },
      deliveredAt: Date,
      error: String
    },
    email: {
      status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'failed', 'bounced'],
        default: 'pending'
      },
      sentAt: Date,
      deliveredAt: Date,
      error: String
    },
    sms: {
      status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'failed'],
        default: 'pending'
      },
      sentAt: Date,
      deliveredAt: Date,
      error: String
    },
    push: {
      status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'failed'],
        default: 'pending'
      },
      sentAt: Date,
      deliveredAt: Date,
      error: String
    }
  },
  
  // Scheduling
  scheduledFor: {
    type: Date,
    validate: {
      validator: function(date) {
        return !date || date > new Date();
      },
      message: 'Scheduled date must be in the future'
    }
  },
  
  // Priority and expiration
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  expiresAt: {
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
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1, isDeleted: 1 });
notificationSchema.index({ seller: 1, createdAt: -1 });
notificationSchema.index({ property: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1, isDeleted: 1 });
notificationSchema.index({ type: 1, category: 1, createdAt: -1 });
notificationSchema.index({ scheduledFor: 1, isDeleted: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ priority: 1, createdAt: -1, isDeleted: 1 });
notificationSchema.index({ 'meta.propertyId': 1, type: 1, isDeleted: 1 });

// Text search index
notificationSchema.index({
  title: 'text',
  body: 'text'
}, {
  weights: {
    title: 10,
    body: 5
  }
});

// Pre-save middleware
notificationSchema.pre('save', function(next) {
  // Ensure message mirrors body if not explicitly set
  if (!this.message && this.body) {
    this.message = this.body;
  }
  // Set read timestamp when marked as read
  if (this.isModified('isRead') && this.isRead && !this.readAt) {
    this.readAt = new Date();
  }
  
  // Set delivery status for in-app notifications
  if (this.channels.inApp && this.deliveryStatus.inApp.status === 'pending') {
    this.deliveryStatus.inApp.status = 'delivered';
    this.deliveryStatus.inApp.deliveredAt = new Date();
  }
  
  next();
});

// Virtuals for external integrations
notificationSchema.virtual('notificationId').get(function() { return this._id; });

// Instance methods
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

notificationSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

notificationSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

notificationSchema.methods.updateDeliveryStatus = function(channel, status, error = null) {
  if (this.deliveryStatus[channel]) {
    this.deliveryStatus[channel].status = status;
    if (status === 'sent') {
      this.deliveryStatus[channel].sentAt = new Date();
    } else if (status === 'delivered') {
      this.deliveryStatus[channel].deliveredAt = new Date();
    } else if (status === 'failed') {
      this.deliveryStatus[channel].error = error;
    }
  }
  return this.save();
};

// Query helpers
notificationSchema.query.active = function() {
  return this.where({ isDeleted: false });
};

notificationSchema.query.unread = function() {
  return this.where({ isRead: false, isDeleted: false });
};

notificationSchema.query.byUser = function(userId) {
  return this.where({ user: userId, isDeleted: false });
};

notificationSchema.query.byType = function(type) {
  return this.where({ type: type, isDeleted: false });
};

notificationSchema.query.urgent = function() {
  return this.where({ priority: 'urgent', isDeleted: false });
};

module.exports = mongoose.model('Notification', notificationSchema);