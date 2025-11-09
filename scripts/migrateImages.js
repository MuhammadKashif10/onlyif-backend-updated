const mongoose = require('mongoose');
const Property = require('../models/Property');
const connectDB = require('../config/db');

const migratePropertyImages = async () => {
  try {
    // Establish database connection
    await connectDB();
    
    console.log('Starting image migration...');
    
    const properties = await Property.find({
      $or: [
        { mainImage: { $exists: false } },
        { finalImageUrl: { $exists: false } }
      ]
    });

    console.log(`Found ${properties.length} properties to migrate`);

    for (const property of properties) {
      const updates = {};
      
      // Set mainImage and finalImageUrl based on existing images
      if (property.images && property.images.length > 0) {
        const firstImage = property.images[0];
        updates.mainImage = { url: firstImage.url };
        updates.finalImageUrl = { url: firstImage.url };
      } else {
        updates.mainImage = { url: null };
        updates.finalImageUrl = { url: null };
      }

      await Property.findByIdAndUpdate(property._id, updates);
      console.log(`Updated property: ${property.title}`);
    }

    console.log('Migration completed successfully!');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

migratePropertyImages();