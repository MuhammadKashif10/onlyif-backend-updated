const mongoose = require('mongoose');
const User = require('../models/User');
const connectDB = require('../config/db');
const logger = require('../utils/logger');
require('dotenv').config();

const ADMIN_EMAIL = 'mkashifbukhari10@gmail.com';
const ADMIN_PASSWORD = 'Kashif@123';

const addAdmin = async () => {
  try {
    // Connect to database
    await connectDB();
    logger.info('Connected to database for adding admin');

    const adminData = {
      name: 'OnlyIf Admin',
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
      isSeeded: true,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      termsVersion: '1.0',
      status: 'active',
      isActive: true,
      isSuspended: false
    };

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminData.email });

    if (!existingAdmin) {
      const admin = await User.create(adminData);
      logger.info(`✅ Admin created successfully: ${admin.email}`);
      console.log('\n=== ADMIN ACCOUNT CREATED ===');
      console.log(`Email: ${admin.email}`);
      console.log(`Role: ${admin.role}`);
      console.log('\nYou can now login with these credentials on /admin/login\n');
    } else {
      existingAdmin.role = 'admin';
      existingAdmin.isSeeded = true;
      existingAdmin.status = 'active';
      existingAdmin.isActive = true;
      existingAdmin.isSuspended = false;
      await existingAdmin.save();

      logger.info(`⚠️ Admin already exists, flags updated: ${existingAdmin.email}`);
      console.log('\n=== ADMIN ACCOUNT ALREADY EXISTS ===');
      console.log(`Email: ${existingAdmin.email}`);
      console.log(`Role: ${existingAdmin.role}`);
      console.log('\nYou can login with the existing credentials on /admin/login\n');
    }
  } catch (error) {
    logger.error('Failed to add admin', { error: error.message });
    console.error('❌ Error adding admin:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info('Database connection closed');
    process.exit(0);
  }
};

if (require.main === module) {
  addAdmin();
}

module.exports = addAdmin;

