const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const addPhoneToExistingUsers = async () => {
  try {
    // Connect to MongoDB - use MONGO_URI instead of MONGODB_URI
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://KashifProperty:KashifProperty@cluster0.guwviyj.mongodb.net/';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Find users without phone numbers
    const usersWithoutPhone = await User.find({
      $or: [
        { phone: { $exists: false } },
        { phone: null },
        { phone: '' }
      ]
    });

    console.log(`Found ${usersWithoutPhone.length} users without phone numbers`);

    // Add sample phone numbers to existing users for demonstration
    // In a real scenario, you would need to collect this data from users
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
    for (let i = 0; i < usersWithoutPhone.length; i++) {
      const user = usersWithoutPhone[i];
      const phoneIndex = i % samplePhones.length;
      const phoneNumber = samplePhones[phoneIndex];

      await User.findByIdAndUpdate(user._id, {
        $set: { phone: phoneNumber }
      });

      console.log(`Updated user ${user.name} (${user.email}) with phone: ${phoneNumber}`);
      updateCount++;
    }

    console.log(`Migration completed. Updated ${updateCount} users with phone numbers.`);
    
    // Verify the migration
    const sampleUser = await User.findOne({ phone: { $exists: true, $ne: null } });
    if (sampleUser) {
      console.log('Sample user after migration:', {
        id: sampleUser._id,
        name: sampleUser.name,
        email: sampleUser.email,
        phone: sampleUser.phone,
        role: sampleUser.role
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
addPhoneToExistingUsers();