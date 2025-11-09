const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },

  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
  },

  phone: {
    type: String,
    trim: true,
    match: [/^\+?[1-9]\d{1,14}$/, 'Please provide a valid phone number']
  },

  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },

  role: {
    type: String,
    enum: ['seller', 'buyer', 'agent', 'admin'],
    default: 'buyer'
  },

  // 🏦 NEW FIELD — Bank Account Number for Agent
  bankAccountNumber: {
    type: String,
    trim: true,
    maxlength: [34, 'Bank account number too long'],
    default: null
  },

  // New fields for agent experience and location
  experience: {
    type: String,
    maxlength: [100, 'Experience cannot exceed 100 characters'],
    trim: true,
    default: null
  },

  location: {
    type: String,
    maxlength: [150, 'Location cannot exceed 150 characters'],
    trim: true,
    default: null
  },

  // Enhanced agent fields
  agentProfile: {
    phone: {
      type: String,
      required: function() { return this.role === 'agent'; },
      trim: true,
      match: [/^\+?[1-9]\d{1,14}$/, 'Please provide a valid phone number']
    },
    brokerage: {
      type: String,
      required: function() { return this.role === 'agent'; },
      trim: true
    },
    yearsOfExperience: {
      type: Number,
      required: function() { return this.role === 'agent'; },
      min: [0, 'Years of experience cannot be negative'],
      max: [50, 'Years of experience cannot exceed 50']
    },
    specializations: [{
      type: String,
      enum: ['residential', 'commercial', 'luxury', 'first-time-buyers', 'investment', 'relocation']
    }],
    serviceAreas: [{
      city: String,
      state: String,
      zipCodes: [String]
    }],
    commissionStructure: {
      defaultRate: {
        type: Number,
        min: 0,
        max: 10,
        default: 3
      },
      negotiable: {
        type: Boolean,
        default: true
      }
    },
    bio: {
      type: String,
      maxlength: [1000, 'Bio cannot exceed 1000 characters']
    },
    certifications: [String],
    languages: [String]
  },

  avatar: {
    type: String,
    default: null
  },
  profileImage: {
    type: String,
    default: ""
  },

  // Account status
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active'
  },

  // Legacy fields - kept for backward compatibility
  isActive: {
    type: Boolean,
    default: true
  },

  isSuspended: {
    type: Boolean,
    default: false
  },

  suspendedAt: {
    type: Date,
    default: null
  },

  suspendedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  suspensionReason: {
    type: String,
    default: null
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

  // Security fields
  loginAttempts: {
    type: Number,
    default: 0
  },

  lockUntil: {
    type: Date
  },

  lastLogin: {
    type: Date
  },

  // Terms & Conditions
  termsAccepted: {
    type: Boolean,
    default: false
  },

  termsAcceptedAt: {
    type: Date,
    default: null
  },

  termsVersion: {
    type: String,
    default: null
  },

  // Verification
  otp: {
    type: String,
    select: false
  },

  otpExpiry: {
    type: Date,
    select: false
  },

  isVerified: {
    type: Boolean,
    default: false
  },

  // Preferences
  preferences: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    smsNotifications: {
      type: Boolean,
      default: false
    },
    marketingEmails: {
      type: Boolean,
      default: false
    }
  },

  isSeeded: {
    type: Boolean,
    default: false
  },

  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property'
  }]
}, {
  timestamps: true
});


// 🧩 Indexes
userSchema.index({ email: 1, isDeleted: 1 });
userSchema.index({ role: 1, isDeleted: 1, isActive: 1 });
userSchema.index({ 'agentProfile.serviceAreas.city': 1, 'agentProfile.serviceAreas.state': 1 }, { sparse: true });
userSchema.index({ isSuspended: 1, isDeleted: 1 });
userSchema.index({ createdAt: -1 });

// Text search for agents
userSchema.index({
  name: 'text',
  'agentProfile.bio': 'text',
  'agentProfile.brokerage': 'text'
});


// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});


// Pre-save middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});


// Methods
userSchema.methods.matchPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.incLoginAttempts = function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { loginAttempts: 1, lockUntil: 1 }
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = {
      lockUntil: Date.now() + 2 * 60 * 60 * 1000 // 2 hours
    };
  }

  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Soft delete methods
userSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.isActive = false;
  return this.save();
};

userSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  this.isActive = true;
  return this.save();
};

// Favorites management
userSchema.methods.addToFavorites = function(propertyId) {
  if (!this.favorites.includes(propertyId)) {
    this.favorites.push(propertyId);
    return this.save();
  }
  return Promise.resolve(this);
};

userSchema.methods.removeFromFavorites = function(propertyId) {
  this.favorites = this.favorites.filter(id => !id.equals(propertyId));
  return this.save();
};

userSchema.methods.isFavorite = function(propertyId) {
  return this.favorites.some(id => id.equals(propertyId));
};

// Query helpers
userSchema.query.active = function() {
  return this.where({ isDeleted: false, isActive: true });
};

userSchema.query.agents = function() {
  return this.where({ role: 'agent', isDeleted: false, isActive: true });
};

module.exports = mongoose.model('User', userSchema);
