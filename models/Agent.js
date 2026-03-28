const mongoose = require('mongoose');

const AgentSchema = new mongoose.Schema({
  // ...existing fields...
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  licenseNumber: { type: String },
  status: { type: String, enum: ['pending','approved','rejected','suspended'], default: 'pending' },
  joinedDate: { type: Date, default: Date.now },
  totalListings: { type: Number, default: 0 },
  totalSales: { type: Number, default: 0 },
  rating: { type: Number, default: 0 },
  profileImage: { type: String },

  // new field: bankAccountNumber (stored as string to preserve leading zeros)
  bankAccountNumber: {
    type: String,
    required: [true, 'Bank account number is required'],
    trim: true
  }

  // ...existing code...
});

module.exports = mongoose.models.Agent || mongoose.model('Agent', AgentSchema);