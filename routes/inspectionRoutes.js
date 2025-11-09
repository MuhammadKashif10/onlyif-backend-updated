const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  scheduleInspection,
  getInspection,
  updateInspection,
  getUserInspections
} = require('../controllers/inspectionController');

router.get('/', authMiddleware, asyncHandler(getUserInspections));
router.post('/', authMiddleware, asyncHandler(scheduleInspection));
router.get('/:id', authMiddleware, asyncHandler(getInspection));
router.patch('/:id', authMiddleware, asyncHandler(updateInspection));

module.exports = router;