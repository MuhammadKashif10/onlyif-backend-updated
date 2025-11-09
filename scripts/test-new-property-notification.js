const mongoose = require('mongoose');
require('dotenv').config();

// Import models and services
const Property = require('../models/Property');
const User = require('../models/User');
const BuyerNotification = require('../models/BuyerNotification');
const newPropertyNotificationService = require('../services/newPropertyNotificationService');

/**
 * Test script for new property notification system
 */
async function testNewPropertyNotification() {
  try {
    console.log('🧪 Starting New Property Notification Test...\n');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/onlyif-real');
    console.log('✅ Connected to database');

    // Find or create a test buyer user
    let testBuyer = await User.findOne({ email: 'testbuyer@example.com', role: 'buyer' });
    
    if (!testBuyer) {
      console.log('📝 Creating test buyer user...');
      testBuyer = new User({
        name: 'Test Buyer',
        email: 'testbuyer@example.com',
        password: 'testpassword123',
        role: 'buyer',
        isActive: true
      });
      await testBuyer.save();
      console.log('✅ Test buyer created');
    } else {
      console.log('✅ Test buyer found');
    }

    // Find or create a test seller user
    let testSeller = await User.findOne({ email: 'testseller@example.com', role: 'seller' });
    
    if (!testSeller) {
      console.log('📝 Creating test seller user...');
      testSeller = new User({
        name: 'Test Seller',
        email: 'testseller@example.com',
        password: 'testpassword123',
        role: 'seller',
        isActive: true
      });
      await testSeller.save();
      console.log('✅ Test seller created');
    } else {
      console.log('✅ Test seller found');
    }

    // Create a test property
    console.log('🏠 Creating test property...');
    const testProperty = new Property({
      owner: testSeller._id,
      title: 'Beautiful Test Property - ' + new Date().toISOString(),
      address: {
        street: '123 Test Street',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345',
        country: 'US'
      },
      location: {
        type: 'Point',
        coordinates: [-98.5795, 39.8283]
      },
      price: 299999,
      beds: 3,
      baths: 2,
      squareMeters: 150,
      propertyType: 'single-family',
      description: 'This is a test property for notification testing.',
      contactInfo: {
        name: 'Test Seller',
        email: 'testseller@example.com',
        phone: '555-0123'
      },
      status: 'active', // Set to active to trigger notifications
      images: []
    });

    await testProperty.save();
    console.log('✅ Test property created:', testProperty.title);

    // Clear existing notifications for test buyer
    await BuyerNotification.deleteMany({ userId: testBuyer._id });
    console.log('🧹 Cleared existing test notifications');

    // Test the notification service
    console.log('\n📢 Testing new property notification service...');
    const result = await newPropertyNotificationService.notifyBuyersAboutNewProperty(testProperty);

    console.log('\n📊 Notification Service Results:');
    console.log('- Total Buyers:', result.totalBuyers);
    console.log('- Notifications Sent:', result.notificationsSent);
    console.log('- Property:', result.property.title);

    // Verify notification was created
    const createdNotifications = await BuyerNotification.find({ 
      userId: testBuyer._id,
      type: 'new_property'
    }).sort({ createdAt: -1 }).limit(1);

    if (createdNotifications.length > 0) {
      const notification = createdNotifications[0];
      console.log('\n✅ Notification Created Successfully!');
      console.log('- Notification ID:', notification._id);
      console.log('- Title:', notification.title);
      console.log('- Message:', notification.message);
      console.log('- Type:', notification.type);
      console.log('- Priority:', notification.priority);
      console.log('- Status:', notification.status);
      console.log('- Property ID:', notification.data.propertyId);
      console.log('- Action URL:', notification.data.actionUrl);
    } else {
      console.log('❌ No notification was created');
    }

    // Test price drop notification
    console.log('\n💰 Testing price drop notification...');
    const oldPrice = testProperty.price;
    testProperty.price = 249999; // Reduce price
    await testProperty.save();

    await newPropertyNotificationService.notifyBuyersAboutPriceDrop(testProperty, oldPrice);

    // Verify price drop notification was created
    const priceDropNotifications = await BuyerNotification.find({ 
      userId: testBuyer._id,
      type: 'price_drop'
    }).sort({ createdAt: -1 }).limit(1);

    if (priceDropNotifications.length > 0) {
      const notification = priceDropNotifications[0];
      console.log('\n✅ Price Drop Notification Created Successfully!');
      console.log('- Title:', notification.title);
      console.log('- Message:', notification.message);
      console.log('- Old Price:', notification.data.metadata.oldPrice);
      console.log('- New Price:', notification.data.metadata.newPrice);
      console.log('- Reduction:', notification.data.metadata.priceReduction);
    } else {
      console.log('❌ No price drop notification was created');
    }

    // Show all notifications for the test buyer
    const allNotifications = await BuyerNotification.find({ userId: testBuyer._id })
      .sort({ createdAt: -1 });

    console.log(`\n📋 All Notifications for Test Buyer (${allNotifications.length} total):`);
    allNotifications.forEach((notification, index) => {
      console.log(`${index + 1}. [${notification.type.toUpperCase()}] ${notification.title} - ${notification.status}`);
    });

    console.log('\n🎉 Test completed successfully!');
    console.log('\n💡 To see notifications in the app:');
    console.log('1. Login as a buyer user');
    console.log('2. Click the bell icon near the Account button');
    console.log('3. You should see the new property and price drop notifications');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('📝 Database connection closed');
  }
}

// Run the test
testNewPropertyNotification();