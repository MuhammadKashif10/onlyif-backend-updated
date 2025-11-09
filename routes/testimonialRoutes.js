const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { getFeaturedTestimonials } = require('../controllers/testimonialController');

router.get('/featured', asyncHandler(getFeaturedTestimonials));

module.exports = router;