const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const VALID_ROLES = ['buyer', 'seller', 'agent', 'admin'];

const migrateLegacyUserRoles = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not configured');
    }

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const legacyUsers = await User.find({
      role: { $in: VALID_ROLES },
      $or: [
        { roles: { $exists: false } },
        { roles: null },
        { roles: { $size: 0 } },
      ],
    });

    console.log(`Found ${legacyUsers.length} legacy user(s) to migrate.`);

    let migratedCount = 0;
    for (const user of legacyUsers) {
      user.roles = [user.role];
      user.acceptedRoles = {
        buyer: Boolean(user.acceptedRoles?.buyer || user.role === 'buyer'),
        seller: Boolean(user.acceptedRoles?.seller || user.role === 'seller'),
        agent: Boolean(user.acceptedRoles?.agent || user.role === 'agent'),
      };
      await user.save();
      migratedCount += 1;
    }

    console.log(`Migration complete. Updated ${migratedCount} user(s).`);
    await mongoose.connection.close();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Role migration failed:', error.message);
    process.exit(1);
  }
};

migrateLegacyUserRoles();
