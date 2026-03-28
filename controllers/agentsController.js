const User = require('../models/User');
const Property = require('../models/Property');
const Inspection = require('../models/Inspection');
const bcrypt = require('bcryptjs');
const { successResponse, errorResponse } = require('../utils/responseFormatter');

// @desc    Get all agents
// @route   GET /api/agents
// @access  Public
const getAllAgents = async (req, res) => {
  try {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const agents = await User.find({
      role: 'agent',
      isActive: true,
      isDeleted: false
    })
    .select('name email phone avatar agentProfile createdAt')
    .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

    // Get additional stats for each agent
    const agentsWithStats = await Promise.all(
      agents.map(async (agent) => {
        const assignedProperties = await Property.countDocuments({
          assignedAgent: agent._id,
          status: { $in: ['active', 'pending'] }
        });
        
        const completedInspections = await Inspection.countDocuments({
          agent: agent._id,
          status: 'completed',
          isDeleted: false
        });

        return {
          ...agent,
          stats: {
            assignedProperties,
            completedInspections,
            experience: agent.agentProfile?.yearsOfExperience || 0,
            rating: 4.5 + Math.random() * 0.5, // Mock rating for now
            reviews: Math.floor(Math.random() * 50) + 10 // Mock reviews count
          }
        };
      })
    );

    const total = await User.countDocuments({
      role: 'agent',
      isActive: true,
      isDeleted: false
    });

    res.json({
      success: true,
      data: agentsWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      message: 'Agents retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agents'
    });
  }
};

// @desc    Get top performing agents
// @route   GET /api/agents/top
// @access  Public
const getTopAgents = async (req, res) => {
  try {
    const { limit = 3 } = req.query;
    
    const agents = await User.find({
      role: 'agent',
      isActive: true,
      isDeleted: false
    })
    .select('name email phone avatar agentProfile createdAt')
    .limit(parseInt(limit))
    .lean();

    // Get stats and sort by performance
    const agentsWithStats = await Promise.all(
      agents.map(async (agent) => {
        const assignedProperties = await Property.countDocuments({
          assignedAgent: agent._id,
          status: { $in: ['active', 'pending'] }
        });
        
        const completedInspections = await Inspection.countDocuments({
          agent: agent._id,
          status: 'completed',
          isDeleted: false
        });

        const soldProperties = await Property.countDocuments({
          assignedAgent: agent._id,
          status: 'sold'
        });

        return {
          ...agent,
          stats: {
            assignedProperties,
            completedInspections,
            soldProperties,
            experience: agent.agentProfile?.yearsOfExperience || 0,
            rating: 4.5 + Math.random() * 0.5,
            reviews: Math.floor(Math.random() * 50) + 10,
            performance: soldProperties * 2 + completedInspections
          }
        };
      })
    );

    // Sort by performance score
    agentsWithStats.sort((a, b) => b.stats.performance - a.stats.performance);

    res.json({
      success: true,
      data: agentsWithStats,
      message: 'Top agents retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching top agents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top agents'
    });
  }
};

// @desc    Get agent by ID
// @route   GET /api/agents/:id
// @access  Public
const getAgentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const agent = await User.findOne({
      _id: id,
      role: 'agent',
      isActive: true,
      isDeleted: false
    })
    .select('name email phone avatar agentProfile createdAt')
    .lean();

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    // Get agent stats
    const assignedProperties = await Property.countDocuments({
      assignedAgent: agent._id,
      status: { $in: ['active', 'pending'] }
    });
    
    const completedInspections = await Inspection.countDocuments({
      agent: agent._id,
      status: 'completed',
      isDeleted: false
    });

    const soldProperties = await Property.countDocuments({
      assignedAgent: agent._id,
      status: 'sold'
    });

    const agentWithStats = {
      ...agent,
      stats: {
        assignedProperties,
        completedInspections,
        soldProperties,
        experience: agent.agentProfile?.yearsOfExperience || 0,
        rating: 4.5 + Math.random() * 0.5,
        reviews: Math.floor(Math.random() * 50) + 10
      }
    };

    res.json({
      success: true,
      data: agentWithStats,
      message: 'Agent retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent'
    });
  }
};

