const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { successResponse, errorResponse } = require('../utils/responseFormatter');
const emailService = require('../services/emailService');

// Generate JWT Token
// function generateToken()
const generateToken = (id) => {
  const normalizedId = typeof id === 'string' ? id : id?.toString?.() ?? String(id);
  return jwt.sign({ id: normalizedId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d',
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
// function register()
const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, phone, brokerage, yearsOfExperience, specialization } = req.body;

    // Block agent registration - agents can only be created by admin
    if (role === 'agent' || brokerage) {
      return res.status(403).json(
        errorResponse('Agents can only be created by admin', 403)
      );
    }

    // Validate required fields
    if (!firstName  || !email || !password) {
      return res.status(400).json(
        errorResponse('First name, last name, email, and password are required', 400)
      );
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json(
        errorResponse('Password must be at least 8 characters long', 400)
      );
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(409).json(
        errorResponse('User already exists with this email', 409)
      );
    }

    // Combine firstName and lastName into name
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    
    // Only allow buyer and seller roles for public registration (or no role yet)
    const userRole = role ?? null;
    if (userRole !== null && !['buyer', 'seller'].includes(userRole)) {
      return res.status(403).json(
        errorResponse('Only buyer and seller accounts can be created through public registration', 403)
      );
    }

    // Prepare user data
    const userData = {
      name: fullName,
      email: email.toLowerCase().trim(),
      password,
      role: userRole,
      phone: phone ? phone.trim() : undefined
    };

    // Create user
    const user = await User.create(userData);

    const token = generateToken(user._id);

    res.status(201).json(
      successResponse(
        {
          user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone
          },
          token
        },
        'User registered successfully'
      )
    );
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json(
        errorResponse(`Validation failed: ${validationErrors.join(', ')}`, 400)
      );
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(409).json(
        errorResponse('User already exists with this email', 409)
      );
    }
    
    res.status(500).json(
      errorResponse('Server error during registration', 500)
    );
  }
};

const acceptRole = async (req, res) => {
  try {
    const { role, checkboxesAccepted } = req.body;

    if (!checkboxesAccepted) {
      return res.status(400).json(
        errorResponse('All required checkboxes must be accepted', 400)
      );
    }

    if (!role || !['buyer', 'seller'].includes(role)) {
      return res.status(400).json(
        errorResponse('Role must be buyer or seller', 400)
      );
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json(
        errorResponse('User not found', 404)
      );
    }

    if (user.role) {
      return res.status(409).json(
        errorResponse('Role already assigned', 409)
      );
    }

    user.role = role;
    await user.save();

    res.json(
      successResponse(
        user,
        'Role accepted successfully'
      )
    );
  } catch (error) {
    console.error('Accept role error:', error);
    res.status(500).json(
      errorResponse('Server error while accepting role', 500)
    );
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Normalize email to avoid provider-specific canonicalization issues
    const normalizedEmail = (email || '').toLowerCase().trim();

    // Check for user
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      return res.status(401).json(
        errorResponse('Invalid credentials', 401)
      );
    }

    // Block accounts removed by admin (soft delete)
    if (user.isDeleted) {
      return res.status(403).json(
        errorResponse('This account is no longer available.', 403)
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

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json(
        errorResponse('Invalid credentials', 401)
      );
    }

    const token = generateToken(user._id);

    // Remove password from response
    user.password = undefined;

    res.json(
      successResponse(
        {
          user,
          token
        },
        'Login successful'
      )
    );
  } catch (error) {
    res.status(500).json(
      errorResponse('Server error during login', 500)
    );
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.json(
      successResponse(user, 'User profile retrieved successfully')
    );
  } catch (error) {
    res.status(500).json(
      errorResponse('Server error retrieving user profile', 500)
    );
  }
};

// @desc    Change password
// @route   POST /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json(
        errorResponse('Current password and new password are required', 400)
      );
    }

    // Validate new password length
    if (newPassword.length < 6) {
      return res.status(400).json(
        errorResponse('New password must be at least 6 characters long', 400)
      );
    }

    // Get user with password
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json(
        errorResponse('User not found', 404)
      );
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json(
        errorResponse('Current password is incorrect', 400)
      );
    }

    // Check if new password is different from current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json(
        errorResponse('New password must be different from current password', 400)
      );
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    await User.findByIdAndUpdate(userId, { 
      password: hashedNewPassword,
      updatedAt: new Date()
    });

    res.json(
      successResponse(
        { message: 'Password updated successfully' },
        'Password changed successfully'
      )
    );
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json(
      errorResponse('Server error while changing password', 500)
    );
  }
};

