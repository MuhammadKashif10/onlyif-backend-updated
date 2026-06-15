// models/ServiceOrder.js
// Dedicated model for Marketplace (Seller Media Studio) service bookings.
// Intentionally separate from Transaction/Purchase/Invoice so existing payment
// flows (property unlocks, commissions, invoices, inspections) are untouched.
const mongoose = require('mongoose');

const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];
const FULFILLMENT_STATUSES = ['pending', 'scheduled', 'in_progress', 'completed', 'cancelled'];

const serviceOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    serviceId: {
      type: String,
      required: true,
    },
    serviceName: {
      type: String,
      required: true,
    },
    // Stored in dollars (e.g. 999.00) for display/receipts.
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'AUD',
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'pending',
      index: true,
    },
    fulfillmentStatus: {
      type: String,
      enum: FULFILLMENT_STATUSES,
      default: 'pending',
      index: true,
    },
    stripeSessionId: {
      type: String,
      index: true,
      default: null,
    },
    stripePaymentIntentId: {
      type: String,
      default: null,
    },
    // Snapshots for receipts / admin display (kept even if the user changes later).
    customerName: {
      type: String,
      default: '',
    },
    customerEmail: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Generate a human-friendly order number: SO-YYYYMMDD-XXXXXX
serviceOrderSchema.pre('validate', function (next) {
  if (!this.orderNumber) {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate()
    ).padStart(2, '0')}`;
    const rand = Math.floor(100000 + Math.random() * 900000);
    this.orderNumber = `SO-${ymd}-${rand}`;
  }
  next();
});

serviceOrderSchema.index({ user: 1, createdAt: -1 });
serviceOrderSchema.index({ paymentStatus: 1, fulfillmentStatus: 1, createdAt: -1 });

serviceOrderSchema.statics.PAYMENT_STATUSES = PAYMENT_STATUSES;
serviceOrderSchema.statics.FULFILLMENT_STATUSES = FULFILLMENT_STATUSES;

module.exports = mongoose.model('ServiceOrder', serviceOrderSchema);
