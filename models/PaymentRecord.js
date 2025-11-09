const mongoose = require('mongoose');

const paymentRecordSchema = new mongoose.Schema({
  // Reference to the seller who needs to make the payment
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Reference to the agent who will receive the payment
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Reference to the property this payment is for
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
    index: true
  },
  
  // Reference to the invoice that triggered this payment
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    index: true
  },
  
  // Payment details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  currency: {
    type: String,
    default: 'AUD',
    required: true
  },
  
  // Payment status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'pending',
    required: true,
    index: true
  },
  
  // Stripe payment details
  stripePaymentIntentId: {
    type: String,
    sparse: true,
    index: true
  },
  
  stripeTransactionId: {
    type: String,
    sparse: true,
    index: true
  },
  
  // Payment method details
  paymentMethod: {
    type: String,
    enum: ['stripe', 'bank_transfer', 'other'],
    default: 'stripe'
  },
  
  // Additional payment metadata
  paymentMetadata: {
    paymentMethodId: String,
    last4: String,
    brand: String,
    customerEmail: String,
    receiptUrl: String
  },
  
  // Invoice details snapshot (for historical record)
  invoiceDetails: {
    invoiceNumber: {
      type: String,
      required: true
    },
    commissionAmount: {
      type: Number,
      required: true
    },
    gstAmount: {
      type: Number,
      required: true
    },
    totalAmount: {
      type: Number,
      required: true
    },
    dueDate: {
      type: Date,
      required: true
    }
  },
  
  // Property details snapshot (for admin dashboard display)
  propertyDetails: {
    title: {
      type: String,
      required: true
    },
    address: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true
    }
  },
  
  // Seller details snapshot
  sellerDetails: {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    }
  },
  
  // Agent details snapshot
  agentDetails: {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    }
  },
  
  // Payment timeline
  paymentInitiatedAt: {
    type: Date,
    default: Date.now
  },
  
  paymentCompletedAt: {
    type: Date
  },
  
  paymentFailedAt: {
    type: Date
  },
  
  // Error details if payment failed
  errorDetails: {
    code: String,
    message: String,
    details: mongoose.Schema.Types.Mixed
  },
  
  // Admin notes
  adminNotes: {
    type: String,
    maxlength: 1000
  },
  
  // Notification tracking
  notificationsSent: {
    sellerNotified: {
      type: Boolean,
      default: false
    },
    agentNotified: {
      type: Boolean,
      default: false
    },
    adminNotified: {
      type: Boolean,
      default: false
    }
  },
  
  // Auto-reminder settings
  reminderSettings: {
    enabled: {
      type: Boolean,
      default: true
    },
    lastReminderSent: Date,
    reminderCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for days overdue
paymentRecordSchema.virtual('daysOverdue').get(function() {
  if (this.status === 'completed' || !this.invoiceDetails.dueDate) {
    return 0;
  }
  const today = new Date();
  const dueDate = new Date(this.invoiceDetails.dueDate);
  const diffTime = today - dueDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
});

// Virtual for formatted amount
paymentRecordSchema.virtual('formattedAmount').get(function() {
  return `${this.currency} ${this.amount.toLocaleString('en-AU')}`;
});

// Virtual for payment age in days
paymentRecordSchema.virtual('paymentAge').get(function() {
  const today = new Date();
  const diffTime = today - this.paymentInitiatedAt;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Compound indexes for efficient queries
paymentRecordSchema.index({ status: 1, createdAt: -1 });
paymentRecordSchema.index({ seller: 1, status: 1 });
paymentRecordSchema.index({ agent: 1, status: 1 });
paymentRecordSchema.index({ property: 1, status: 1 });
paymentRecordSchema.index({ 'invoiceDetails.dueDate': 1, status: 1 });
paymentRecordSchema.index({ stripePaymentIntentId: 1 }, { sparse: true });

// Static methods for admin dashboard queries
paymentRecordSchema.statics.getPendingPayments = function(options = {}) {
  const {
    limit = 20,
    skip = 0,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = options;
  
  return this.find({ status: 'pending' })
    .populate('seller', 'name email')
    .populate('agent', 'name email')
    .populate('property', 'title address price')
    .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
    .limit(limit)
    .skip(skip);
};

paymentRecordSchema.statics.getPaymentStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    {
      $group: {
        _id: null,
        stats: {
          $push: {
            status: '$_id',
            count: '$count',
            totalAmount: '$totalAmount'
          }
        },
        totalCount: { $sum: '$count' },
        totalAmount: { $sum: '$totalAmount' }
      }
    }
  ]);
};

paymentRecordSchema.statics.getOverduePayments = function() {
  const today = new Date();
  return this.find({
    status: 'pending',
    'invoiceDetails.dueDate': { $lt: today }
  })
    .populate('seller', 'name email')
    .populate('agent', 'name email')
    .populate('property', 'title address')
    .sort({ 'invoiceDetails.dueDate': 1 });
};

// Instance methods
paymentRecordSchema.methods.markAsCompleted = function(stripeData) {
  this.status = 'completed';
  this.paymentCompletedAt = new Date();
  if (stripeData) {
    this.stripeTransactionId = stripeData.transactionId;
    this.stripePaymentIntentId = stripeData.paymentIntentId;
    if (stripeData.paymentMethod) {
      this.paymentMetadata = {
        ...this.paymentMetadata,
        ...stripeData.paymentMethod
      };
    }
  }
  return this.save();
};

paymentRecordSchema.methods.markAsFailed = function(errorDetails) {
  this.status = 'failed';
  this.paymentFailedAt = new Date();
  this.errorDetails = errorDetails;
  return this.save();
};

// Pre-save middleware
paymentRecordSchema.pre('save', function(next) {
  // Ensure payment completed timestamp is set when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.paymentCompletedAt) {
    this.paymentCompletedAt = new Date();
  }
  
  // Ensure payment failed timestamp is set when status changes to failed
  if (this.isModified('status') && this.status === 'failed' && !this.paymentFailedAt) {
    this.paymentFailedAt = new Date();
  }
  
  next();
});

module.exports = mongoose.model('PaymentRecord', paymentRecordSchema);