// backend/scripts/seed-chat-users.js
// Creates a test buyer and agent for chat testing purposes.
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

async function run() {
  try {
    await connectDB();

    // Create Buyer
    const buyerEmail = 'buyer1@example.com';
    let buyer = await User.findOne({ email: buyerEmail });
    if (!buyer) {
      buyer = await User.create({
        name: 'Buyer One',
        email: buyerEmail,
        password: 'buyer12345',
        role: 'buyer',
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        termsVersion: '1.0'
      });
      console.log('✅ Created buyer:', buyerEmail);
    } else {
      console.log('ℹ️ Buyer already exists:', buyerEmail);
    }

    // Create Agent
    const agentEmail = 'agent1@example.com';
    let agent = await User.findOne({ email: agentEmail });
    if (!agent) {
      agent = await User.create({
        name: 'Agent One',
        email: agentEmail,
        password: 'agent12345',
        role: 'agent',
        agentProfile: {
          phone: '+15551234567',
          brokerage: 'OnlyIf Realty',
          yearsOfExperience: 5,
          specializations: ['residential']
        },
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        termsVersion: '1.0'
      });
      console.log('✅ Created agent:', agentEmail);
    } else {
      console.log('ℹ️ Agent already exists:', agentEmail);
    }
  } catch (e) {
    console.error('❌ Seeding chat users failed:', e.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  run();
}
