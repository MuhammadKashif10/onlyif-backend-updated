const mongoose = require('mongoose');

// Property Status History schema for audit trail
const propertyStatusHistorySchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Property ID is required'],
    index: true
  },
  
  previousStatus: {
    type: String,
    enum: ['contract-exchanged', 'unconditional', 'settled', null],
    default: null
  },
  
  newStatus: {
    type: String,
    enum: ['contract-exchanged', 'unconditional', 'settled'],
    required: [true, 'New status is required']
  },
  
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User who made the change is required'],
    index: true
  },
  
  changeReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Change reason cannot exceed 500 characters'],
    default: ''
  },
  
  metadata: {
    userAgent: String,
    ipAddress: String,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    source: {
      type: String,
      enum: ['web', 'mobile', 'api', 'system'],
      default: 'web'
    }
  },
  
  // Settlement specific data
  settlementDetails: {
    settlementDate: Date,
    settlementAmount: Number,
    solicitorName: String,
    solicitorEmail: String,
    conveyancerName: String,
    conveyancerEmail: String,
    bankDetails: {
      accountName: String,
      bsb: String,
      accountNumber: String
    },
    // Deposit handling (off-platform by agent)
    deposit: {
      percentage: { type: Number, default: 10 },
      expectedAmount: { type: Number },
      handler: { type: String, enum: ['agent_trust_account', 'other'], default: 'agent_trust_account' },
      currency: { type: String, default: 'AUD' },
      releaseStatus: { type: String, enum: ['pending', 'eligible', 'released'], default: 'released' },
      releasedAt: { type: Date },
      commissionDeducted: { type: Boolean, default: true },
      notes: { type: String }
    }
  },
  
  // Invoice details (if generated)
  invoice: {
    generated: {
      type: Boolean,
      default: false
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice'
    },
    generatedAt: Date,
    amount: Number,
    status: {
      type: String,
      enum: ['pending', 'sent', 'paid', 'overdue', 'cancelled'],
      default: 'pending'
    }
  },
  
  // Notification tracking
  notifications: {
    emailsSent: [{
      recipient: String,
      type: {
        type: String,
        enum: ['agent', 'buyer', 'seller', 'admin']
      },
      sentAt: Date,
      status: {
        type: String,
        enum: ['sent', 'delivered', 'failed']
      }
    }],
    smsNotifications: [{
      recipient: String,
      sentAt: Date,
      status: {
        type: String,
        enum: ['sent', 'delivered', 'failed']
      }
    }]
  },
  
  // System flags
  isActive: {
    type: Boolean,
    default: true
  },
  
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  
  errorLog: [{
    error: String,
    timestamp: Date,
    resolved: {
      type: Boolean,
      default: false
    }
  }]
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
propertyStatusHistorySchema.index({ property: 1, createdAt: -1 });
propertyStatusHistorySchema.index({ changedBy: 1, createdAt: -1 });
propertyStatusHistorySchema.index({ newStatus: 1, createdAt: -1 });
propertyStatusHistorySchema.index({ processingStatus: 1, createdAt: -1 });

// Virtual for duration between status changes
propertyStatusHistorySchema.virtual('durationSincePrevious').get(function() {
  if (!this.previousStatusChange) return null;
  return this.createdAt - this.previousStatusChange.createdAt;
});

// Static methods
propertyStatusHistorySchema.statics.getPropertyHistory = async function(propertyId) {
  return this.find({ property: propertyId })
    .populate('changedBy', 'name email role')
    .populate('invoice.invoiceId')
    .sort({ createdAt: -1 });
};

propertyStatusHistorySchema.statics.getAgentHistory = async function(agentId) {
  return this.find({ changedBy: agentId })
    .populate('property', 'title address.street address.city')
    .populate('changedBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(50);
};

propertyStatusHistorySchema.statics.createStatusChange = async function(data) {
  const statusChange = new this(data);
  await statusChange.save();
  
  // Populate references for return
  await statusChange.populate('changedBy', 'name email role');
  await statusChange.populate('property', 'title address');
  
  return statusChange;
};

// Instance methods
propertyStatusHistorySchema.methods.markAsProcessed = async function() {
  this.processingStatus = 'completed';
  return this.save();
};

propertyStatusHistorySchema.methods.markAsFailed = async function(error) {
  this.processingStatus = 'failed';
  this.errorLog.push({
    error: error.toString(),
    timestamp: new Date()
  });
  return this.save();
};

propertyStatusHistorySchema.methods.addNotification = async function(notificationData) {
  if (notificationData.type === 'email') {
    this.notifications.emailsSent.push(notificationData);
  } else if (notificationData.type === 'sms') {
    this.notifications.smsNotifications.push(notificationData);
  }
  return this.save();
};

// Pre-save middleware for validation
propertyStatusHistorySchema.pre('save', function(next) {
  // Validate status progression (optional business rule)
  const validProgressions = {
    'contract-exchanged': ['unconditional', 'settled'],
    'unconditional': ['settled']
  };
  
  if (this.previousStatus && validProgressions[this.previousStatus]) {
    if (!validProgressions[this.previousStatus].includes(this.newStatus)) {
      console.warn(`Unusual status progression: ${this.previousStatus} -> ${this.newStatus}`);
    }
  }
  
  next();
});

// Post-save middleware for logging
propertyStatusHistorySchema.post('save', function(doc) {
  console.log(`📋 Status change recorded: ${doc.previousStatus || 'null'} -> ${doc.newStatus} for property ${doc.property}`);
});

module.exports = mongoose.model('PropertyStatusHistory', propertyStatusHistorySchema);