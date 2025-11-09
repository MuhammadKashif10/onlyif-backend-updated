const Property = require('../models/Property');
const Inspection = require('../models/Inspection');
const Message = require('../models/Message');
const MessageThread = require('../models/MessageThread');
const User = require('../models/User');
const Agent = require('../models/Agent');
const { successResponse, errorResponse } = require('../utils/responseFormatter');

// @desc    Get agent statistics
// @route   GET /api/agent/:agentId/stats
// @access  Private (Agent only)
const getAgentStats = async (req, res) => {
  try {
    const agentId = req.params.agentId;
    
    // Get assigned properties count
    const assignedProperties = await Property.countDocuments({ 
      assignedAgent: agentId,
      status: { $in: ['active', 'pending'] }
    });
    
    // Get pending inspections count
    const pendingInspections = await Inspection.countDocuments({
      agent: agentId,
      status: { $in: ['scheduled', 'confirmed'] },
      isDeleted: false
    });
    
    // Get completed inspections count
    const completedInspections = await Inspection.countDocuments({
      agent: agentId,
      status: 'completed',
      isDeleted: false
    });
    
    // Get new messages count (unread)
    const newMessages = await Message.countDocuments({
      recipient: agentId,
      isRead: false
    });
    
    const stats = {
      assignedProperties,
      pendingInspections,
      newMessages,
      completedInspections
    };
    
    res.json({
      success: true,
      data: stats,
      message: 'Agent stats retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching agent stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent statistics'
    });
  }
};

// @desc    Get agent profile
// @route   GET /api/agent/:agentId/profile
// @access  Private
const getAgentProfile = async (req, res) => {
  try {
    const { agentId } = req.params;
    
    const agent = await User.findById(agentId)
      .select('-password -otp -otpExpires')
      .populate('assignedProperties', 'title address price status');
    
    if (!agent || agent.role !== 'agent') {
      return res.status(404).json(
        errorResponse('Agent not found', 404)
      );
    }

    return res.status(200).json(
      successResponse(agent, 'Agent profile retrieved successfully')
    );

  } catch (error) {
    console.error('Error fetching agent profile:', error);
    return res.status(500).json(
      errorResponse('Internal server error', 500)
    );
  }
};

// @desc    Get agent's assigned properties
// @route   GET /api/agent/:agentId/properties
// @access  Private
const getAgentProperties = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { page = 1, limit = 10, status } = req.query;
    
    // Build query
    const query = {
      'agents.agent': agentId,
      'agents.isActive': true,
      isDeleted: false
    };
    
    if (status) {
      query.status = status;
    }

    const properties = await Property.find(query)
      .populate('owner', 'name email phone')
      .populate('agents.agent', 'name email phone')
      .sort({ dateListed: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Property.countDocuments(query);

    return res.status(200).json(
      successResponse({
        properties,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total
      }, 'Agent properties retrieved successfully')
    );

  } catch (error) {
    console.error('Error fetching agent properties:', error);
    return res.status(500).json(
      errorResponse('Internal server error', 500)
    );
  }
};

// @desc    Get agent activities
// @route   GET /api/agent/:agentId/activities
// @access  Private (Agent only)
const getAgentActivities = async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const activities = [];
    
    // Get recent property assignments
    const recentAssignments = await Property.find({
      assignedAgent: agentId,
      assignedDate: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }).sort({ assignedDate: -1 }).limit(5);
    
    recentAssignments.forEach(assignment => {
      activities.push({
        id: assignment._id.toString(),
        type: 'property_assigned',
        title: `New property assigned: ${assignment.title}`,
        timestamp: assignment.assignedDate || assignment.createdAt
      });
    });
    
    // Get recent inspections
    const recentInspections = await Inspection.find({
      agent: agentId,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      isDeleted: false
    }).populate('property', 'title').sort({ createdAt: -1 }).limit(5);
    
    recentInspections.forEach(inspection => {
      activities.push({
        id: inspection._id.toString(),
        type: 'inspection',
        title: `Inspection scheduled for ${inspection.property.title}`,
        timestamp: inspection.createdAt
      });
    });
    
    // Get recent messages
    const recentMessages = await Message.find({
      recipient: agentId,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }).populate('sender', 'name').sort({ createdAt: -1 }).limit(5);
    
    recentMessages.forEach(message => {
      activities.push({
        id: message._id.toString(),
        type: 'message',
        title: `New message from ${message.sender.name}`,
        timestamp: message.createdAt
      });
    });
    
    // Sort all activities by timestamp and get top 10
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const topActivities = activities.slice(0, 10);
    
    res.json({
      success: true,
      data: {
        activities: topActivities
      },
      message: 'Agent activities retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching agent activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent activities'
    });
  }
};

// Create agent handler (update yours where appropriate)
exports.createAgent = async (req, res) => {
  try {
    // If multipart/form-data is used, body fields are in req.body
    const {
      name,
      email,
      password, // ensure password handling/hashing happens elsewhere as per your project
      phone,
      experience,
      location,
      description,
      bankAccountNumber // <-- new
    } = req.body;

    // Validate required bankAccountNumber (digits only)
    if (!bankAccountNumber || !/^\d+$/.test(bankAccountNumber.trim())) {
      return res.status(400).json({ message: 'Bank account number is required and must contain digits only.' });
    }

    // ...existing checks like email uniqueness etc...

    const newAgentData = {
      name,
      email,
      phone,
      licenseNumber: '',
      status: 'approved', // adjust per your flow
      experience,
      location,
      description,
      bankAccountNumber // persist
    };

    // handle profile image if uploaded (e.g., req.file)
    if (req.file && req.file.path) {
      newAgentData.profileImage = req.file.path; // adapt to your storage logic
    }

    const agent = new Agent(newAgentData);
    await agent.save();

    // Return created agent (minimal)
    return res.status(201).json({
      id: agent._id,
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      profileImage: agent.profileImage,
      bankAccountNumber: agent.bankAccountNumber // include field in response
    });
  } catch (err) {
    console.error('Error creating agent:', err);
    // handle validation errors from mongoose
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: 'Server error creating agent' });
  }
};

// Helper function to format timestamp
const formatTimestamp = (date) => {
  const now = new Date();
  const diffInMs = now - date;
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} ago`;
  } else {
    return `${diffInDays} day${diffInDays !== 1 ? 's' : ''} ago`;
  }
};

// Helper function to parse timestamp for sorting
const parseTimestamp = (timestamp) => {
  const now = new Date();
  const match = timestamp.match(/(\d+)\s+(minute|hour|day)s?\s+ago/);
  if (!match) return now;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 'minute':
      return new Date(now.getTime() - value * 60 * 1000);
    case 'hour':
      return new Date(now.getTime() - value * 60 * 60 * 1000);
    case 'day':
      return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    default:
      return now;
  }
};

module.exports = {
  getAgentStats,
  getAgentProfile,
  getAgentProperties,
  getAgentActivities
};