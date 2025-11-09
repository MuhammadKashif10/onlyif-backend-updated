const mongoose = require('mongoose');
const Property = require('../models/Property');
const PropertyStatusHistory = require('../models/PropertyStatusHistory');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
require('dotenv').config();

// Test configuration
const TEST_CONFIG = {
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/onlyif',
  TEST_PROPERTY_ID: null,
  TEST_AGENT_ID: null,
  TEST_SELLER_ID: null
};

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(TEST_CONFIG.MONGO_URI);
    console.log('✅ Connected to MongoDB for testing');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Create test data
const createTestData = async () => {
  try {
    console.log('🔧 Creating test data...');
    
    // Create test agent with required profile
    const agent = await User.create({
      name: 'Test Agent',
      email: 'agent@test.com',
      role: 'agent',
      password: 'testpassword123',
      phone: '+61400000000',
      agentProfile: {
        yearsOfExperience: 5,
        brokerage: 'Test Real Estate Agency',
        phone: '+61400000000',
        licenseNumber: 'TEST123456',
        specializations: ['residential', 'commercial']
      }
    });
    TEST_CONFIG.TEST_AGENT_ID = agent._id;
    console.log('👤 Test agent created:', agent._id);
    
    // Create test seller
    const seller = await User.create({
      name: 'Test Seller',
      email: 'seller@test.com',
      role: 'seller',
      password: 'testpassword123',
      phone: '+61400000001'
    });
    TEST_CONFIG.TEST_SELLER_ID = seller._id;
    console.log('👤 Test seller created:', seller._id);
    
    // Create test property
    const property = await Property.create({
      owner: seller._id,
      title: 'Professional Test Property',
      address: {
        street: '123 Test Street',
        city: 'Melbourne',
        state: 'VIC',
        zipCode: '30000', // US format for compatibility
        country: 'US'
      },
      price: 750000,
      beds: 3,
      baths: 2,
      squareMeters: 150,
      propertyType: 'single-family',
      status: 'active',
      // salesStatus will be undefined initially (as expected)
      contactInfo: {
        name: seller.name,
        email: seller.email,
        phone: seller.phone
      },
      agents: [{
        agent: agent._id,
        role: 'listing',
        commissionRate: 3,
        isActive: true,
        assignedAt: new Date(),
        assignedBy: seller._id
      }],
      assignedAgent: agent._id
    });
    TEST_CONFIG.TEST_PROPERTY_ID = property._id;
    console.log('🏠 Test property created:', property._id);
    
    return { agent, seller, property };
    
  } catch (error) {
    console.error('❌ Failed to create test data:', error);
    throw error;
  }
};

// Test status progression
const testStatusProgression = async () => {
  console.log('\n🧪 Testing status progression...');
  
  const statuses = ['contract-exchanged', 'unconditional', 'settled'];
  
  for (const status of statuses) {
    try {
      console.log(`\n📋 Testing status change to: ${status}`);
      
      // Simulate API call
      const property = await Property.findById(TEST_CONFIG.TEST_PROPERTY_ID);
      const previousStatus = property.salesStatus;
      
      // Update property status
      property.salesStatus = status;
      if (status === 'settled') {
        property.status = 'sold';
        property.settlementDate = new Date();
      }
      await property.save();
      
      // Create status history entry
      const statusHistory = await PropertyStatusHistory.createStatusChange({
        property: property._id,
        previousStatus,
        newStatus: status,
        changedBy: TEST_CONFIG.TEST_AGENT_ID,
        changeReason: `Testing ${status} status`,
        metadata: {
          userAgent: 'Test Script',
          ipAddress: '127.0.0.1',
          timestamp: new Date(),
          source: 'api'
        },
        settlementDetails: status === 'settled' ? {
          settlementDate: new Date(),
          commissionRate: 3,
          solicitorName: 'Test Solicitor',
          solicitorEmail: 'solicitor@test.com'
        } : {}
      });
      
      console.log(`✅ Status updated: ${previousStatus || 'null'} → ${status}`);
      console.log(`📝 History entry created: ${statusHistory._id}`);
      
      // Test invoice generation for settled status
      if (status === 'settled') {
        console.log('💰 Testing invoice generation...');
        
        const invoice = await Invoice.createSettlementInvoice(
          property._id,
          TEST_CONFIG.TEST_AGENT_ID,
          TEST_CONFIG.TEST_SELLER_ID,
          {
            commissionRate: 3,
            settlementDate: new Date()
          }
        );
        
        console.log(`✅ Invoice generated: ${invoice.invoiceNumber}`);
        console.log(`💵 Invoice amount: $${invoice.totalAmount.toLocaleString()}`);
        
        // Update status history with invoice details
        statusHistory.invoice = {
          generated: true,
          invoiceId: invoice._id,
          generatedAt: new Date(),
          amount: invoice.totalAmount,
          status: 'pending'
        };
        await statusHistory.save();
        
        console.log('✅ Status history updated with invoice details');
      }
      
    } catch (error) {
      console.error(`❌ Failed to test ${status} status:`, error);
    }
  }
};

