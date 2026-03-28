const mongoose = require('mongoose');
const User = require('../models/User');
const connectDB = require('../config/db');
const logger = require('../utils/logger');
require('dotenv').config();

const addSeller = async () => {
  try {
    // Connect to database
    await connectDB();
    logger.info('Connected to database for adding seller');

    // New seller credentials as provided
    const newSellerData = {
      name: 'Kashif Shah',
      email: 'mkashifshah10@gmail.com',
      password: 'admin@123',
      role: 'seller',
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      termsVersion: '1.0'
    };

    // Check if seller already exists
    const existingSeller = await User.findOne({ email: newSellerData.email });
    
    if (!existingSeller) {
      const seller = await User.create(newSellerData);
      logger.info(`✅ Seller created successfully: ${seller.name} (${seller.email})`);
      console.log('\n=== SELLER ACCOUNT CREATED ===');
      console.log(`Name: ${seller.name}`);
      console.log(`Email: ${seller.email}`);
      console.log(`Role: ${seller.role}`);
      console.log(`ID: ${seller._id}`);
      console.log('\nYou can now login with these credentials!');
    } else {
      logger.info(`⚠️ Seller already exists: ${existingSeller.name} (${existingSeller.email})`);
      console.log('\n=== SELLER ALREADY EXISTS ===');
      console.log(`Name: ${existingSeller.name}`);
      console.log(`Email: ${existingSeller.email}`);
      console.log(`Role: ${existingSeller.role}`);
      console.log(`ID: ${existingSeller._id}`);
      console.log('\nYou can login with the existing credentials!');
    }
    
  } catch (error) {
    logger.error('Failed to add seller:', error);
    console.error('❌ Error adding seller:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info('Database connection closed');
    process.exit(0);
  }
};

// Run the script
if (require.main === module) {
  addSeller();
}

module.exports = addSeller;