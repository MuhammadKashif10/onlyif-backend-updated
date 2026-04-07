const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const { requestAgentRole } = require('../controllers/userController');

router.put('/request-agent', authMiddleware, asyncHandler(requestAgentRole));

module.exports = router;
