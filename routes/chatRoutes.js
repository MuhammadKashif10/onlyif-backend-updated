'use strict';

const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const { getUserThreads, sendMessage, getConversation } = require('../controllers/chatController');

// List all threads for logged-in user
router.get('/', authMiddleware, getUserThreads);

// Send a message
router.post('/', authMiddleware, sendMessage);

// Get conversation with another user
router.get('/:otherUserId', authMiddleware, getConversation);

module.exports = router;
