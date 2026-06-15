// config/pricing.js
// Central pricing configuration — single source of truth for platform fees.
// Amounts are stored in cents to match Stripe's smallest-currency-unit requirement.
// Keep in sync with the frontend (frontend/src/utils/constants.ts → PRICING).

require('dotenv').config();

// Buyer property unlock fee. Overridable via env for staging/testing.
const UNLOCK_FEE_CENTS = parseInt(process.env.UNLOCK_FEE_CENTS || '1900', 10);

module.exports = {
  UNLOCK_FEE_CENTS, // e.g. 1900
  UNLOCK_FEE_DOLLARS: UNLOCK_FEE_CENTS / 100, // e.g. 19
  UNLOCK_FEE_CURRENCY: 'aud',
};
