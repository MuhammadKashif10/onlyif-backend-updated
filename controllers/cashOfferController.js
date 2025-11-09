const CashOffer = require('../models/CashOffer');
const { successResponse, errorResponse } = require('../utils/responseFormatter');
const logger = require('../utils/logger');

// @desc    Submit cash offer request
// @route   POST /api/cash-offers
// @access  Public
const submitCashOffer = async (req, res) => {
  try {
    const { address, zipCode, name, email, phone } = req.body;

    // Validate required fields
    if (!address || !zipCode || !name || !email) {
      return res.status(400).json(
        errorResponse('Address, ZIP code, name, and email are required', 400)
      );
    }

    // Generate estimated value based on ZIP code (mock calculation)
    const estimatedValue = generateEstimatedValue(zipCode);
    const offerAmount = Math.floor(estimatedValue * 0.95); // 95% of estimated value

    // Create cash offer
    const cashOffer = await CashOffer.create({
      address,
      zipCode,
      contactName: name,
      contactEmail: email,
      contactPhone: phone,
      estimatedValue,
      offerAmount,
      status: 'submitted'
    });

    logger.info(`Cash offer submitted: ${cashOffer.offerId} for ${address}`);

    res.status(201).json(
      successResponse({
        offerId: cashOffer.offerId,
        estimatedValue: cashOffer.estimatedValue,
        offerAmount: cashOffer.offerAmount,
        propertyType: cashOffer.propertyType,
        bedrooms: cashOffer.bedrooms,
        bathrooms: cashOffer.bathrooms,
        squareFootage: cashOffer.squareFootage,
        estimatedClosingDate: cashOffer.estimatedClosingDate,
        message: 'Cash offer request submitted successfully',
        nextSteps: [
          'We will review your property details',
          'Our team will conduct a market analysis',
          'You will receive a competitive cash offer within 24 hours'
        ]
      }, 'Cash offer submitted successfully')
    );
  } catch (error) {
    logger.error('Error submitting cash offer:', error);
    res.status(500).json(
      errorResponse('Failed to submit cash offer', 500)
    );
  }
};

// @desc    Get cash offer by ID
// @route   GET /api/cash-offers/:offerId
// @access  Public
const getCashOfferById = async (req, res) => {
  try {
    const { offerId } = req.params;

    const cashOffer = await CashOffer.findOne({ offerId });

    if (!cashOffer) {
      return res.status(404).json(
        errorResponse('Cash offer not found', 404)
      );
    }

    res.json(
      successResponse(cashOffer, 'Cash offer retrieved successfully')
    );
  } catch (error) {
    logger.error('Error retrieving cash offer:', error);
    res.status(500).json(
      errorResponse('Failed to retrieve cash offer', 500)
    );
  }
};

// @desc    Schedule inspection
// @route   PUT /api/cash-offers/:offerId/schedule-inspection
// @access  Public
const scheduleInspection = async (req, res) => {
  try {
    const { offerId } = req.params;
    const { inspectionDate, timeSlot } = req.body;

    if (!inspectionDate || !timeSlot) {
      return res.status(400).json(
        errorResponse('Inspection date and time slot are required', 400)
      );
    }

    const cashOffer = await CashOffer.findOneAndUpdate(
      { offerId },
      {
        inspectionDate: new Date(inspectionDate),
        inspectionTimeSlot: timeSlot,
        inspectionStatus: 'scheduled',
        status: 'inspection_scheduled'
      },
      { new: true }
    );

    if (!cashOffer) {
      return res.status(404).json(
        errorResponse('Cash offer not found', 404)
      );
    }

    logger.info(`Inspection scheduled for offer ${offerId} on ${inspectionDate} at ${timeSlot}`);

    res.json(
      successResponse({
        offerId: cashOffer.offerId,
        inspectionDate: cashOffer.inspectionDate,
        inspectionTimeSlot: cashOffer.inspectionTimeSlot,
        status: cashOffer.status,
        message: 'Inspection scheduled successfully'
      }, 'Inspection scheduled successfully')
    );
  } catch (error) {
    logger.error('Error scheduling inspection:', error);
    res.status(500).json(
      errorResponse('Failed to schedule inspection', 500)
    );
  }
};

