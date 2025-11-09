const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const checkUserData = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://KashifProperty:KashifProperty@cluster0.guwviyj.mongodb.net/';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Get first 5 users to check their data
    const users = await User.find({}).limit(5).lean();
    
    console.log('\n=== User Data Check ===');
    users.forEach((user, index) => {
      console.log(`\nUser ${index + 1}:`);
      console.log(`- Name: ${user.name}`);
      console.log(`- Email: ${user.email}`);
      console.log(`- createdAt: ${user.createdAt} (type: ${typeof user.createdAt})`);
      console.log(`- updatedAt: ${user.updatedAt} (type: ${typeof user.updatedAt})`);
      
      // Test date formatting
      if (user.createdAt) {
        try {
          const formatted = new Date(user.createdAt).toLocaleDateString();
          console.log(`- Formatted date: ${formatted}`);
        } catch (error) {
          console.log(`- Date formatting error: ${error.message}`);
        }
      } else {
        console.log(`- Date formatting: Would show "Invalid Date"`);
      }
    });

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
};

checkUserData();