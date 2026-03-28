const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const addExperienceLocationFields = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Add experience and location fields to all existing users
    const result = await User.updateMany(
      {}, // Update all users
      {
        $set: {
          experience: null,
          location: null
        }
      }
    );

    console.log(`Migration completed. Updated ${result.modifiedCount} users.`);
    
    // Verify the migration
    const sampleUser = await User.findOne({});
    if (sampleUser) {
      console.log('Sample user after migration:', {
        id: sampleUser._id,
        name: sampleUser.name,
        experience: sampleUser.experience,
        location: sampleUser.location
      });
    }

    await mongoose.connection.close();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

// Run the migration
addExperienceLocationFields();