// @desc    Search agents
// @route   GET /api/agents/search
// @access  Public
const searchAgents = async (req, res) => {
  try {
    const { q, area, specialization, experience } = req.query;
    
    let query = {
      role: 'agent',
      isActive: true,
      isDeleted: false
    };

    if (q) {
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { 'agentProfile.bio': { $regex: q, $options: 'i' } },
        { 'agentProfile.brokerage': { $regex: q, $options: 'i' } }
      ];
    }

    if (area) {
      query['agentProfile.serviceAreas.city'] = { $regex: area, $options: 'i' };
    }

    if (specialization) {
      query['agentProfile.specializations'] = specialization;
    }

    if (experience) {
      query['agentProfile.yearsOfExperience'] = { $gte: parseInt(experience) };
    }

    const agents = await User.find(query)
      .select('name email phone avatar agentProfile createdAt')
      .lean();

    res.json({
      success: true,
      data: agents,
      message: 'Search results retrieved successfully'
    });
  } catch (error) {
    console.error('Error searching agents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search agents'
    });
  }
};

// @desc    Get agents by area
// @route   GET /api/agents/area/:area
// @access  Public
const getAgentsByArea = async (req, res) => {
  try {
    const { area } = req.params;
    
    const agents = await User.find({
      role: 'agent',
      isActive: true,
      isDeleted: false,
      'agentProfile.serviceAreas.city': { $regex: area, $options: 'i' }
    })
    .select('name email phone avatar agentProfile createdAt')
    .lean();

    res.json({
      success: true,
      data: agents,
      message: `Agents in ${area} retrieved successfully`
    });
  } catch (error) {
    console.error('Error fetching agents by area:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agents by area'
    });
  }
};

// @desc    Get general statistics
// @route   GET /api/agents/stats
// @access  Public
const getGeneralStats = async (req, res) => {
  try {
    const totalAgents = await User.countDocuments({
      role: 'agent',
      isActive: true,
      isDeleted: false
    });

    const totalProperties = await Property.countDocuments({
      status: { $in: ['active', 'pending'] }
    });

    const totalInspections = await Inspection.countDocuments({
      isDeleted: false
    });

    const stats = {
      totalAgents,
      totalProperties,
      totalInspections,
      averageExperience: 5.2, // Mock data
      successRate: 92.5 // Mock data
    };

    res.json({
      success: true,
      data: stats,
      message: 'General statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching general stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch general statistics'
    });
  }
};

// @desc    Create new agent
// @route   POST /api/agents
// @access  Private (Admin only)
const createAgent = async (req, res) => {
  try {
    const { name, email, password, phone, experience, location, description,bankAccountNumber } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json(
        errorResponse('Name, email, and password are required', 400)
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json(
        errorResponse('Please provide a valid email address', 400)
      );
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json(
        errorResponse('Password must be at least 8 characters long', 400)
      );
    }

    // Check if user with this email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json(
        errorResponse('User with this email already exists', 400)
      );
    }

    // Create new agent (password will be hashed by pre-save middleware)
    const newAgent = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: password, // Remove manual hashing - let pre-save middleware handle it
      phone: phone ? phone.trim() : null, // Store phone at top level for consistency
      role: 'agent',
      isActive: true,
      experience: experience ? experience.trim() : null,
      location: location ? location.trim() : null,
      bankAccountNumber: bankAccountNumber ? bankAccountNumber.trim() : null,

      agentProfile: {
        phone: phone ? phone.trim() : '+1234567890', // Also store in agentProfile for agent-specific functionality
        brokerage: 'OnlyIf Real Estate', // Default brokerage
        yearsOfExperience: 0, // Default value
        specializations: [],
        serviceAreas: [],
        commissionStructure: {
          defaultRate: 3,
          negotiable: true
        },
        bio: description ? description.trim() : '',
        certifications: [],
        languages: ['English']
      }
    });

    // If a profile image was uploaded, set both avatar and profileImage fields.
    // With Cloudinary storage, `req.file.path` contains the hosted image URL.
    if (req.file && req.file.path) {
      const imageUrl = req.file.path;
      newAgent.avatar = imageUrl;
      newAgent.profileImage = imageUrl;
    }

    await newAgent.save();

    // Return agent data without password
    const agentData = {
      id: newAgent._id,
      name: newAgent.name,
      email: newAgent.email,
      phone: newAgent.phone, // Include phone in response
      role: newAgent.role,
      isActive: newAgent.isActive,
      experience: newAgent.experience,
      location: newAgent.location,
      profileImage: newAgent.profileImage || newAgent.avatar || '',
      createdAt: newAgent.createdAt
    };

    res.status(201).json(
      successResponse(
        agentData,
        'Agent created successfully'
      )
    );
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json(
      errorResponse('Server error while creating agent', 500)
    );
  }
};

module.exports = {
  getAllAgents,
  getTopAgents,
  getAgentById,
  searchAgents,
  getAgentsByArea,
  getGeneralStats,
  createAgent
};