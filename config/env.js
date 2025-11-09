
require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/onlyif-real',
  JWT_SECRET: process.env.JWT_SECRET || 'supersecret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  
  EMAIL_FROM: process.env.EMAIL_FROM || 'no-reply@onlyif.com',
  NODE_ENV: process.env.NODE_ENV || 'development',
   STRIPE_SECRET_KEY:`sk_test_51S8FzgCTtsUoq7aokN7gmBDpTO76nkBx2XxAIsfa3iKqaA4fx25SqddnLXPLI0Ki6n36fyp44dh1T7RX2nL0XxVV00sJwGJJdp`,
  STRIPE_PUBLISHABLE_KEY:`pk_test_51S8FzgCTtsUoq7ao4NuKCEojCaFfhRJKzfYpX5M4pTj5jXopB5g9KNuAi2DJ8Vnstf4Drx0RbcpfhNX5RyRLRNtm00m28DoDKn`,
  STRIPE_WEBHOOK_SECRET: `whsec_e558e832ba96824d78b97183d47f0e4b22dc5e0f5d7baaa498737d8ecf5b4ed1`
};
