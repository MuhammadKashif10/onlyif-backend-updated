const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { messageLimiter } = require('../middleware/rateLimitMiddleware');
const { validateMessage, validateThreadId } = require('../middleware/validationMiddleware');
const { enforceMessageRouting } = require('../middleware/messageSecurityMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendMessage, getConversation, getUserThreads, markThreadAsRead, ensureThread } = require('../controllers/messageController');

// List conversations for the authenticated user
router.get('/', authMiddleware, asyncHandler(getUserThreads));

// Ensure/find/create a thread between current user and another user for a property (must be BEFORE :threadId)
router.get('/ensure-thread', authMiddleware, asyncHandler(ensureThread));

// Send a message in a thread or create a thread
router.post('/', authMiddleware, messageLimiter, validateMessage, enforceMessageRouting, asyncHandler(sendMessage));

// Alias to match spec: POST /api/messages/send with a more permissive body shape
router.post('/send', authMiddleware, messageLimiter, asyncHandler(sendMessage));

// Get messages in a conversation
router.get('/:threadId', authMiddleware, validateThreadId, asyncHandler(getConversation));

// Mark all messages in a conversation as read
router.put('/:threadId/read', authMiddleware, validateThreadId, asyncHandler(markThreadAsRead));

module.exports = router;
