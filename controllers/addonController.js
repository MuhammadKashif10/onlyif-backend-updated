const Addon = require('../models/Addon');
const Property = require('../models/Property');
const Transaction = require('../models/Transaction');
const stripeService = require('../services/stripeService');
const { successResponse, errorResponse } = require('../utils/responseFormatter');

// @desc    Get available add-ons
// @route   GET /api/addons
// @access  Public
const getAddons = async (req, res) => {
  const addons = [
    {
      type: 'photo',
      title: 'Professional Photography',
      price: 299,
      features: ['High-resolution photos', 'Professional editing', '24-hour delivery'],
      image: '/images/photo-addon.jpg'
    },
    {
      type: 'floorplan',
      title: 'Floor Plan Creation',
      price: 199,
      features: ['Detailed floor plans', 'Measurements included', '48-hour delivery'],
      image: '/images/floorplan-addon.jpg'
    },
    {
      type: 'drone',
      title: 'Drone Photography',
      price: 399,
      features: ['Aerial photography', '4K video footage', 'Weather permitting'],
      image: '/images/drone-addon.jpg'
    },
    {
      type: 'walkthrough',
      title: 'Virtual Walkthrough',
      price: 499,
      features: ['360° virtual tour', 'Interactive hotspots', 'Mobile compatible'],
      image: '/images/walkthrough-addon.jpg'
    }
  ];

  res.json(
    successResponse(addons, 'Add-ons retrieved successfully')
  );
};

// @desc    Purchase add-ons
// @route   POST /api/addons/purchase
// @access  Private
const purchaseAddons = async (req, res) => {
  const { propertyId, items } = req.body;

  // Validate property exists and user has access
  const property = await Property.findById(propertyId);
  if (!property) {
    return res.status(404).json(
      errorResponse('Property not found', 404)
    );
  }

  // Check if user can purchase for this property
  const canPurchase = (
    req.user.id === property.owner.toString() ||
    (property.assignedAgent && req.user.id === property.assignedAgent.toString())
  );

  if (!canPurchase) {
    return res.status(403).json(
      errorResponse('Not authorized to purchase add-ons for this property', 403)
    );
  }

  // Calculate total amount
  const addonPrices = {
    photo: 299,
    floorplan: 199,
    drone: 399,
    walkthrough: 499
  };

  let totalAmount = 0;
  const validatedItems = [];

  for (const item of items) {
    if (!addonPrices[item.addonType]) {
      return res.status(400).json(
        errorResponse(`Invalid addon type: ${item.addonType}`, 400)
      );
    }

    const unitPrice = addonPrices[item.addonType];
    const qty = item.qty || 1;
    totalAmount += unitPrice * qty;

    validatedItems.push({
      addonType: item.addonType,
      unitPrice,
      qty
    });
  }

  try {
    // Create Stripe PaymentIntent
    const paymentIntent = await stripeService.createPaymentIntent(
      totalAmount,
      'aud', // Changed from 'usd' to 'aud'
      {
        userId: req.user.id,
        addonIds: addonIds.join(','),
        type: 'addon_purchase'
      }
    );

    // Create transaction record
    const transaction = await Transaction.create({
      user: req.user.id,
      property: propertyId,
      items: validatedItems,
      amount: totalAmount,
      stripePaymentIntentId: paymentIntent.id,
      status: paymentIntent.status
    });

    // If payment succeeded (mock or real), attach add-ons to property
    if (paymentIntent.status === 'succeeded') {
      for (const item of validatedItems) {
        await Addon.create({
          type: item.addonType,
          title: getAddonTitle(item.addonType),
          price: item.unitPrice,
          property: propertyId,
          purchasedBy: req.user.id,
          status: 'active'
        });
      }
    }

    res.json(
      successResponse({
        success: true,
        data: {
          transactionId: transaction._id,
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: totalAmount,
          status: paymentIntent.status
        }
      }, 'Add-ons purchase initiated successfully')
    );
  } catch (error) {
    console.error('Purchase error:', error);
    res.status(500).json(
      errorResponse('Payment processing failed', 500)
    );
  }
};

function getAddonTitle(type) {
  const titles = {
    photo: 'Professional Photography',
    floorplan: 'Floor Plan Creation',
    drone: 'Drone Photography',
    walkthrough: 'Virtual Walkthrough'
  };
  return titles[type] || type;
}

module.exports = {
  getAddons,
  purchaseAddons
};