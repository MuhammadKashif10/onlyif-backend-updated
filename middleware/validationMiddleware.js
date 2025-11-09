const { body, param, query, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/responseFormatter');

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));
    
    return res.status(400).json(
      errorResponse('Validation failed', 400, { errors: errorMessages })
    );
  }
  next();
};

// Auth validation rules
const validateRegister = [
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('First name can only contain letters and spaces'),
  
  // body('lastName')
  //   .trim()
  //   .isLength({ min: 1, max: 50 })
  //   .withMessage('Last name must be between 1 and 50 characters')
  //   .matches(/^[a-zA-Z\s]+$/)
  //   .withMessage('Last name can only contain letters and spaces'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d).*$/)
    .withMessage('Password must contain at least one letter and one number'),
  
  body('role')
    .optional()
    .isIn(['buyer', 'seller', 'agent'])
    .withMessage('Role must be buyer, seller, or agent'),
  
  // Agent-specific validations
  body('phone')
    .if(body('role').equals('agent'))
    .notEmpty()
    .withMessage('Phone number is required for agents')
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  
  // REMOVE the entire commented licenseNumber validation block
  
  body('brokerage')
    .if(body('role').equals('agent'))
    .notEmpty()
    .withMessage('Brokerage is required for agents')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Brokerage must be between 2 and 100 characters'),
  
  body('yearsOfExperience')
    .if(body('role').equals('agent'))
    .notEmpty()
    .withMessage('Years of experience is required for agents')
    .isInt({ min: 0, max: 50 })
    .withMessage('Years of experience must be between 0 and 50'),
  
  body('specialization')
    .if(body('role').equals('agent'))
    .notEmpty()
    .withMessage('Specialization is required for agents')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Specialization must be between 2 and 100 characters'),
  
  handleValidationErrors
];

const validateLogin = [
  body('email')
    .isEmail()
    .trim()
    .toLowerCase()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  handleValidationErrors
];

// Property validation rules
const validateProperty = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  
  body('address')
    .trim()
    .isLength({ min: 10, max: 200 })
    .withMessage('Address must be between 10 and 200 characters'),
  
  body('city')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('City must be between 2 and 50 characters'),
  
  body('state')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('State must be between 2 and 50 characters'),
  
  body('zipCode')
    .matches(/^\d{5}(-\d{4})?$/)
    .withMessage('Please provide a valid ZIP code'),
  
  body('price')
    .isFloat({ min: 1000, max: 50000000 })
    .withMessage('Price must be between $1,000 and $50,000,000'),
  
  body('beds')
    .isInt({ min: 0, max: 20 })
    .withMessage('Beds must be between 0 and 20'),
  
  body('baths')
    .isFloat({ min: 0, max: 20 })
    .withMessage('Baths must be between 0 and 20'),
  
  body('size')
    .optional()
    .isInt({ min: 100, max: 50000 })
    .withMessage('Size must be between 100 and 50,000 square feet'),
  
  body('squareMeters')
    .isNumeric()
    .withMessage('Square meters must be a number')
    .isFloat({ min: 1, max: 4645 })
    .withMessage('Square meters must be between 1 and 4,645 square meters'),
  
  handleValidationErrors
];

// Message validation rules
const validateMessage = [
  body('text')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters'),
  
  body('threadId')
    .optional()
    .isMongoId()
    .withMessage('Invalid thread ID'),
  
  body('toUserId')
    .optional()
    .isMongoId()
    .withMessage('Invalid user ID'),
  
  body('propertyId')
    .optional()
    .isMongoId()
    .withMessage('Invalid property ID'),
  
  handleValidationErrors
];

// Inspection validation rules
const validateInspection = [
  body('propertyId')
    .isMongoId()
    .withMessage('Invalid property ID'),
  
  body('buyerId')
    .isMongoId()
    .withMessage('Invalid buyer ID'),
  
  body('scheduledDate')
    .isISO8601()
    .toDate()
    .custom((value) => {
      if (value <= new Date()) {
        throw new Error('Scheduled date must be in the future');
      }
      return true;
    }),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
  
  handleValidationErrors
];

// Terms acceptance validation
const validateTermsAcceptance = [
  body('role')
    .isIn(['buyer', 'seller', 'agent', 'admin'])
    .withMessage('Invalid role'),
  
  body('version')
    .notEmpty()
    .withMessage('Version is required'),
  
  body('scrolledToBottom')
    .optional()
    .isBoolean()
    .withMessage('scrolledToBottom must be a boolean'),
  
  handleValidationErrors
];

// MongoDB ID validation
const validateMongoId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),
  
  handleValidationErrors
];

// Specific validator for :threadId param used in message routes
const validateThreadId = [
  param('threadId')
    .isMongoId()
    .withMessage('Invalid thread ID format'),
  handleValidationErrors
];

module.exports = {
  validateRegister,
  validateLogin,
  validateProperty,
  validateMessage,
  validateInspection,
  validateTermsAcceptance,
  validateMongoId,
  validateThreadId,
  handleValidationErrors
};
