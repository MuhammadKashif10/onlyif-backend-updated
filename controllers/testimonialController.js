const User = require('../models/User');
const { successResponse, errorResponse, paginationMeta } = require('../utils/responseFormatter');

// Mock testimonials data (replace with actual model when ready)
const mockTestimonials = [
  {
    _id: '1',
    name: 'Sarah Johnson',
    role: 'Home Buyer',
    content: 'OnlyIf made buying my first home incredibly smooth. The process was transparent and the support was exceptional.',
    rating: 5,
    date: '2024-01-15',
    verified: true
  },
  {
    _id: '2', 
    name: 'Michael Chen',
    role: 'Property Seller',
    content: 'Sold my property faster than expected. The platform connects you with serious buyers and qualified agents.',
    rating: 5,
    date: '2024-01-10',
    verified: true
  }
];

// @desc    Get all testimonials
// @route   GET /api/testimonials
// @access  Public
const getTestimonials = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // For now, using mock data
    const testimonials = mockTestimonials.slice(skip, skip + limit);
    const total = mockTestimonials.length;

    res.json(
      successResponse(
        testimonials,
        'Testimonials retrieved successfully',
        200,
        paginationMeta(page, limit, total)
      )
    );
  } catch (error) {
    res.status(500).json(
      errorResponse('Server error retrieving testimonials', 500)
    );
  }
};

// @desc    Create testimonial
// @route   POST /api/testimonials
// @access  Private
const createTestimonial = async (req, res) => {
  try {
    const testimonialData = {
      ...req.body,
      userId: req.user.id,
      verified: false, // Admin needs to verify
      date: new Date().toISOString().split('T')[0]
    };

    // In a real implementation, save to database
    // const testimonial = await Testimonial.create(testimonialData);
    
    // For now, return mock response
    const testimonial = {
      _id: Date.now().toString(),
      ...testimonialData
    };

    res.status(201).json(
      successResponse(testimonial, 'Testimonial submitted successfully')
    );
  } catch (error) {
    res.status(500).json(
      errorResponse('Server error creating testimonial', 500)
    );
  }
};

module.exports = {
  getTestimonials,
  createTestimonial
};