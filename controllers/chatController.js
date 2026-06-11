'use strict';

const Chat = require('../models/Chat');
const User = require('../models/User');

// True if the user holds the given role (primary `role` or in `roles[]`).
const hasRole = (u, role) => !!(u && (u.role === role || (Array.isArray(u.roles) && u.roles.includes(role))));

/**
 * Send a new message (buyer ⇄ agent only).
 * POST /chat
 */
exports.sendMessage = async (req, res, next) => {
  try {
    const senderId = req.user._id;
    console.log("🚀 ~ senderId:", senderId)
    const { receiverId, text } = req.body;
    console.log("🚀 ~ receiverId:", receiverId)

    if (!receiverId || !text) {
      return res.status(400).json({ message: 'receiverId and text are required' });
    }

    // Enforce agent-mediated workflow: block direct buyer <-> seller messaging.
    // Allowed: buyer<->agent, seller<->agent (any pair where an agent is involved).
    const receiver = await User.findById(receiverId).select('role roles');
    if (!receiver) {
      return res.status(404).json({ message: 'Recipient not found' });
    }
    const senderIsBuyer = hasRole(req.user, 'buyer');
    const senderIsSeller = hasRole(req.user, 'seller');
    const senderIsAgent = hasRole(req.user, 'agent');
    const receiverIsBuyer = hasRole(receiver, 'buyer');
    const receiverIsSeller = hasRole(receiver, 'seller');
    const receiverIsAgent = hasRole(receiver, 'agent');

    const isBuyerSellerPair =
      (senderIsBuyer && receiverIsSeller) || (senderIsSeller && receiverIsBuyer);
    // Only block when no agent is part of the conversation.
    if (isBuyerSellerPair && !senderIsAgent && !receiverIsAgent) {
      return res.status(403).json({
        message: 'Direct buyer-seller messaging is not allowed. Please communicate through the assigned agent.'
      });
    }

    // Save to DB
    const message = await Chat.send({ senderId, receiverId, text });

    // 🔥 Emit real-time event via Socket.IO
    if (req.io) {
      // send back to sender
      req.io.to(senderId.toString()).emit('message', message);
      // send to receiver
      req.io.to(receiverId.toString()).emit('message', message);
    }

    return res.status(201).json(message);
  } catch (err) {
    next(err);
  }
};

/**
 * Get conversation between current user and another participant
 * GET /chat/:otherUserId
 */
exports.getConversation = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { otherUserId } = req.params;

    const messages = await Chat.find({
      $or: [
        { sender: userId, receiver: otherUserId },
        { sender: otherUserId, receiver: userId },
      ],
    }).sort({ createdAt: 1 });

    return res.json(messages);
  } catch (err) {
    next(err);
  }
};

/**
 * Get all threads for current user (inbox style)
 * GET /chat
 */
exports.getUserThreads = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const threads = await Chat.aggregate([
      { $match: { $or: [{ sender: userId }, { receiver: userId }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$conversationKey',
          lastMessage: { $first: '$$ROOT' },
        },
      },
    ]);

    return res.json(threads);
  } catch (err) {
    next(err);
  }
};
