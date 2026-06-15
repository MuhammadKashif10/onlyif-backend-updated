// routes/serviceOrderRoutes.js
// Marketplace (Seller Media Studio) service ordering routes.
// Mounted at /api/service-orders. Isolated from existing payment routes.
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { allowAdmin } = require('../middleware/roleMiddleware');
const ctrl = require('../controllers/serviceOrderController');

// Public catalog (display only; pricing is enforced server-side at checkout)
router.get('/catalog', ctrl.getCatalog);

// Create Stripe Checkout Session for a service
router.post('/checkout', authMiddleware, ctrl.createServiceCheckout);

// Confirm a checkout by Stripe session (fallback when the webhook is unreachable)
router.post('/confirm', authMiddleware, ctrl.confirmServiceCheckout);

// Current user's orders
router.get('/my-orders', authMiddleware, ctrl.getMyOrders);

// Admin management (specific routes BEFORE the generic /:id)
router.get('/admin/all', authMiddleware, allowAdmin, ctrl.getAllOrders);
router.patch('/admin/:id/fulfillment', authMiddleware, allowAdmin, ctrl.updateFulfillment);
router.delete('/admin/:id', authMiddleware, allowAdmin, ctrl.deleteOrder);

// Receipt download (owner or admin)
router.get('/:id/receipt.pdf', authMiddleware, ctrl.downloadReceipt);

// Single order (owner or admin)
router.get('/:id', authMiddleware, ctrl.getOrder);

module.exports = router;
