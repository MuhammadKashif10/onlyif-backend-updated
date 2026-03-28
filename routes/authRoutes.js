const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimitMiddleware');
const { validateRegister, validateLogin } = require('../middleware/validationMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  register,
  login,
  getMe,
  changePassword,
  adminLogin,
  sendOtp,
  verifyOtp
} = require('../controllers/authController');

// Public routes with rate limiting and validation
router.post('/register', authLimiter, validateRegister, asyncHandler(register));
router.post('/login', authLimiter, validateLogin, asyncHandler(login));

// OTP routes
router.post('/send-otp', [
  authLimiter,
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().isMobilePhone()
], asyncHandler(sendOtp));

router.post('/verify-otp', [
  authLimiter,
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().isMobilePhone(),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric()
], asyncHandler(verifyOtp));

// Protected routes
router.get('/me', authMiddleware, asyncHandler(getMe));
router.post('/change-password', authMiddleware, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters long')
], asyncHandler(changePassword));

// Admin login route (no registration for admin)
router.post('/admin/login', [
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], asyncHandler(adminLogin)); // Fix the reference

module.exports = router;