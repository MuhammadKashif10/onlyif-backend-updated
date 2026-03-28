const { errorResponse } = require('../utils/responseFormatter');
const logger = require('../utils/logger');

// Async handler wrapper to catch async errors
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error(err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    return res.status(404).json(errorResponse(message, 404));
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    return res.status(400).json(errorResponse(message, 400));
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    return res.status(400).json(errorResponse(message, 400));
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    return res.status(401).json(errorResponse(message, 401));
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    return res.status(401).json(errorResponse(message, 401));
  }

  // Default error
  res.status(error.statusCode || 500).json(
    errorResponse(
      error.message || 'Server Error',
      error.statusCode || 500,
      process.env.NODE_ENV === 'development' ? err.stack : null
    )
  );
};

module.exports = { errorHandler, asyncHandler };