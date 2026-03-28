// Add this at the very top of the file, before any other requires
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');
const Property = require('../models/Property');
const Addon = require('../models/Addon');
const connectDB = require('../config/db');
const logger = require('../utils/logger');

// Admin credentials as specified
const ADMIN_EMAIL = 'Kashif@info.com';
const ADMIN_PASSWORD = 'admin@1234';

const seedData = async () => {
  try {
    // Connect to database
    await connectDB();
    logger.info('Connected to database for seeding');

    // Clear existing data (optional - remove if you want to keep existing data)
    // await User.deleteMany({});
    // await Property.deleteMany({});
    // await Addon.deleteMany({});
    // logger.info('Cleared existing data');

    // 1. Create Admin Account
    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });
    let admin;
    
    if (!existingAdmin) {
      admin = await User.create({
        name: 'Kashif Admin',
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: 'admin',
        isSeeded: true, // Add this flag for admin authentication
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        termsVersion: '1.0'
      });
      logger.info(`Admin account created: ${admin.email}`);
    } else {
      // Update existing admin to have isSeeded flag
      admin = await User.findByIdAndUpdate(
        existingAdmin._id,
        { 
          isSeeded: true,
          role: 'admin' // Ensure role is admin
        },
        { new: true }
      );
      logger.info(`Admin account updated with isSeeded flag: ${admin.email}`);
    }

    // 2. Create Agent Accounts - REMOVED MOCK AGENTS
    // Mock agents (Sarah Johnson and Michael Chen) have been permanently removed
    // Only real agents added by users will remain in the database
    const agents = [];

    const createdAgents = [];
    for (const agentData of agents) {
      const existingAgent = await User.findOne({ email: agentData.email });
      if (!existingAgent) {
        const agent = await User.create(agentData);
        createdAgents.push(agent);
        logger.info(`Agent created: ${agent.name} (${agent.email})`);
      } else {
        createdAgents.push(existingAgent);
        logger.info(`Agent already exists: ${existingAgent.name} (${existingAgent.email})`);
      }
    }

    // 3. Create Sample Seller Account
    const sellerData = {
      name: 'John Smith',
      email: 'john.smith@example.com',
      password: 'seller123',
      role: 'seller',
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      termsVersion: '1.0'
    };

    let seller;
    const existingSeller = await User.findOne({ email: sellerData.email });
    if (!existingSeller) {
      seller = await User.create(sellerData);
      logger.info(`Seller created: ${seller.name} (${seller.email})`);
    } else {
      seller = existingSeller;
      logger.info(`Seller already exists: ${seller.name} (${seller.email})`);
    }

    // 4. Create Sample Properties
    const properties = [
      {
        owner: seller._id,
        title: 'Beautiful Family Home in Downtown',
        address: {
          street: '123 Main Street',
          city: 'Austin',
          state: 'TX',
          zipCode: '78701',
          country: 'US'
        },
        location: {
          type: 'Point',
          coordinates: [-97.7431, 30.2672] // Austin coordinates
        },
        propertyType: 'single-family',
        price: 450000,
        beds: 3,
        baths: 2,
        squareMeters: 167, // ~1800 sq ft converted
        description: 'Stunning 3-bedroom home with modern amenities and great location.',
        images: [
          {
            url: '/uploads/images/01.jpg',
            caption: 'Front exterior view',
            isPrimary: true,
            order: 1
          },
          {
            url: '/uploads/images/02.jpg',
            caption: 'Living room',
            isPrimary: false,
            order: 2
          },
          {
            url: '/uploads/images/03.jpg',
            caption: 'Kitchen',
            isPrimary: false,
            order: 3
          }
        ],
        status: 'active',
        contactInfo: {
          name: 'Sarah Johnson',
          email: 'sarah.johnson@onlyif.com',
          phone: '(555) 123-4567'
        },
        featured: true
      },
      {
        owner: seller._id,
        title: 'Modern Condo with City Views',
        address: {
          street: '456 Oak Avenue',
          city: 'Dallas',
          state: 'TX',
          zipCode: '75201',
          country: 'US'
        },
        location: {
          type: 'Point',
          coordinates: [-96.7970, 32.7767] // Dallas coordinates
        },
        propertyType: 'condo',
        price: 320000,
        beds: 2,
        baths: 2,
        squareMeters: 111, // ~1200 sq ft converted
        description: 'Luxury condo with panoramic city views and premium finishes.',
        images: [
          {
            url: '/uploads/images/04.jpg',
            caption: 'City view from balcony',
            isPrimary: true,
            order: 1
          },
          {
            url: '/uploads/images/05.jpg',
            caption: 'Modern living space',
            isPrimary: false,
            order: 2
          },
          {
            url: '/uploads/images/06.jpg',
            caption: 'Master bedroom',
            isPrimary: false,
            order: 3
          }
        ],
        status: 'active',
        contactInfo: {
          name: 'Mike Davis',
          email: 'mike.davis@onlyif.com',
          phone: '(555) 987-6543'
        },
        featured: true
      }
    ];

    const createdProperties = [];
    for (const propertyData of properties) {
      const existingProperty = await Property.findOne({ 
        address: propertyData.address,
        city: propertyData.city 
      });
      
      if (!existingProperty) {
        const property = await Property.create(propertyData);
        createdProperties.push(property);
        logger.info(`Property created: ${property.title} in ${property.city}`);
      } else {
        createdProperties.push(existingProperty);
        logger.info(`Property already exists: ${existingProperty.title}`);
      }
    }

    // 5. Create Add-ons
    const addons = [
      {
        type: 'photo',
        title: 'Professional Photography Package',
        price: 299,
        category: 'photography',
        property: createdProperties[0]._id, // Use first property as reference
        features: [
          {
            name: 'High-resolution photos',
            description: 'Professional quality images',
            included: true
          },
          {
            name: '20-30 professional images',
            description: 'Comprehensive property coverage',
            included: true
          },
          {
            name: 'HDR processing',
            description: 'Enhanced image quality',
            included: true
          },
          {
            name: 'Same-day delivery',
            description: 'Quick turnaround time',
            included: true
          }
        ],
        images: [{
          url: '/images/photo-addon.jpg',
          caption: 'Professional Photography Package',
          isPrimary: true,
          order: 0
        }],
        status: 'active'
      },
      {
        type: 'floorplan',
        title: 'Interactive Floor Plan',
        price: 199,
        category: 'documentation',
        property: createdProperties[0]._id,
        features: [
          {
            name: '2D floor plan',
            description: 'Detailed layout visualization',
            included: true
          },
          {
            name: 'Room measurements',
            description: 'Accurate room dimensions',
            included: true
          },
          {
            name: 'Interactive features',
            description: 'Clickable room details',
            included: true
          },
          {
            name: 'Print-ready format',
            description: 'High-quality printable version',
            included: true
          }
        ],
        images: [{
          url: '/images/floorplan-addon.jpg',
          caption: 'Interactive Floor Plan',
          isPrimary: true,
          order: 0
        }],
        status: 'active'
      },
      {
        type: 'drone',
        title: 'Aerial Drone Photography',
        price: 399,
        category: 'photography',
        property: createdProperties[0]._id,
        features: [
          {
            name: 'Aerial property shots',
            description: 'Bird\'s eye view photography',
            included: true
          },
          {
            name: '4K video footage',
            description: 'Ultra-high definition video',
            included: true
          },
          {
            name: 'Neighborhood overview',
            description: 'Surrounding area context',
            included: true
          },
          {
            name: 'Weather permitting',
            description: 'Subject to weather conditions',
            included: true
          }
        ],
        images: [{
          url: '/images/drone-addon.jpg',
          caption: 'Aerial Drone Photography',
          isPrimary: true,
          order: 0
        }],
        status: 'active'
      },
      {
        type: 'walkthrough',
        title: '3D Virtual Walkthrough',
        price: 499,
        category: 'technology',
        property: createdProperties[0]._id,
        features: [
          {
            name: '360-degree virtual tour',
            description: 'Immersive property experience',
            included: true
          },
          {
            name: 'Interactive hotspots',
            description: 'Clickable information points',
            included: true
          },
          {
            name: 'Mobile-friendly',
            description: 'Optimized for all devices',
            included: true
          },
          {
            name: 'Branded experience',
            description: 'Custom branding options',
            included: true
          }
        ],
        images: [{
          url: '/images/walkthrough-addon.jpg',
          caption: '3D Virtual Walkthrough',
          isPrimary: true,
          order: 0
        }],
        status: 'active'
      }
    ];

    for (const addonData of addons) {
      const existingAddon = await Addon.findOne({ 
        type: addonData.type,
        title: addonData.title 
      });
      
      if (!existingAddon) {
        const addon = await Addon.create(addonData);
        logger.info(`Add-on created: ${addon.title} ($${addon.price})`);
      } else {
        logger.info(`Add-on already exists: ${existingAddon.title}`);
      }
    }

    logger.info('\n=== SEEDING COMPLETED SUCCESSFULLY ===');
    logger.info('\nAdmin Login Credentials:');
    logger.info(`Email: ${ADMIN_EMAIL}`);
    logger.info(`Password: ${ADMIN_PASSWORD}`);
    logger.info('\nNo mock agents created - only real user-registered agents will be in the database');
    logger.info('\nSeller Login Credentials:');
    logger.info('Seller - John Smith: john.smith@example.com / seller123');
    logger.info('\nNote: Admin cannot register through the frontend - login only!');
    
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info('Database connection closed');
    process.exit(0);
  }
};

// Run seeding
if (require.main === module) {
  seedData();
}

module.exports = seedData;