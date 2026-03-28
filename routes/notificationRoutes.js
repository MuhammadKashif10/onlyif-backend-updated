const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount
} = require('../controllers/notificationController');

router.get('/', authMiddleware, asyncHandler(getNotifications));
router.get('/unread-count', authMiddleware, asyncHandler(getUnreadCount));
router.patch('/read-all', authMiddleware, asyncHandler(markAllAsRead));
router.patch('/:id/read', authMiddleware, asyncHandler(markAsRead));

module.exports = router;