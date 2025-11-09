const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const { getAddons, purchaseAddons } = require('../controllers/addonController');

router.get('/', asyncHandler(getAddons));
router.post('/purchase', authMiddleware, asyncHandler(purchaseAddons));

module.exports = router;