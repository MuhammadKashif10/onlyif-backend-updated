const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Core relationships
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    index: true
  },
  
  // Transaction identification
  transactionId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  
  // Transaction details
  transactionType: {
    type: String,
    enum: ['addon_purchase', 'commission', 'subscription', 'listing_fee', 'premium_feature', 'cash_offer', 'inspection_fee', 'service_fee', 'unlock_fee'],
    required: [true, 'Transaction type is required'],
    index: true
  },
  
  // Items and services
  items: [{
    itemType: {
      type: String,
      enum: ['photo', 'floorplan', 'drone', 'walkthrough', 'property_unlock', 'premium_listing', 'featured_listing', 'inspection', 'commission', 'service'],
      required: true
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'items.itemType'
    },
    description: {
      type: String,
      required: [true, 'Item description is required'],
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative']
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      default: 1
    },
    totalPrice: {
      type: Number,
      required: [true, 'Total price is required'],
      min: [0, 'Total price cannot be negative']
    },
    metadata: mongoose.Schema.Types.Mixed
  }],
  
  // Financial details
  subtotal: {
    type: Number,
    required: [true, 'Subtotal is required'],
    min: [0, 'Subtotal cannot be negative']
  },
  
  // Tax calculation
  tax: {
    rate: {
      type: Number,
      default: 0,
      min: [0, 'Tax rate cannot be negative'],
      max: [1, 'Tax rate cannot exceed 100%']
    },
    amount: {
      type: Number,
      default: 0,
      min: [0, 'Tax amount cannot be negative']
    },
    jurisdiction: {
      type: String,
      trim: true
    }
  },
  
  // Fees breakdown
  fees: [{
    type: {
      type: String,
      enum: ['processing', 'service', 'platform', 'gateway', 'convenience'],
      required: true
    },
    amount: {
      type: Number,
      required: [true, 'Fee amount is required'],
      min: [0, 'Fee amount cannot be negative']
    },
    rate: {
      type: Number,
      min: [0, 'Fee rate cannot be negative']
    },
    description: {
      type: String,
      trim: true
    }
  }],
  
  // Discounts and promotions
  discounts: [{
    type: {
      type: String,
      enum: ['percentage', 'fixed_amount', 'promotional', 'loyalty'],
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Discount amount cannot be negative']
    },
    code: {
      type: String,
      trim: true,
      uppercase: true
    },
    description: {
      type: String,
      trim: true
    }
  }],
  
  // Final amounts
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount cannot be negative']
  },
  currency: {
    type: String,
    default: 'AUD', // Changed from 'USD' to 'AUD'
    uppercase: true,
    enum: ['USD', 'CAD', 'EUR', 'GBP', 'AUD']
  },
  
  // Payment processing
  paymentMethod: {
    type: String,
    enum: ['stripe', 'paypal', 'bank_transfer', 'check', 'wire_transfer', 'ach'],
    default: 'stripe'
  },
  
  // External payment references
  externalReferences: {
    stripePaymentIntentId: {
      type: String,
      sparse: true
    },
    stripeChargeId: {
      type: String,
      sparse: true
    },
    paypalTransactionId: {
      type: String,
      sparse: true
    },
    bankReferenceNumber: {
      type: String,
      sparse: true
    }
  },
  
  // Transaction status
  status: {
    type: String,
    enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'disputed'],
    default: 'pending',
    index: true
  },
  
  // Timestamps
  processedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  
  // Refund information
  refunds: [{
    refundId: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: [true, 'Refund amount is required'],
      min: [0, 'Refund amount cannot be negative']
    },
    reason: {
      type: String,
      required: [true, 'Refund reason is required'],
      trim: true
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    refundedAt: {
      type: Date,
      default: Date.now
    },
    refundedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    externalRefundId: String,
    notes: {
      type: String,
      trim: true
    }
  }],
  
  // Audit trail
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
    },
    metadata: mongoose.Schema.Types.Mixed
  }],
  
  // Additional metadata
  metadata: {
    ipAddress: String,
    userAgent: String,
    source: {
      type: String,
      enum: ['web', 'mobile', 'api', 'admin'],
      default: 'web'
    },
    campaign: String,
    referrer: String
  },
  
  // Notes and communication
  notes: {
    internal: {
      type: String,
      trim: true,
      maxlength: [2000, 'Internal notes cannot exceed 2000 characters']
    },
    customer: {
      type: String,
      trim: true,
      maxlength: [1000, 'Customer notes cannot exceed 1000 characters']
    }
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
transactionSchema.index({ user: 1, status: 1, createdAt: -1, isDeleted: 1 });
transactionSchema.index({ property: 1, transactionType: 1, isDeleted: 1 });
transactionSchema.index({ transactionType: 1, status: 1, createdAt: -1 });
transactionSchema.index({ status: 1, processedAt: -1, isDeleted: 1 });
transactionSchema.index({ paymentMethod: 1, status: 1, createdAt: -1 });
transactionSchema.index({ totalAmount: 1, currency: 1, status: 1 });
transactionSchema.index({ 'externalReferences.stripePaymentIntentId': 1 }, { sparse: true });
transactionSchema.index({ 'externalReferences.paypalTransactionId': 1 }, { sparse: true });

// Pre-save middleware
transactionSchema.pre('save', function(next) {
  // Always prefer the real Stripe identifiers when available
  const stripePi = this.externalReferences?.stripePaymentIntentId;
  const looksGenerated = typeof this.transactionId === 'string' && this.transactionId.startsWith('TXN-');

  if (stripePi) {
    // Align the primary transactionId with Stripe PaymentIntent for consistency across Admin/Seller UI
    if (!this.transactionId || looksGenerated || this.transactionId !== stripePi) {
      this.transactionId = stripePi;
    }
  } else if (!this.transactionId) {
    // Fallback: generate an internal ID only when no Stripe ID exists
    this.transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }

  // Calculate totals
  if (this.items && this.items.length > 0) {
    this.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);
  }

  // Calculate total fees
  const totalFees = this.fees.reduce((sum, fee) => sum + fee.amount, 0);
  const totalDiscounts = this.discounts.reduce((sum, discount) => sum + discount.amount, 0);

  // Calculate final total
  this.totalAmount = this.subtotal + this.tax.amount + totalFees - totalDiscounts;

  // Add to status history if status changed
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      changedAt: new Date()
    });

    // Set timestamps based on status
    if (this.status === 'processing' && !this.processedAt) {
      this.processedAt = new Date();
    } else if (this.status === 'succeeded' && !this.completedAt) {
      this.completedAt = new Date();
    }
  }

  next();
});

