const BuyerNotification = require('../models/BuyerNotification');
const { validationResult } = require('express-validator');
const newPropertyNotificationService = require('../services/newPropertyNotificationService');

// Get notifications for user
exports.getNotifications = async (req, res) => {
  try {
    const { status = 'unread', limit = 20, page = 1 } = req.query;
    
    const query = { userId: req.user.id };
    if (status !== 'all') {
      query.status = status;
    }

    const notifications = await BuyerNotification.find(query)
      .populate('data.propertyId', 'title address price images')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await BuyerNotification.countDocuments(query);
    const unreadCount = await BuyerNotification.countDocuments({
      userId: req.user.id,
      status: 'unread'
    });

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          count: notifications.length,
          totalCount: total
        },
        unreadCount
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await BuyerNotification.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { 
        status: 'read',
        readAt: new Date()
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    await BuyerNotification.updateMany(
      { userId: req.user.id, status: 'unread' },
      { 
        status: 'read',
        readAt: new Date()
      }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Create notification (internal use)
exports.createNotification = async (userId, notificationData) => {
  try {
    const notification = new BuyerNotification({
      userId,
      ...notificationData
    });

    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await BuyerNotification.findOneAndDelete({
      _id: id,
      userId: req.user.id
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Send notification to all buyers when new property is added
exports.notifyBuyersAboutNewProperty = async (property) => {
  try {
    console.log(`📢 Triggering new property notifications for: ${property.title}`);
    const result = await newPropertyNotificationService.notifyBuyersAboutNewProperty(property);
    return result;
  } catch (error) {
    console.error('Error sending new property notifications:', error);
    throw error;
  }
};

// Send notification to all buyers about price drop
exports.notifyBuyersAboutPriceDrop = async (property, oldPrice) => {
  try {
    console.log(`💰 Triggering price drop notifications for: ${property.title}`);
    const result = await newPropertyNotificationService.notifyBuyersAboutPriceDrop(property, oldPrice);
    return result;
  } catch (error) {
    console.error('Error sending price drop notifications:', error);
    throw error;
  }
};
