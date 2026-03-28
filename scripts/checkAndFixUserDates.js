const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const checkAndFixUserDates = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://KashifProperty:KashifProperty@cluster0.guwviyj.mongodb.net/';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Find all users and check their createdAt values
    const allUsers = await User.find({});
    console.log(`Total users found: ${allUsers.length}`);

    let usersWithInvalidDates = 0;
    let usersFixed = 0;

    for (const user of allUsers) {
      let needsUpdate = false;
      const updateData = {};

      // Check if createdAt is null, undefined, or invalid
      if (!user.createdAt || isNaN(new Date(user.createdAt).getTime())) {
        console.log(`User ${user.name} (${user.email}) has invalid createdAt:`, user.createdAt);
        usersWithInvalidDates++;
        needsUpdate = true;
        
        // Set a reasonable creation date (30-90 days ago)
        const daysAgo = Math.floor(Math.random() * 60) + 30;
        const currentDate = new Date();
        updateData.createdAt = new Date(currentDate.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
      }

      // Check if updatedAt is null, undefined, or invalid
      if (!user.updatedAt || isNaN(new Date(user.updatedAt).getTime())) {
        needsUpdate = true;
        updateData.updatedAt = updateData.createdAt || user.createdAt || new Date();
      }

      // Update the user if needed
      if (needsUpdate) {
        await User.findByIdAndUpdate(user._id, {
          $set: updateData
        });
        
        console.log(`Fixed user ${user.name}:`, {
          createdAt: updateData.createdAt ? updateData.createdAt.toISOString() : 'not changed',
          updatedAt: updateData.updatedAt ? updateData.updatedAt.toISOString() : 'not changed'
        });
        usersFixed++;
      }
    }

    console.log(`\nSummary:`);
    console.log(`- Total users: ${allUsers.length}`);
    console.log(`- Users with invalid dates: ${usersWithInvalidDates}`);
    console.log(`- Users fixed: ${usersFixed}`);

    // Verify all users now have valid dates
    const usersStillInvalid = await User.find({
      $or: [
        { createdAt: { $exists: false } },
        { createdAt: null },
        { updatedAt: { $exists: false } },
        { updatedAt: null }
      ]
    });

    console.log(`\nUsers still with invalid dates: ${usersStillInvalid.length}`);

    // Test date formatting for a few users
    const sampleUsers = await User.find({}).limit(3);
    console.log('\nSample users with formatted dates:');
    sampleUsers.forEach(user => {
      const formattedDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Invalid Date';
      console.log(`- ${user.name}: ${formattedDate} (raw: ${user.createdAt})`);
    });

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
};

// Run the script
checkAndFixUserDates();