const mongoose = require('mongoose');
const env = require('./env'); // import your env.js

mongoose.set('strictPopulate', false);

const connectDB = async () => {
  console.log("🚀 ~ connectDB ~ env.MONGO_URI:", env.MONGO_URI)
  try {
    const conn = await mongoose.connect(env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ MongoDB connected successfully');
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection failed:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;