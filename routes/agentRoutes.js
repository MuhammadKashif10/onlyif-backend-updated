const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  getAgentStats,
  getAgentProfile,
  getAgentProperties,
  getAgentActivities
} = require('../controllers/agentController');

// All routes require authentication
router.use(authMiddleware);

// Agent stats route
router.get('/:agentId/stats', asyncHandler(getAgentStats));

// Agent profile route
router.get('/:agentId/profile', asyncHandler(getAgentProfile));

// Agent properties route
router.get('/:agentId/properties', asyncHandler(getAgentProperties));

// Agent activities route
router.get('/:agentId/activities', asyncHandler(getAgentActivities));

module.exports = router;