// @desc    Send OTP
// @route   POST /api/auth/send-otp
// @access  Public
const sendOtp = async (req, res) => {
  try {
    const { email, phone } = req.body;
    
    if (!email && !phone) {
      return res.status(400).json(
        errorResponse('Email or phone number is required', 400)
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Find user by email or phone
    const query = email ? { email } : { phone };
    const user = await User.findOne(query);
    
    if (!user) {
      return res.status(404).json(
        errorResponse('User not found', 404)
      );
    }

    // Store OTP in user document
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    // In production, send OTP via SMS/Email service
    console.log(`OTP for ${email || phone}: ${otp}`);
    
    res.json(
      successResponse(
        { message: 'OTP sent successfully' },
        'OTP sent successfully'
      )
    );
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json(
      errorResponse('Server error sending OTP', 500)
    );
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
const verifyOtp = async (req, res) => {
  try {
    const { email, phone, otp } = req.body;
    
    if (!otp) {
      return res.status(400).json(
        errorResponse('OTP is required', 400)
      );
    }

    // Find user by email or phone and explicitly select OTP fields
    const query = email ? { email } : { phone };
    const user = await User.findOne(query).select('+otp +otpExpiry');
    
    if (!user) {
      return res.status(404).json(
        errorResponse('User not found', 404)
      );
    }

    // Check if OTP matches and is not expired
    if (user.otp !== otp) {
      return res.status(400).json(
        errorResponse('Invalid OTP', 400)
      );
    }

    if (user.otpExpiry < new Date()) {
      return res.status(400).json(
        errorResponse('OTP has expired', 400)
      );
    }

    // Mark user as verified and clear OTP
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    // Remove password from response
    user.password = undefined;

    res.json(
      successResponse(
        {
          user,
          token
        },
        'OTP verified successfully'
      )
    );
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json(
      errorResponse('Server error verifying OTP', 500)
    );
  }
};

// @desc    Admin login (restricted to seeded accounts)
// @route   POST /api/auth/admin/login
// @access  Public
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Normalize email and find active admin account
    const normalizedEmail = (email || '').toLowerCase().trim();
    const user = await User.findOne({ 
      email: normalizedEmail,
      role: 'admin',
      isDeleted: false
    }).select('+password');
    
    if (!user) {
      return res.status(401).json(
        errorResponse('Invalid admin credentials or account not authorized', 401)
      );
    }

    // Block suspended/inactive admins
    if (user.isSuspended || !user.isActive || user.status === 'suspended') {
      return res.status(403).json(
        errorResponse('Account is not active. Contact support.', 403)
      );
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json(
        errorResponse('Invalid admin credentials', 401)
      );
    }

    const token = generateToken(user._id);

    // Remove password from response
    user.password = undefined;

    res.json(
      successResponse(
        {
          user,
          token
        },
        'Admin login successful'
      )
    );
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json(
      errorResponse('Server error during admin login', 500)
    );
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json(
        errorResponse('Email address is required', 400)
      );
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json(
        errorResponse('No account found with this email address', 404)
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store OTP in user document
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    // Log OTP for development/testing
    console.log(`-----------------------------------------`);
    console.log(`PASSWORD RESET OTP for ${email}: ${otp}`);
    console.log(`-----------------------------------------`);

    // Send OTP via Email
    const emailSubject = 'Password Reset Code';
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #10b981;">Password Reset Code</h2>
        <p>Hello ${user.firstName || user.name},</p>
        <p>We received a request to reset your password. Use the code below to complete the process:</p>
        <div style="background: #f3f4f6; padding: 15px; font-size: 24px; font-weight: bold; text-align: center; border-radius: 8px; margin: 20px 0;">
          ${otp}
        </div>
        <p>This code will expire in 15 minutes. If you did not request this, please ignore this email.</p>
        <p>Best regards,<br>OnlyIf Team</p>
      </div>
    `;

    await emailService.sendEmail(email, emailSubject, emailHtml);

    res.json(
      successResponse(
        { message: 'A password reset code has been sent to your email.' },
        'Password reset code sent successfully'
      )
    );
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json(
      errorResponse('Server error during forgot password', 500)
    );
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json(
        errorResponse('Email, OTP, and new password are required', 400)
      );
    }

    if (newPassword.length < 8) {
      return res.status(400).json(
        errorResponse('New password must be at least 8 characters long', 400)
      );
    }

    // Find user by email and explicitly select OTP fields
    const user = await User.findOne({ email }).select('+otp +otpExpiry');
    if (!user) {
      return res.status(404).json(
        errorResponse('User not found', 404)
      );
    }

    // Verify OTP matches and is not expired
    if (user.otp !== otp) {
      return res.status(400).json(
        errorResponse('Invalid reset code', 400)
      );
    }

    if (user.otpExpiry < new Date()) {
      return res.status(400).json(
        errorResponse('Reset code has expired', 400)
      );
    }

    // Update password and clear OTP fields
    user.password = newPassword; // Pre-save middleware will hash it
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json(
      successResponse(
        { message: 'Password reset successful.' },
        'Password has been reset successfully'
      )
    );
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json(
      errorResponse('Server error during password reset', 500)
    );
  }
};

module.exports = {
  register,
  login,
  getMe,
  changePassword,
  sendOtp,
  verifyOtp,
  adminLogin,
  acceptRole,
  forgotPassword,
  resetPassword
};