// @desc    Accept cash offer
// @route   PUT /api/cash-offers/:offerId/accept
// @access  Public
const acceptCashOffer = async (req, res) => {
  try {
    const { offerId } = req.params;

    const cashOffer = await CashOffer.findOneAndUpdate(
      { offerId },
      {
        status: 'accepted',
        acceptedAt: new Date(),
        // Initialize closing checklist
        closingChecklist: [
          {
            itemId: 'documents',
            text: 'Review and sign closing documents',
            description: 'Purchase agreement, title transfer, and other legal documents',
            required: true,
            completed: false
          },
          {
            itemId: 'payment',
            text: 'Choose payment method',
            description: 'Direct deposit, wire transfer, or check',
            required: true,
            completed: false
          },
          {
            itemId: 'utilities',
            text: 'Transfer utility accounts',
            description: 'Cancel or transfer water, electricity, gas, and internet',
            required: false,
            completed: false
          },
          {
            itemId: 'mail',
            text: 'Set up mail forwarding',
            description: 'Forward mail to your new address',
            required: false,
            completed: false
          },
          {
            itemId: 'moving',
            text: 'Schedule moving assistance',
            description: 'Professional movers or DIY moving options',
            required: false,
            completed: false
          },
          {
            itemId: 'insurance',
            text: 'Update insurance policies',
            description: 'Cancel homeowners insurance and update auto policies',
            required: true,
            completed: false
          },
          {
            itemId: 'keys',
            text: 'Prepare keys and access',
            description: 'Gather all keys, garage remotes, and access codes',
            required: true,
            completed: false
          },
          {
            itemId: 'personal',
            text: 'Remove personal belongings',
            description: 'Ensure all personal items are removed from the property',
            required: true,
            completed: false
          }
        ]
      },
      { new: true }
    );

    if (!cashOffer) {
      return res.status(404).json(
        errorResponse('Cash offer not found', 404)
      );
    }

    logger.info(`Cash offer accepted: ${offerId}`);

    res.json(
      successResponse({
        offerId: cashOffer.offerId,
        status: cashOffer.status,
        acceptedAt: cashOffer.acceptedAt,
        offerAmount: cashOffer.offerAmount,
        fees: cashOffer.fees,
        netProceeds: cashOffer.netProceeds,
        closingChecklist: cashOffer.closingChecklist,
        message: 'Cash offer accepted successfully'
      }, 'Cash offer accepted successfully')
    );
  } catch (error) {
    logger.error('Error accepting cash offer:', error);
    res.status(500).json(
      errorResponse('Failed to accept cash offer', 500)
    );
  }
};

// @desc    Update closing checklist
// @route   PUT /api/cash-offers/:offerId/checklist
// @access  Public
const updateClosingChecklist = async (req, res) => {
  try {
    const { offerId } = req.params;
    const { itemId, completed } = req.body;

    if (!itemId || typeof completed !== 'boolean') {
      return res.status(400).json(
        errorResponse('Item ID and completed status are required', 400)
      );
    }

    const cashOffer = await CashOffer.findOne({ offerId });

    if (!cashOffer) {
      return res.status(404).json(
        errorResponse('Cash offer not found', 404)
      );
    }

    // Update the specific checklist item
    const checklistItem = cashOffer.closingChecklist.find(item => item.itemId === itemId);
    if (!checklistItem) {
      return res.status(404).json(
        errorResponse('Checklist item not found', 404)
      );
    }

    checklistItem.completed = completed;
    checklistItem.completedAt = completed ? new Date() : null;

    await cashOffer.save();

    logger.info(`Checklist item ${itemId} ${completed ? 'completed' : 'uncompleted'} for offer ${offerId}`);

    res.json(
      successResponse({
        offerId: cashOffer.offerId,
        closingChecklist: cashOffer.closingChecklist,
        message: `Checklist item ${completed ? 'completed' : 'uncompleted'} successfully`
      }, 'Checklist updated successfully')
    );
  } catch (error) {
    logger.error('Error updating checklist:', error);
    res.status(500).json(
      errorResponse('Failed to update checklist', 500)
    );
  }
};

// @desc    Complete closing process
// @route   PUT /api/cash-offers/:offerId/close
// @access  Public
const completeCashOffer = async (req, res) => {
  try {
    const { offerId } = req.params;

    const cashOffer = await CashOffer.findOneAndUpdate(
      { offerId },
      {
        status: 'closed',
        closedAt: new Date()
      },
      { new: true }
    );

    if (!cashOffer) {
      return res.status(404).json(
        errorResponse('Cash offer not found', 404)
      );
    }

    logger.info(`Cash offer completed: ${offerId}`);

    res.json(
      successResponse({
        offerId: cashOffer.offerId,
        status: cashOffer.status,
        closedAt: cashOffer.closedAt,
        message: 'Congratulations! Your property sale has been completed successfully.'
      }, 'Cash offer completed successfully')
    );
  } catch (error) {
    logger.error('Error completing cash offer:', error);
    res.status(500).json(
      errorResponse('Failed to complete cash offer', 500)
    );
  }
};

// @desc    Get cash offers by email
// @route   GET /api/cash-offers/email/:email
// @access  Public
const getCashOffersByEmail = async (req, res) => {
  try {
    const { email } = req.params;

    const cashOffers = await CashOffer.find({ contactEmail: email.toLowerCase() })
      .sort({ createdAt: -1 });

    res.json(
      successResponse(cashOffers, 'Cash offers retrieved successfully')
    );
  } catch (error) {
    logger.error('Error retrieving cash offers by email:', error);
    res.status(500).json(
      errorResponse('Failed to retrieve cash offers', 500)
    );
  }
};

// Helper function to generate estimated value based on ZIP code
const generateEstimatedValue = (zipCode) => {
  // Mock calculation based on ZIP code
  const baseValue = 300000;
  const zipMultiplier = parseInt(zipCode.slice(-2)) / 100;
  const randomFactor = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2
  
  return Math.floor(baseValue * (1 + zipMultiplier) * randomFactor);
};

module.exports = {
  submitCashOffer,
  getCashOfferById,
  scheduleInspection,
  acceptCashOffer,
  updateClosingChecklist,
  completeCashOffer,
  getCashOffersByEmail
};