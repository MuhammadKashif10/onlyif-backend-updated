const { body, param, validationResult } = require('express-validator');
const Property = require('../models/Property');
const { errorResponse } = require('../utils/responseFormatter');

// Validation rules for status updates
const statusUpdateValidation = [
  // Validate property ID
  param('id')
    .custom(async (idOrSlug, { req }) => {
      // Accept either MongoId or slug and attach the property to req
      let property = null;
      try {
        const mongoose = require('mongoose');
        if (mongoose.Types.ObjectId.isValid(idOrSlug) && String(idOrSlug).length === 24) {
          property = await Property.findById(idOrSlug);
        } else {
          property = await Property.findOne({ slug: idOrSlug });
        }
      } catch {}
      if (!property) {
        throw new Error('Property not found');
      }
      if (property.isDeleted) {
        throw new Error('Cannot update status of deleted property');
      }
      req.property = property;
      return true;
    }),

  // Optional: sellerId must be a valid ObjectId and match the property owner
  body('sellerId')
    .optional()
    .isMongoId()
    .withMessage('Invalid sellerId format')
    .custom((sellerId, { req }) => {
      const property = req.property;
      if (property && property.owner && property.owner.toString() !== sellerId) {
        throw new Error('Seller ID does not match the property owner');
      }
      return true;
    }),

  // Validate status value
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(['contract-exchanged', 'unconditional', 'settled'])
    .withMessage('Invalid status. Must be one of: contract-exchanged, unconditional, settled')
    .custom(async (newStatus, { req }) => {
      const property = req.property;
      // Idempotent: allow same status (no-op). Controller can short-circuit if desired.
      // Optional: Validate status progression (business rules)
      const currentStatus = property.salesStatus;
      const validProgressions = {
        null: ['contract-exchanged', 'unconditional', 'settled'], // Can jump to any status from null
        'contract-exchanged': ['unconditional', 'settled'],
        'unconditional': ['settled']
      };
      
      if (currentStatus && validProgressions[currentStatus] && 
          !validProgressions[currentStatus].includes(newStatus)) {
        console.warn(`⚠️ Unusual status progression: ${currentStatus} -> ${newStatus} for property ${property._id}`);
        // Log but do not block.
      }
      return true;
    }),

  // Optional: Validate settlement details for 'settled' status
  body('settlementDetails')
    .optional()
    .isObject()
    .withMessage('Settlement details must be an object'),
    
  body('settlementDetails.settlementDate')
    .optional()
    .isISO8601()
    .withMessage('Settlement date must be a valid date')
    .custom((settlementDate) => {
      const date = new Date(settlementDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (date > new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000)) {
        throw new Error('Settlement date cannot be more than 1 year in the future');
      }
      return true;
    }),

  body('settlementDetails.commissionRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Commission rate must be between 0 and 100'),

  // Legal release confirmation for triggering platform invoice (optional boolean)
  body('settlementDetails.legalReleaseConfirmed')
    .optional()
    .isBoolean()
    .withMessage('legalReleaseConfirmed must be a boolean')
    .toBoolean(),

  body('changeReason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Change reason cannot exceed 500 characters')
    .trim()
];

// Middleware to check validation results
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value
    }));
    
    console.log('❌ Validation errors:', formattedErrors);
    
    return res.status(400).json(
      errorResponse(
        'Validation failed',
        400,
        {
          errors: formattedErrors,
          details: 'Please check your input and try again'
        }
      )
    );
  }
  
  next();
};

// Authorization middleware specific to status updates
const checkStatusUpdateAuthorization = async (req, res, next) => {
  try {
    const property = req.property;
    const user = req.user;
    
    // Check if user is an agent
    if (user.role !== 'agent') {
      return res.status(403).json(
        errorResponse(
          'Access denied. Only agents can update property sales status',
          403,
          { requiredRole: 'agent', userRole: user.role }
        )
      );
    }
    
    // Check if agent is assigned to this property
    const isAssignedAgent = property.agents.some(
      agentAssignment => 
        agentAssignment.agent.toString() === user.id && 
        agentAssignment.isActive
    );
    
    if (!isAssignedAgent) {
      return res.status(403).json(
        errorResponse(
          'Access denied. You are not assigned to this property',
          403,
          { 
            propertyId: property._id,
            assignedAgents: property.agents.filter(a => a.isActive).map(a => a.agent)
          }
        )
      );
    }
    
    // Check if property is in a status that can be updated
    if (property.status === 'sold' && req.body.status !== 'settled') {
      return res.status(400).json(
        errorResponse(
          'Cannot change status of sold property unless settling',
          400,
          { currentPropertyStatus: property.status }
        )
      );
    }
    
    next();
  } catch (error) {
    console.error('Authorization check error:', error);
    return res.status(500).json(
      errorResponse('Authorization check failed', 500)
    );
  }
};

// Rate limiting for status updates (prevent spam)
const statusUpdateRateLimit = {
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Maximum 10 status updates per 5 minutes per IP
  message: {
    error: 'Too many status update attempts',
    message: 'Please wait before making another status update',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for admin users
    return req.user && req.user.role === 'admin';
  }
};

// Sanitization middleware
const sanitizeStatusInput = (req, res, next) => {
  // Normalize sellerID -> sellerId if present
  if (!req.body.sellerId && req.body.sellerID) {
    req.body.sellerId = req.body.sellerID;
  }
  if (typeof req.body.sellerId === 'string') {
    req.body.sellerId = req.body.sellerId.trim();
  }

  if (req.body.changeReason) {
    req.body.changeReason = req.body.changeReason.trim();
  }
  
  if (req.body.settlementDetails) {
    // Sanitize settlement details
    const details = req.body.settlementDetails;
    
    if (details.solicitorName) {
      details.solicitorName = details.solicitorName.trim();
    }
    
    if (details.solicitorEmail) {
      details.solicitorEmail = details.solicitorEmail.toLowerCase().trim();
    }
    
    if (details.conveyancerName) {
      details.conveyancerName = details.conveyancerName.trim();
    }
    
    if (details.conveyancerEmail) {
      details.conveyancerEmail = details.conveyancerEmail.toLowerCase().trim();
    }
  }
  
  next();
};

// Logging middleware for status updates
const logStatusUpdate = (req, res, next) => {
  const startTime = Date.now();
  
  // Log the request
  console.log(`🔄 Status update request: ${req.method} ${req.path}`, {
    propertyId: req.params.id,
    newStatus: req.body.status,
    agentId: req.user?.id,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  
  // Override res.json to log the response
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    
    if (data.success) {
      console.log(`✅ Status update successful (${duration}ms):`, {
        propertyId: req.params.id,
        status: req.body.status,
        agentId: req.user?.id,
        duration
      });
    } else {
      console.log(`❌ Status update failed (${duration}ms):`, {
        propertyId: req.params.id,
        error: data.message,
        agentId: req.user?.id,
        duration
      });
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

module.exports = {
  statusUpdateValidation,
  handleValidationErrors,
  checkStatusUpdateAuthorization,
  statusUpdateRateLimit,
  sanitizeStatusInput,
  logStatusUpdate
};
