const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/responseFormatter');
const emailService = require('../services/emailService');

const requestAgentRole = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    if (user.role === 'admin') {
      return res.status(403).json(errorResponse('Admin accounts cannot request agent access', 403));
    }

    if (user.role && user.role !== 'agent') {
      return res.status(409).json(errorResponse('Role already assigned', 409));
    }

    if (user.role === 'agent' && user.agentStatus === 'approved') {
      return res.status(409).json(errorResponse('Agent account is already approved', 409));
    }

    user.role = 'agent';
    user.agentStatus = 'pending';
    user.isActive = true;
    user.isSuspended = false;
    await user.save();

    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const adminPanelUrl = `${(process.env.FRONTEND_URL || 'http://localhost:3010').replace(/\/$/, '')}/admin/dashboard`;

    if (adminEmail) {
      const subject = `New Agent Request — ${user.name}`;
      const html = `
        <h2>New Agent Request</h2>
        <p>A user has requested agent access.</p>
        <p><strong>Name:</strong> ${user.name}</p>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Phone:</strong> ${user.phone || 'Not provided'}</p>
        <p><a href="${adminPanelUrl}">Open Admin Panel</a></p>
      `;
      await emailService.sendEmail(adminEmail, subject, html);
    }

    return res.json(
      successResponse(
        {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          agentStatus: user.agentStatus,
        },
        'Agent request submitted successfully'
      )
    );
  } catch (error) {
    console.error('Error requesting agent role:', error);
    return res.status(500).json(errorResponse('Server error while requesting agent role', 500));
  }
};

module.exports = {
  requestAgentRole,
};
