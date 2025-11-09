const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../config/env');
const { errorResponse } = require('../utils/responseFormatter');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(
        errorResponse('Access denied. No token provided. Format: Bearer <token>', 401)
      );
    }

    // Extract token (remove 'Bearer ' prefix)
    const token = authHeader.substring(7);
    
    if (!token) {
      return res.status(401).json(
        errorResponse('Access denied. Token is empty.', 401)
      );
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json(
        errorResponse('Token is not valid. User not found.', 401)
      );
    }

    // Check if user is suspended
    if (user.isSuspended) {
      return res.status(403).json(
        errorResponse('Account is suspended. Contact support.', 403)
      );
    }

    // Check if user is not active
    if (!user.isActive) {
      return res.status(403).json(
        errorResponse('Account is not active. Contact support.', 403)
      );
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json(
        errorResponse('Account is temporarily locked due to too many failed login attempts.', 423)
      );
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json(
        errorResponse('Invalid token.', 401)
      );
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json(
        errorResponse('Token expired. Please login again.', 401)
      );
    }
    
    console.error('Auth middleware error:', error);
    return res.status(500).json(
      errorResponse('Server error during authentication.', 500)
    );
  }
};

module.exports = authMiddleware;