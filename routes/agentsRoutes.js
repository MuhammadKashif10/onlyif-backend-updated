const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { allowAdmin } = require('../middleware/roleMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  getAllAgents,
  getTopAgents,
  getAgentById,
  searchAgents,
  getAgentsByArea,
  getGeneralStats,
  createAgent
} = require('../controllers/agentsController');
const { uploadProfileImage } = require('../middleware/uploadMiddleware');

// Get all agents
router.get('/', asyncHandler(getAllAgents));

// Get top performing agents
router.get('/top', asyncHandler(getTopAgents));

// Get general statistics
router.get('/stats', asyncHandler(getGeneralStats));

// Search agents
router.get('/search', asyncHandler(searchAgents));

// Get agents by area
router.get('/area/:area', asyncHandler(getAgentsByArea));

// Create new agent (Admin only)
router.post('/', authMiddleware, allowAdmin, uploadProfileImage, asyncHandler(createAgent));

// Get specific agent by ID
router.get('/:id', asyncHandler(getAgentById));

module.exports = router;