'use strict';

const mongoose = require('mongoose');
const User = require('./User');
const { Schema } = mongoose;

// 🔁 Adjust this path to where your User model lives

const chatSchema = new Schema(
  {
    sender:   { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text:     { type: String, default: '', trim: true },
    readAt:   { type: Date, default: null },
    // helps group a buyer+agent thread regardless of who sent the message
    conversationKey: { type: String, index: true },
  },
  { timestamps: true }
);

// Helpful indexes for one-to-one chat lookups
chatSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
chatSchema.index({ receiver: 1, sender: 1, createdAt: -1 });
chatSchema.index({ conversationKey: 1, createdAt: 1 });

// ✅ Enforce "buyer ⇄ agent" only
chatSchema.pre('validate', async function (next) {
  try {
    if (!this.sender || !this.receiver) {
      return next(new Error('sender and receiver are required'));
    }
    if (this.sender.equals(this.receiver)) {
      return next(new Error('sender and receiver cannot be the same user'));
    }

    // Load roles from User collection
    const [s, r] = await Promise.all([
      User.findById(this.sender).select('role').lean(),
      User.findById(this.receiver).select('role').lean(),
    ]);

    if (!s || !r) return next(new Error('Invalid sender or receiver user'));

    const isBuyerAgentPair =
      (s.role === 'buyer' && r.role === 'agent') ||
      (s.role === 'agent' && r.role === 'buyer');

    if (!isBuyerAgentPair) {
      return next(new Error('Chat is only permitted between a buyer and an agent.'));
    }

    // Build a stable key "<buyerId>|<agentId>"
    const buyerId = s.role === 'buyer' ? this.sender : this.receiver;
    const agentId = s.role === 'agent' ? this.sender : this.receiver;
    this.conversationKey = `${String(buyerId)}|${String(agentId)}`;

    return next();
  } catch (err) {
    return next(err);
  }
});

// Optional helper to send a message with validation
chatSchema.statics.send = function ({ senderId, receiverId, text }) {
  return this.create({ sender: senderId, receiver: receiverId, text });
};

const Chat = mongoose.models.Chat || mongoose.model('Chat', chatSchema);
module.exports = Chat;
