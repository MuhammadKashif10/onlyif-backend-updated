'use strict';

const Chat = require('../models/Chat');

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
