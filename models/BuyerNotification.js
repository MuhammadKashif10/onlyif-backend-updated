const mongoose = require('mongoose');

const buyerNotificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'new_listing',
      'new_property',
      'price_drop',
      'saved_search_match',
      'market_update',
      'viewing_reminder',
      'offer_update',
      'document_required',
      'system_alert'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  data: {
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property'
    },
    savedSearchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SavedSearch'
    },
    actionUrl: String,
    metadata: mongoose.Schema.Types.Mixed
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['unread', 'read', 'archived'],
    default: 'unread'
  },
  readAt: Date,
  archivedAt: Date,
  expiresAt: Date,
  channels: {
    email: {
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date
    },
    push: {
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date
    },
    inApp: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
buyerNotificationSchema.index({ userId: 1, status: 1 });
buyerNotificationSchema.index({ userId: 1, type: 1 });
buyerNotificationSchema.index({ createdAt: -1 });
buyerNotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('BuyerNotification', buyerNotificationSchema);