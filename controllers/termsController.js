const TermsAcceptance = require('../models/TermsAcceptance');
const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/responseFormatter');

// Terms content by role
const TERMS_CONTENT = {
  buyer: {
    version: '1.0',
    title: 'Buyer Terms & Conditions',
    content: `
      <h2>Buyer Terms & Conditions</h2>
      <p>By using our platform as a buyer, you agree to the following terms...</p>
      <h3>1. Property Viewing</h3>
      <p>You may view public property listings and request private viewings through assigned agents.</p>
      <h3>2. Communication</h3>
      <p>All communication with sellers must go through assigned agents.</p>
      <h3>3. Inspections</h3>
      <p>Property inspections must be scheduled through agents and are subject to availability.</p>
      <h3>4. Offers</h3>
      <p>All offers must be submitted through the platform and are legally binding once accepted.</p>
    `
  },
  seller: {
    version: '1.0',
    title: 'Seller Terms & Conditions',
    content: `
      <h2>Seller Terms & Conditions</h2>
      <p>By using our platform as a seller, you agree to the following terms...</p>
      <h3>1. Property Listings</h3>
      <p>You are responsible for providing accurate property information and media.</p>
      <h3>2. Agent Assignment</h3>
      <p>You may assign agents to help with your property sale and communication with buyers.</p>
      <h3>3. Add-on Services</h3>
      <p>Professional services like photography and virtual tours are available for purchase.</p>
      <h3>4. Commission</h3>
      <p>Platform fees and agent commissions apply as outlined in your agreement.</p>
    `
  },
  agent: {
    version: '1.0',
    title: 'Agent Terms & Conditions',
    content: `
      <h2>Agent Terms & Conditions</h2>
      <p>By using our platform as an agent, you agree to the following terms...</p>
      <h3>1. Professional Conduct</h3>
      <p>You must maintain professional standards in all client interactions.</p>
      <h3>2. Property Management</h3>
      <p>You may be assigned to help sellers with property listings and buyer communication.</p>
      <h3>3. Inspections</h3>
      <p>You are responsible for scheduling and managing property inspections.</p>
      <h3>4. Commission Structure</h3>
      <p>Your commission structure is defined in your agent agreement.</p>
    `
  },
  admin: {
    version: '1.0',
    title: 'Administrator Terms & Conditions',
    content: `
      <h2>Administrator Terms & Conditions</h2>
      <p>As an administrator, you have additional responsibilities...</p>
      <h3>1. Platform Management</h3>
      <p>You are responsible for maintaining platform integrity and user safety.</p>
      <h3>2. User Management</h3>
      <p>You have the authority to suspend or remove users who violate terms.</p>
      <h3>3. Content Moderation</h3>
      <p>You must review and approve property listings and user-generated content.</p>
      <h3>4. Data Protection</h3>
      <p>You must ensure user data is protected according to privacy regulations.</p>
    `
  }
};

// @desc    Get terms & conditions for role
// @route   GET /api/terms/:role
// @access  Public
const getTermsByRole = async (req, res) => {
  const { role } = req.params;
  
  if (!TERMS_CONTENT[role]) {
    return res.status(404).json(
      errorResponse('Terms not found for this role', 404)
    );
  }

  res.json(
    successResponse(TERMS_CONTENT[role], 'Terms retrieved successfully')
  );
};

// @desc    Accept terms & conditions
// @route   POST /api/terms/accept
// @access  Private
const acceptTerms = async (req, res) => {
  const { role, version, scrolledToBottom } = req.body;
  
  if (!role || !version) {
    return res.status(400).json(
      errorResponse('Role and version are required', 400)
    );
  }

  if (!TERMS_CONTENT[role]) {
    return res.status(400).json(
      errorResponse('Invalid role', 400)
    );
  }

  // Validate version matches current
  if (version !== TERMS_CONTENT[role].version) {
    return res.status(400).json(
      errorResponse('Version mismatch. Please review latest terms.', 400)
    );
  }

  // Check scroll-to-bottom if frontend sends flag
  if (scrolledToBottom === false) {
    return res.status(400).json(
      errorResponse('Please read the complete terms before accepting', 400)
    );
  }

  const acceptanceData = {
    user: req.user.id,
    role,
    version,
    acceptedAt: new Date(),
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  };

  // Create acceptance record
  await TermsAcceptance.create(acceptanceData);

  // Update user record
  await User.findByIdAndUpdate(req.user.id, {
    termsAccepted: true,
    termsAcceptedAt: acceptanceData.acceptedAt,
    termsVersion: version
  });

  res.json(
    successResponse(
      {
        accepted: true,
        role,
        version,
        acceptedAt: acceptanceData.acceptedAt
      },
      'Terms accepted successfully'
    )
  );
};

// @desc    Get user's terms acceptance status
// @route   GET /api/terms/status
// @access  Private
const getAcceptanceStatus = async (req, res) => {
  const user = await User.findById(req.user.id).select('termsAccepted termsAcceptedAt termsVersion role');
  
  const currentVersion = TERMS_CONTENT[user.role]?.version;
  const needsUpdate = !user.termsAccepted || user.termsVersion !== currentVersion;

  res.json(
    successResponse({
      termsAccepted: user.termsAccepted,
      termsAcceptedAt: user.termsAcceptedAt,
      termsVersion: user.termsVersion,
      currentVersion,
      needsUpdate
    }, 'Terms status retrieved successfully')
  );
};

module.exports = {
  getTermsByRole,
  acceptTerms,
  getAcceptanceStatus
};