// Instance methods
transactionSchema.methods.addRefund = function(amount, reason, refundedBy, externalRefundId, notes) {
  const refundId = `REF-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  
  this.refunds.push({
    refundId,
    amount,
    reason,
    refundedBy,
    externalRefundId,
    notes
  });
  
  const totalRefunded = this.refunds
    .filter(r => r.status === 'completed')
    .reduce((sum, refund) => sum + refund.amount, 0);
  
  if (totalRefunded >= this.totalAmount) {
    this.status = 'refunded';
  } else if (totalRefunded > 0) {
    this.status = 'partially_refunded';
  }
  
  return this.save();
};

transactionSchema.methods.updateStatus = function(newStatus, changedBy, reason, metadata) {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    changedAt: new Date(),
    changedBy,
    reason,
    metadata
  });
  return this.save();
};

transactionSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

transactionSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

transactionSchema.methods.getTotalRefunded = function() {
  return this.refunds
    .filter(r => r.status === 'completed')
    .reduce((sum, refund) => sum + refund.amount, 0);
};

// Query helpers
transactionSchema.query.active = function() {
  return this.where({ isDeleted: false });
};

transactionSchema.query.successful = function() {
  return this.where({ status: 'succeeded', isDeleted: false });
};

transactionSchema.query.byUser = function(userId) {
  return this.where({ user: userId, isDeleted: false });
};

transactionSchema.query.byProperty = function(propertyId) {
  return this.where({ property: propertyId, isDeleted: false });
};

transactionSchema.query.byType = function(type) {
  return this.where({ transactionType: type, isDeleted: false });
};

module.exports = mongoose.model('Transaction', transactionSchema);