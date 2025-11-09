const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  thread: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MessageThread',
    required: true,
    index: true
  },
  
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Optional receiver link so consumers can easily query by sender/receiver
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    index: true,
    default: null
  },
  
  content: {
    text: {
      type: String,
      trim: true,
      maxlength: [2000, 'Message cannot exceed 2000 characters']
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'document', 'system', 'offer', 'inspection_request'],
      default: 'text'
    }
  },
  
  // File attachments
  attachments: [{
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true,
      max: [10485760, 'File size cannot exceed 10MB'] // 10MB limit
    },
    url: {
      type: String,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Message status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  
  // Read receipts
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Message reactions/responses
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      enum: ['👍', '👎', '❤️', '😊', '😢', '😮']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Reply to another message
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  
  // System message metadata
  systemData: {
    action: String,
    metadata: mongoose.Schema.Types.Mixed
  },
  
  // Soft delete
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
  
  // Edit history
  editHistory: [{
    previousContent: String,
    editedAt: {
      type: Date,
      default: Date.now
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  isEdited: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for pagination and performance
messageSchema.index({ thread: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, createdAt: -1 });
messageSchema.index({ thread: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ 'readBy.user': 1 });

// Text search for message content
messageSchema.index({ 'content.text': 'text' });

// Methods
messageSchema.methods.markAsRead = function(userId) {
  const existingRead = this.readBy.find(r => r.user.toString() === userId.toString());
  
  if (!existingRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
    
    // Update status if all participants have read
    if (this.readBy.length >= this.thread.participants.filter(p => p.isActive).length - 1) {
      this.status = 'read';
    }
  }
  
  return this.save();
};

messageSchema.methods.addReaction = function(userId, emoji) {
  const existingReaction = this.reactions.find(r => r.user.toString() === userId.toString());
  
  if (existingReaction) {
    existingReaction.emoji = emoji;
  } else {
    this.reactions.push({
      user: userId,
      emoji: emoji
    });
  }
  
  return this.save();
};

messageSchema.methods.removeReaction = function(userId) {
  this.reactions = this.reactions.filter(r => r.user.toString() !== userId.toString());
  return this.save();
};

// Soft delete methods
messageSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

// Query helpers
messageSchema.query.active = function() {
  return this.where({ isDeleted: false });
};

messageSchema.query.byThread = function(threadId) {
  return this.where({ thread: threadId, isDeleted: false });
};

module.exports = mongoose.model('Message', messageSchema);