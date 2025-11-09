const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: [true, 'Message text is required'],
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const messageThreadSchema = new mongoose.Schema({
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['buyer', 'seller', 'agent', 'admin'],
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: {
      type: Date,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },
    // Read status per participant
    lastReadAt: {
      type: Date,
      default: Date.now
    },
    unreadCount: {
      type: Number,
      default: 0
    }
  }],
  
  context: {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true
    },
    type: {
      type: String,
      enum: ['inquiry', 'offer', 'inspection', 'general', 'support'],
      default: 'general'
    },
    subject: {
      type: String,
      trim: true,
      maxlength: [200, 'Subject cannot exceed 200 characters']
    }
  },
  
  // Thread metadata
  status: {
    type: String,
    enum: ['active', 'closed', 'archived'],
    default: 'active'
  },
  
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  // Last message info for quick access
  lastMessage: {
    content: String,
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sentAt: Date,
    messageType: {
      type: String,
      enum: ['text', 'image', 'document', 'system'],
      default: 'text'
    }
  },
  
  messageCount: {
    type: Number,
    default: 0
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

// Indexes for performance
messageThreadSchema.index({ 'participants.user': 1, isDeleted: 1, status: 1 });
messageThreadSchema.index({ 'context.property': 1, isDeleted: 1 });
messageThreadSchema.index({ status: 1, updatedAt: -1 });
messageThreadSchema.index({ 'lastMessage.sentAt': -1 });

// Methods
messageThreadSchema.methods.addParticipant = function(userId, role) {
  const existingParticipant = this.participants.find(p => p.user.toString() === userId.toString());
  
  if (existingParticipant) {
    existingParticipant.isActive = true;
    existingParticipant.leftAt = null;
  } else {
    this.participants.push({
      user: userId,
      role: role,
      joinedAt: new Date()
    });
  }
  
  return this.save();
};

messageThreadSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(p => p.user.toString() === userId.toString());
  
  if (participant) {
    participant.isActive = false;
    participant.leftAt = new Date();
  }
  
  return this.save();
};

messageThreadSchema.methods.markAsRead = function(userId) {
  const participant = this.participants.find(p => p.user.toString() === userId.toString());
  
  if (participant) {
    participant.lastReadAt = new Date();
    participant.unreadCount = 0;
  }
  
  return this.save();
};

messageThreadSchema.methods.incrementUnread = function(excludeUserId) {
  this.participants.forEach(participant => {
    if (participant.user.toString() !== excludeUserId.toString() && participant.isActive) {
      participant.unreadCount += 1;
    }
  });
  
  return this.save();
};

// Soft delete methods
messageThreadSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.status = 'archived';
  return this.save();
};

// Query helpers
messageThreadSchema.query.active = function() {
  return this.where({ isDeleted: false, status: { $ne: 'archived' } });
};

module.exports = mongoose.model('MessageThread', messageThreadSchema);