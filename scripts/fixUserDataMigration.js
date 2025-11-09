const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const fixUserDataMigration = async () => {
  try {
    // Connect to MongoDB - use MONGO_URI instead of MONGODB_URI
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://KashifProperty:KashifProperty@cluster0.guwviyj.mongodb.net/';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Find users with missing data (phone numbers or timestamps)
    const usersNeedingUpdate = await User.find({
      $or: [
        { phone: { $exists: false } },
        { phone: null },
        { phone: '' },
        { createdAt: { $exists: false } },
        { updatedAt: { $exists: false } }
      ]
    });

    console.log(`Found ${usersNeedingUpdate.length} users needing updates`);

    // Sample phone numbers for demonstration
    const samplePhones = [
      '+1234567890',
      '+1234567891', 
      '+1234567892',
      '+1234567893',
      '+1234567894',
      '+1234567895',
      '+1234567896',
      '+1234567897',
      '+1234567898',
      '+1234567899'
    ];

    let updateCount = 0;
    const currentDate = new Date();

    for (let i = 0; i < usersNeedingUpdate.length; i++) {
      const user = usersNeedingUpdate[i];
      const phoneIndex = i % samplePhones.length;
      const phoneNumber = samplePhones[phoneIndex];

      // Prepare update object
      const updateData = {};

      // Add phone if missing
      if (!user.phone || user.phone === '') {
        updateData.phone = phoneNumber;
      }

      // Add timestamps if missing
      if (!user.createdAt) {
        // Set a reasonable creation date (e.g., 30-90 days ago for existing users)
        const daysAgo = Math.floor(Math.random() * 60) + 30; // Random between 30-90 days ago
        updateData.createdAt = new Date(currentDate.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
      }

      if (!user.updatedAt) {
        updateData.updatedAt = user.createdAt || updateData.createdAt || currentDate;
      }

      // Update the user
      await User.findByIdAndUpdate(user._id, {
        $set: updateData
      });

      console.log(`Updated user ${user.name} (${user.email}):`, {
        phone: updateData.phone || 'already exists',
        createdAt: updateData.createdAt ? updateData.createdAt.toISOString() : 'already exists',
        updatedAt: updateData.updatedAt ? updateData.updatedAt.toISOString() : 'already exists'
      });
      updateCount++;
    }

    console.log(`Migration completed. Updated ${updateCount} users.`);
    
    // Verify the migration
    const sampleUser = await User.findOne({ 
      phone: { $exists: true, $ne: null },
      createdAt: { $exists: true }
    });
    
    if (sampleUser) {
      console.log('Sample user after migration:', {
        id: sampleUser._id,
        name: sampleUser.name,
        email: sampleUser.email,
        phone: sampleUser.phone,
        role: sampleUser.role,
        createdAt: sampleUser.createdAt,
        updatedAt: sampleUser.updatedAt
      });
    }

    // Check for any remaining users without timestamps
    const usersWithoutTimestamps = await User.countDocuments({
      $or: [
        { createdAt: { $exists: false } },
        { updatedAt: { $exists: false } }
      ]
    });

    console.log(`Users still without timestamps: ${usersWithoutTimestamps}`);

    await mongoose.connection.close();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

// Run the migration
fixUserDataMigration();