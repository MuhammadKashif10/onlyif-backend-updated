const rateLimit = require('express-rate-limit');
const { errorResponse } = require('../utils/responseFormatter');

// General API rate limiting - increased significantly for development
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // Increased from 1000 to 10,000 requests per windowMs for development
  message: errorResponse('Too many requests from this IP, please try again later.', 429),
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json(
      errorResponse('Too many requests from this IP, please try again later.', 429)
    );
  }
});

// Strict rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased for development
  message: errorResponse('Too many authentication attempts, please try again later.', 429),
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req, res) => {
    res.status(429).json(
      errorResponse('Too many authentication attempts, please try again later.', 429)
    );
  }
});

// Message rate limiting - increased for development
const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Increased from 10 to 100 messages per minute for development
  message: errorResponse('Too many messages sent, please slow down.', 429),
  handler: (req, res) => {
    res.status(429).json(
      errorResponse('Too many messages sent, please slow down.', 429)
    );
  }
});

module.exports = {
  generalLimiter,
  authLimiter,
  messageLimiter
};