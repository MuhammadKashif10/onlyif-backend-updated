// models/Purchase.js
const mongoose = require('mongoose');
const { UNLOCK_FEE_CENTS } = require('../config/pricing');

const purchaseSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  paymentIntentId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    default: UNLOCK_FEE_CENTS // buyer property unlock fee (in cents)
  },
  currency: {
    type: String,
    default: 'aud'
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  }
}, {
  timestamps: true
});

purchaseSchema.index({ user: 1, property: 1 }, { unique: true });

module.exports = mongoose.model('Purchase', purchaseSchema);
