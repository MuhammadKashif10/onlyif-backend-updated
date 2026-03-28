const Inspection = require('../models/Inspection');
const Property = require('../models/Property');
const User = require('../models/User');
const { successResponse, errorResponse, paginationMeta } = require('../utils/responseFormatter');

// @desc    Create inspection
// @route   POST /api/inspections
// @access  Private
const createInspection = async (req, res) => {
  try {
    const inspectionData = {
      ...req.body,
      createdBy: req.user.id
    };

    const inspection = await Inspection.create(inspectionData);
    
    await inspection.populate([
      { path: 'property', select: 'title address' },
      { path: 'createdBy', select: 'name email' },
      { path: 'assignedTo', select: 'name email' }
    ]);

    res.status(201).json(
      successResponse(inspection, 'Inspection created successfully')
    );
  } catch (error) {
    res.status(500).json(
      errorResponse('Server error creating inspection', 500)
    );
  }
};

// Add missing functions for route compatibility
const scheduleInspection = async (req, res) => {
  try {
    const { propertyId, datetime, inspector, notes } = req.body;
    
    // Validate required fields
    if (!propertyId || !datetime || !inspector.name) {
      return res.status(400).json(
        errorResponse('Property ID, datetime, and inspector name are required', 400)
      );
    }

    // Get property details to extract seller info
    const property = await Property.findById(propertyId).populate('owner');
    if (!property) {
      return res.status(404).json(
        errorResponse('Property not found', 404)
      );
    }

    const inspectionData = {
      property: propertyId,
      agent: req.user.id,
      buyer: req.user.id, // For now, using current user as buyer
      seller: property.owner._id,
      datetime: new Date(datetime),
      inspector: {
        name: inspector.name,
        phone: inspector.phone || '',
        email: inspector.email || '',
        company: inspector.company || ''
      },
      publicNotes: notes || '',
      status: 'scheduled',
      inspectionType: 'pre_purchase'
    };

    const inspection = await Inspection.create(inspectionData);
    
    await inspection.populate([
      { path: 'property', select: 'title address' },
      { path: 'agent', select: 'name email' },
      { path: 'buyer', select: 'name email' },
      { path: 'seller', select: 'name email' }
    ]);

    res.status(201).json(
      successResponse(inspection, 'Inspection scheduled successfully')
    );
  } catch (error) {
    console.error('Error scheduling inspection:', error);
    res.status(500).json(
      errorResponse('Server error scheduling inspection', 500)
    );
  }
};

// @desc    Get inspections
// @route   GET /api/inspections
// @access  Private
const getInspections = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    
    // Filter based on user role
    if (req.user.role === 'seller') {
      // Get inspections for seller's properties
      const sellerProperties = await Property.find({ owner: req.user.id }).select('_id');
      const propertyIds = sellerProperties.map(p => p._id);
      query.property = { $in: propertyIds };
    } else if (req.user.role === 'agent') {
      query.assignedTo = req.user.id;
    } else if (req.user.role === 'buyer') {
      query.createdBy = req.user.id;
    }

    const inspections = await Inspection.find(query)
      .populate('property', 'title address')
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Inspection.countDocuments(query);

    res.json(
      successResponse(
        inspections,
        'Inspections retrieved successfully',
        200,
        paginationMeta(page, limit, total)
      )
    );
  } catch (error) {
    res.status(500).json(
      errorResponse('Server error retrieving inspections', 500)
    );
  }
};

const getInspection = async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id)
      .populate('property', 'title address')
      .populate('agent', 'name email')
      .populate('buyer', 'name email')
      .populate('seller', 'name email');

    if (!inspection) {
      return res.status(404).json(
        errorResponse('Inspection not found', 404)
      );
    }

    res.json(
      successResponse(inspection, 'Inspection retrieved successfully')
    );
  } catch (error) {
    res.status(500).json(
      errorResponse('Server error retrieving inspection', 500)
    );
  }
};

const updateInspection = async (req, res) => {
  try {
    const inspection = await Inspection.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate([
      { path: 'property', select: 'title address' },
      { path: 'agent', select: 'name email' },
      { path: 'buyer', select: 'name email' },
      { path: 'seller', select: 'name email' }
    ]);

    if (!inspection) {
      return res.status(404).json(
        errorResponse('Inspection not found', 404)
      );
    }

    res.json(
      successResponse(inspection, 'Inspection updated successfully')
    );
  } catch (error) {
    res.status(500).json(
      errorResponse('Server error updating inspection', 500)
    );
  }
};

const getUserInspections = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = { isDeleted: false };
    
    // Filter based on user role
    if (req.user.role === 'agent') {
      query.agent = req.user.id;
    } else if (req.user.role === 'buyer') {
      query.buyer = req.user.id;
    } else if (req.user.role === 'seller') {
      query.seller = req.user.id;
    }

    const inspections = await Inspection.find(query)
      .populate('property', 'title address')
      .populate('agent', 'name email')
      .populate('buyer', 'name email')
      .populate('seller', 'name email')
      .sort({ datetime: 1 })
      .skip(skip)
      .limit(limit);

    const total = await Inspection.countDocuments(query);

    res.json(
      successResponse(
        inspections,
        'Inspections retrieved successfully',
        200,
        paginationMeta(page, limit, total)
      )
    );
  } catch (error) {
    res.status(500).json(
      errorResponse('Server error retrieving inspections', 500)
    );
  }
};

module.exports = {
  createInspection,
  scheduleInspection,
  getInspection,
  updateInspection,
  getUserInspections,
  getInspections
};