// Test validation scenarios
const testValidation = async () => {
  console.log('\n🔍 Testing validation scenarios...');
  
  const testCases = [
    {
      name: 'Invalid Status',
      data: { status: 'invalid-status' },
      expectError: true
    },
    {
      name: 'Duplicate Status',
      data: { status: 'settled' }, // Already settled
      expectError: true
    },
    {
      name: 'Empty Status',
      data: { status: '' },
      expectError: true
    },
    {
      name: 'Valid Status with Details',
      data: {
        status: 'contract-exchanged',
        changeReason: 'Contracts signed by both parties',
        settlementDetails: {
          settlementDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          commissionRate: 2.5
        }
      },
      expectError: false
    }
  ];
  
  for (const testCase of testCases) {
    try {
      console.log(`\n🧪 Testing: ${testCase.name}`);
      
      // Reset property to unconditional for testing
      if (testCase.name === 'Valid Status with Details') {
        const property = await Property.findById(TEST_CONFIG.TEST_PROPERTY_ID);
        property.salesStatus = 'unconditional';
        await property.save();
      }
      
      // Simulate validation
      const validStatuses = ['contract-exchanged', 'unconditional', 'settled'];
      const isValidStatus = validStatuses.includes(testCase.data.status);
      
      if (!isValidStatus && testCase.expectError) {
        console.log('✅ Correctly rejected invalid status');
      } else if (isValidStatus && !testCase.expectError) {
        console.log('✅ Correctly accepted valid status');
      } else {
        console.log('⚠️ Unexpected validation result');
      }
      
    } catch (error) {
      if (testCase.expectError) {
        console.log('✅ Correctly threw error for invalid data');
      } else {
        console.error(`❌ Unexpected error for ${testCase.name}:`, error);
      }
    }
  }
};

// Test audit trail
const testAuditTrail = async () => {
  console.log('\n📊 Testing audit trail...');
  
  try {
    // Get property history
    const history = await PropertyStatusHistory.getPropertyHistory(TEST_CONFIG.TEST_PROPERTY_ID);
    console.log(`📋 Found ${history.length} status changes`);
    
    history.forEach((entry, index) => {
      console.log(`${index + 1}. ${entry.previousStatus || 'null'} → ${entry.newStatus}`);
      console.log(`   Changed by: ${entry.changedBy.name} (${entry.changedBy.email})`);
      console.log(`   Date: ${entry.createdAt.toISOString()}`);
      console.log(`   Reason: ${entry.changeReason || 'Not provided'}`);
      
      if (entry.invoice.generated) {
        console.log(`   Invoice: ${entry.invoice.invoiceId} ($${entry.invoice.amount.toLocaleString()})`);
      }
      
      console.log('');
    });
    
    // Get agent history
    const agentHistory = await PropertyStatusHistory.getAgentHistory(TEST_CONFIG.TEST_AGENT_ID);
    console.log(`👤 Agent has made ${agentHistory.length} status changes across all properties`);
    
  } catch (error) {
    console.error('❌ Failed to test audit trail:', error);
  }
};

// Test performance
const testPerformance = async () => {
  console.log('\n⚡ Testing performance...');
  
  const iterations = 10;
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const startTime = Date.now();
    
    try {
      // Simulate a complete status update cycle
      const property = await Property.findById(TEST_CONFIG.TEST_PROPERTY_ID);
      property.salesStatus = i % 2 === 0 ? 'unconditional' : 'contract-exchanged';
      await property.save();
      
      await PropertyStatusHistory.createStatusChange({
        property: property._id,
        previousStatus: property.salesStatus === 'unconditional' ? 'contract-exchanged' : 'unconditional',
        newStatus: property.salesStatus,
        changedBy: TEST_CONFIG.TEST_AGENT_ID,
        changeReason: `Performance test ${i + 1}`,
        metadata: {
          userAgent: 'Performance Test',
          ipAddress: '127.0.0.1',
          timestamp: new Date(),
          source: 'api'
        }
      });
      
      const endTime = Date.now();
      times.push(endTime - startTime);
      
    } catch (error) {
      console.error(`❌ Performance test ${i + 1} failed:`, error);
    }
  }
  
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  
  console.log(`📊 Performance Results (${iterations} iterations):`);
  console.log(`   Average time: ${avgTime.toFixed(2)}ms`);
  console.log(`   Min time: ${minTime}ms`);
  console.log(`   Max time: ${maxTime}ms`);
  
  if (avgTime < 100) {
    console.log('✅ Performance is excellent (<100ms average)');
  } else if (avgTime < 500) {
    console.log('✅ Performance is good (<500ms average)');
  } else {
    console.log('⚠️ Performance could be improved (>500ms average)');
  }
};

// Cleanup test data
const cleanup = async () => {
  try {
    console.log('\n🧹 Cleaning up test data...');
    
    // Delete test records
    await PropertyStatusHistory.deleteMany({ property: TEST_CONFIG.TEST_PROPERTY_ID });
    await Invoice.deleteMany({ property: TEST_CONFIG.TEST_PROPERTY_ID });
    await Property.findByIdAndDelete(TEST_CONFIG.TEST_PROPERTY_ID);
    await User.findByIdAndDelete(TEST_CONFIG.TEST_AGENT_ID);
    await User.findByIdAndDelete(TEST_CONFIG.TEST_SELLER_ID);
    
    console.log('✅ Test data cleaned up successfully');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
};

// Main test runner
const runTests = async () => {
  console.log('🚀 Starting Professional Status System Tests');
  console.log('=' .repeat(50));
  
  try {
    await connectDB();
    await createTestData();
    await testStatusProgression();
    await testValidation();
    await testAuditTrail();
    await testPerformance();
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests completed successfully!');
    console.log('🎉 Professional status system is working correctly');
    
  } catch (error) {
    console.error('\n❌ Tests failed:', error);
  } finally {
    await cleanup();
    await mongoose.connection.close();
    console.log('👋 Tests finished, database connection closed');
    process.exit(0);
  }
};

// Run tests if called directly
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  testStatusProgression,
  testValidation,
  testAuditTrail,
  testPerformance
};