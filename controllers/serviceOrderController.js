// controllers/serviceOrderController.js
// Marketplace (Seller Media Studio) service ordering.
// New, isolated flow — reuses the Stripe Checkout pattern but does NOT touch the
// property-unlock / commission / invoice / inspection flows.
const Stripe = require('stripe');
const ServiceOrder = require('../models/ServiceOrder');
const { SERVICES, getServiceById } = require('../config/serviceCatalog');
const { generateServiceReceiptPDF } = require('../utils/serviceReceiptPdf');
const { confirmAndFulfill } = require('../services/serviceOrderService');
const { successResponse, errorResponse } = require('../utils/responseFormatter');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// @desc    Public list of bookable services (display only; prices authoritative server-side)
// @route   GET /api/service-orders/catalog
// @access  Public
const getCatalog = async (req, res) => {
  const catalog = SERVICES.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    amount: s.amountCents / 100,
    currency: s.currency.toUpperCase(),
  }));
  return res.json(successResponse(catalog, 'Service catalog retrieved'));
};

// @desc    Create a Stripe Checkout Session for a service and a pending ServiceOrder
// @route   POST /api/service-orders/checkout
// @access  Private (any authenticated user)
const createServiceCheckout = async (req, res) => {
  try {
    const { serviceId } = req.body;
    const service = getServiceById(serviceId);
    if (!service) {
      return res.status(400).json(errorResponse('Invalid or unknown service selected', 400));
    }

    const front = process.env.FRONTEND_URL || process.env.BACKEND_URL || '';

    // Create the pending order first so we always have a record, even if the
    // user abandons checkout.
    const order = await ServiceOrder.create({
      user: req.user._id,
      serviceId: service.id,
      serviceName: service.name,
      amount: service.amountCents / 100,
      currency: service.currency.toUpperCase(),
      customerName: req.user.name || '',
      customerEmail: req.user.email || '',
      paymentStatus: 'pending',
      fulfillmentStatus: 'pending',
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: req.user.email || undefined,
      line_items: [
        {
          price_data: {
            currency: service.currency,
            unit_amount: service.amountCents, // server-side price — never trust client
            product_data: {
              name: `Only If — ${service.name}`,
              description: service.description,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${front}/dashboards/seller/marketplace/orders?service_payment=success&order=${order.orderNumber}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${front}/dashboards/seller/marketplace?service_payment=cancelled`,
      metadata: {
        type: 'service_purchase',
        serviceId: service.id,
        serviceName: service.name,
        userId: req.user._id.toString(),
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
      },
    });

    order.stripeSessionId = session.id;
    await order.save();

    return res.json({ success: true, url: session.url, orderNumber: order.orderNumber });
  } catch (err) {
    console.error('Service checkout error:', err);
    return res.status(500).json(errorResponse('Error creating service checkout session', 500));
  }
};

// @desc    Confirm a service checkout by Stripe session (webhook fallback).
//          Safe to call even if the webhook already processed the order (idempotent).
// @route   POST /api/service-orders/confirm
// @access  Private (owner)
const confirmServiceCheckout = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json(errorResponse('sessionId is required', 400));
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      return res.status(404).json(errorResponse('Checkout session not found', 404));
    }

    if (session.metadata?.type !== 'service_purchase') {
      return res.status(400).json(errorResponse('Not a service purchase session', 400));
    }

    // Only treat as paid when Stripe says so.
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.json({ success: false, message: 'Payment not completed yet' });
    }

    const lookup = [{ stripeSessionId: session.id }];
    if (session.metadata.orderId) lookup.push({ _id: session.metadata.orderId });
    const order = await ServiceOrder.findOne({ $or: lookup });
    if (!order) {
      return res.status(404).json(errorResponse('Order not found', 404));
    }

    // Authorize: a user can only confirm their own order.
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json(errorResponse('Access denied', 403));
    }

    await confirmAndFulfill(order, session, req.app);
    return res.json(successResponse(order, 'Payment confirmed'));
  } catch (err) {
    console.error('confirmServiceCheckout error:', err);
    return res.status(500).json(errorResponse('Failed to confirm payment', 500));
  }
};

// @desc    Current user's service orders
// @route   GET /api/service-orders/my-orders
// @access  Private
const getMyOrders = async (req, res) => {
  try {
    const orders = await ServiceOrder.find({ user: req.user._id }).sort({ createdAt: -1 });
    return res.json(successResponse(orders, 'Service orders retrieved'));
  } catch (err) {
    console.error('getMyOrders error:', err);
    return res.status(500).json(errorResponse('Failed to fetch service orders', 500));
  }
};

// @desc    All service orders (admin), with optional filters
// @route   GET /api/service-orders/admin/all
// @access  Private (admin)
const getAllOrders = async (req, res) => {
  try {
    const { paymentStatus, fulfillmentStatus } = req.query;
    const query = {};
    if (paymentStatus && paymentStatus !== 'all') query.paymentStatus = paymentStatus;
    if (fulfillmentStatus && fulfillmentStatus !== 'all') query.fulfillmentStatus = fulfillmentStatus;

    const orders = await ServiceOrder.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    return res.json(successResponse(orders, 'Service orders retrieved'));
  } catch (err) {
    console.error('getAllOrders error:', err);
    return res.status(500).json(errorResponse('Failed to fetch service orders', 500));
  }
};

// @desc    Single order (owner or admin)
// @route   GET /api/service-orders/:id
// @access  Private
const getOrder = async (req, res) => {
  try {
    const order = await ServiceOrder.findById(req.params.id).populate('user', 'name email');
    if (!order) return res.status(404).json(errorResponse('Order not found', 404));

    const isOwner = order.user && order.user._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin' || (req.user.roles || []).includes('admin');
    if (!isOwner && !isAdmin) {
      return res.status(403).json(errorResponse('Access denied', 403));
    }

    return res.json(successResponse(order, 'Service order retrieved'));
  } catch (err) {
    console.error('getOrder error:', err);
    return res.status(500).json(errorResponse('Failed to fetch service order', 500));
  }
};

// @desc    Update fulfillment status (admin)
// @route   PATCH /api/service-orders/admin/:id/fulfillment
// @access  Private (admin)
const updateFulfillment = async (req, res) => {
  try {
    const { fulfillmentStatus, notes } = req.body;
    if (!ServiceOrder.FULFILLMENT_STATUSES.includes(fulfillmentStatus)) {
      return res.status(400).json(errorResponse('Invalid fulfillment status', 400));
    }

    const order = await ServiceOrder.findById(req.params.id);
    if (!order) return res.status(404).json(errorResponse('Order not found', 404));

    order.fulfillmentStatus = fulfillmentStatus;
    if (typeof notes === 'string') order.notes = notes;
    await order.save();

    return res.json(successResponse(order, 'Fulfillment status updated'));
  } catch (err) {
    console.error('updateFulfillment error:', err);
    return res.status(500).json(errorResponse('Failed to update fulfillment status', 500));
  }
};

// @desc    Delete a service order (admin only)
// @route   DELETE /api/service-orders/admin/:id
// @access  Private (admin)
const deleteOrder = async (req, res) => {
  try {
    const order = await ServiceOrder.findById(req.params.id);
    if (!order) return res.status(404).json(errorResponse('Order not found', 404));

    await ServiceOrder.deleteOne({ _id: order._id });
    console.log(`🗑️ Service order ${order.orderNumber} deleted by admin ${req.user._id}`);

    return res.json(successResponse({ id: order._id.toString() }, 'Service order deleted'));
  } catch (err) {
    console.error('deleteOrder error:', err);
    return res.status(500).json(errorResponse('Failed to delete service order', 500));
  }
};

// @desc    Download ONLYIF-branded PDF receipt (owner or admin), only when paid
// @route   GET /api/service-orders/:id/receipt.pdf
// @access  Private
const downloadReceipt = async (req, res) => {
  try {
    const order = await ServiceOrder.findById(req.params.id);
    if (!order) return res.status(404).json(errorResponse('Order not found', 404));

    const isOwner = order.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin' || (req.user.roles || []).includes('admin');
    if (!isOwner && !isAdmin) {
      return res.status(403).json(errorResponse('Access denied', 403));
    }

    if (order.paymentStatus !== 'paid') {
      return res.status(400).json(errorResponse('Receipt is only available for paid orders', 400));
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Receipt_${order.orderNumber}.pdf"`);
    generateServiceReceiptPDF(order, res);
  } catch (err) {
    console.error('downloadReceipt error:', err);
    if (!res.headersSent) {
      res.status(500).json(errorResponse('Failed to generate receipt', 500));
    }
  }
};

module.exports = {
  getCatalog,
  createServiceCheckout,
  confirmServiceCheckout,
  getMyOrders,
  getAllOrders,
  getOrder,
  updateFulfillment,
  deleteOrder,
  downloadReceipt,
};
