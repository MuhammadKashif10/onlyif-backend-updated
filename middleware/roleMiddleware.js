const { errorResponse } = require('../utils/responseFormatter');

/**
 * Role-based access control middleware
 * @param {...string} allowedRoles - Roles that are allowed to access the route
 * @returns {Function} Express middleware function
 */
const allowRoles = (...allowedRoles) => {
  return (req, res, next) => {
    // Check if user is authenticated (should be set by authMiddleware)
    if (!req.user) {
      return res.status(401).json(
        errorResponse('Authentication required.', 401)
      );
    }

    // Check if user's role is in the allowed roles
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json(
        errorResponse(
          `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.user.role}`,
          403
        )
      );
    }

    next();
  };
};

/**
 * Middleware to allow only sellers
 */
const allowSeller = allowRoles('seller');

/**
 * Middleware to allow only buyers
 */
const allowBuyer = allowRoles('buyer');

/**
 * Middleware to allow only agents
 */
const allowAgent = allowRoles('agent');

/**
 * Middleware to allow only admins
 */
const allowAdmin = allowRoles('admin');

/**
 * Middleware to allow sellers and agents
 */
const allowSellerOrAgent = allowRoles('seller', 'agent');

/**
 * Middleware to allow buyers and agents
 */
const allowBuyerOrAgent = allowRoles('buyer', 'agent');

/**
 * Middleware to allow agents and admins
 */
const allowAgentOrAdmin = allowRoles('agent', 'admin');

/**
 * Middleware to allow all authenticated users except admins
 */
const allowUsers = allowRoles('seller', 'buyer', 'agent');

module.exports = {
  allowRoles,
  allowSeller,
  allowBuyer,
  allowAgent,
  allowAdmin,
  allowSellerOrAgent,
  allowBuyerOrAgent,
  allowAgentOrAdmin,
  allowUsers
};