const mongoose = require('mongoose');

const termsAcceptanceSchema = new mongoose.Schema({
  // User relationship
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  
  // User role at time of acceptance
  role: {
    type: String,
    enum: ['seller', 'buyer', 'agent', 'admin'],
    required: [true, 'Role is required'],
    index: true
  },
  
  // Terms details
  termsType: {
    type: String,
    enum: ['general', 'privacy', 'service', 'agent_agreement', 'seller_agreement', 'buyer_agreement'],
    required: [true, 'Terms type is required']
  },
  
  version: {
    type: String,
    required: [true, 'Terms version is required'],
    trim: true,
    match: [/^\d+\.\d+(\.\d+)?$/, 'Version must be in format X.Y or X.Y.Z']
  },
  
  // Acceptance details
  acceptedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  
  // Acceptance method and context
  acceptanceMethod: {
    type: String,
    enum: ['web_form', 'mobile_app', 'email_confirmation', 'digital_signature', 'verbal_confirmation'],
    default: 'web_form'
  },
  
  // Digital signature information
  signature: {
    type: {
      type: String,
      enum: ['typed', 'drawn', 'uploaded', 'electronic'],
      default: 'typed'
    },
    data: String, // Base64 encoded signature or typed name
    timestamp: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    userAgent: String
  },
  
  // Witness information (for important agreements)
  witness: {
    required: {
      type: Boolean,
      default: false
    },
    name: String,
    email: String,
    signedAt: Date,
    signature: String
  },
  
  // Document references
  documentUrl: {
    type: String,
    trim: true
  },
  documentHash: {
    type: String,
    trim: true
  },
  
  // Expiration and renewal
  expiresAt: {
    type: Date,
    validate: {
      validator: function(date) {
        return !date || date > this.acceptedAt;
      },
      message: 'Expiration date must be after acceptance date'
    }
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['active', 'expired', 'superseded', 'revoked'],
    default: 'active',
    index: true
  },
  
  // Superseding information
  supersededBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TermsAcceptance',
    default: null
  },
  supersededAt: {
    type: Date,
    default: null
  },
  
  // Revocation information
  revokedAt: {
    type: Date,
    default: null
  },
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  revokedReason: {
    type: String,
    trim: true
  },
  
  // Additional metadata
  metadata: {
    browserInfo: {
      userAgent: String,
      language: String,
      platform: String
    },
    location: {
      ipAddress: String,
      country: String,
      region: String,
      city: String
    },
    sessionInfo: {
      sessionId: String,
      referrer: String
    }
  },
  
  // Compliance and audit
  complianceFlags: {
    gdprCompliant: {
      type: Boolean,
      default: false
    },
    ccpaCompliant: {
      type: Boolean,
      default: false
    },
    coppaCompliant: {
      type: Boolean,
      default: false
    }
  },
  
  // Notes and comments
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
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
termsAcceptanceSchema.index({ user: 1, termsType: 1, version: 1 }, { unique: true });
termsAcceptanceSchema.index({ user: 1, status: 1, acceptedAt: -1, isDeleted: 1 });
termsAcceptanceSchema.index({ role: 1, termsType: 1, status: 1 });
termsAcceptanceSchema.index({ version: 1, termsType: 1, acceptedAt: -1 });
termsAcceptanceSchema.index({ expiresAt: 1, status: 1 });
termsAcceptanceSchema.index({ status: 1, acceptedAt: -1, isDeleted: 1 });

// Pre-save middleware
termsAcceptanceSchema.pre('save', function(next) {
  // Set expiration status if expired
  if (this.expiresAt && this.expiresAt < new Date() && this.status === 'active') {
    this.status = 'expired';
  }
  
  // Set superseded timestamp when superseded
  if (this.isModified('supersededBy') && this.supersededBy && !this.supersededAt) {
    this.supersededAt = new Date();
    this.status = 'superseded';
  }
  
  next();
});

// Instance methods
termsAcceptanceSchema.methods.revoke = function(revokedBy, reason) {
  this.status = 'revoked';
  this.revokedAt = new Date();
  this.revokedBy = revokedBy;
  this.revokedReason = reason;
  return this.save();
};

termsAcceptanceSchema.methods.supersede = function(newAcceptanceId) {
  this.status = 'superseded';
  this.supersededBy = newAcceptanceId;
  this.supersededAt = new Date();
  return this.save();
};

termsAcceptanceSchema.methods.isValid = function() {
  if (this.status !== 'active') return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return true;
};

termsAcceptanceSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

termsAcceptanceSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

// Query helpers
termsAcceptanceSchema.query.active = function() {
  return this.where({ status: 'active', isDeleted: false });
};

termsAcceptanceSchema.query.byUser = function(userId) {
  return this.where({ user: userId, isDeleted: false });
};

termsAcceptanceSchema.query.byType = function(termsType) {
  return this.where({ termsType: termsType, isDeleted: false });
};

termsAcceptanceSchema.query.current = function() {
  return this.where({ 
    status: 'active', 
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ],
    isDeleted: false 
  });
};

module.exports = mongoose.model('TermsAcceptance', termsAcceptanceSchema);