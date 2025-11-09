const mongoose = require('mongoose');

// Professional Invoice schema
const invoiceSchema = new mongoose.Schema({
  // Invoice identification
  invoiceNumber: {
    type: String,
    required: [true, 'Invoice number is required'],
    unique: true,
    index: true
  },
  
  // Related entities
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Property reference is required'],
    index: true
  },
  
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Agent reference is required'],
    index: true
  },
  
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Made optional for buyer invoices
  },
  
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Optional for buyer invoices
    index: true
  },
  
  // Invoice details
  category: {
    type: String,
    enum: ['settlement_commission', 'platform_commission', 'buyer_payment', 'other'],
    default: 'settlement_commission',
    index: true
  },
  invoiceDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  
  dueDate: {
    type: Date,
    required: true
  },
  
  settlementDate: {
    type: Date,
    required: true
  },
  
  // Financial details
  propertyValue: {
    type: Number,
    required: [true, 'Property value is required'],
    min: [0, 'Property value cannot be negative']
  },
  
  commissionRate: {
    type: Number,
    required: [true, 'Commission rate is required'],
    min: [0, 'Commission rate cannot be negative'],
    max: [100, 'Commission rate cannot exceed 100%']
  },
  
  commissionAmount: {
    type: Number,
    required: [true, 'Commission amount is required'],
    min: [0, 'Commission amount cannot be negative']
  },
  
  // Line items
  lineItems: [{
    description: {
      type: String,
      required: true,
      trim: true
    },
    quantity: {
      type: Number,
      default: 1,
      min: 0
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    },
    taxable: {
      type: Boolean,
      default: true
    }
  }],
  
  // Tax calculations
  tax: {
    gst: {
      rate: {
        type: Number,
        default: 10, // 10% GST
        min: 0,
        max: 100
      },
      amount: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    other: [{
      name: String,
      rate: Number,
      amount: Number
    }]
  },
  
  // Totals
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  
  totalTax: {
    type: Number,
    default: 0,
    min: 0
  },
  
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Convenience: display currency for UI (does not affect calculations)
  displayCurrency: {
    type: String,
    default: 'A$',
    trim: true
  },
  
  // Payment details
  paymentTerms: {
    type: String,
    default: 'Net 30 days',
    enum: ['Due on receipt', 'Net 7 days', 'Net 14 days', 'Net 30 days', 'Net 60 days', 'Custom']
  },
  
  paymentMethods: [{
    type: {
      type: String,
      enum: ['bank_transfer', 'credit_card', 'paypal', 'check', 'cash', 'stripe', 'stripe_checkout'],
      default: 'bank_transfer'
    },
    details: mongoose.Schema.Types.Mixed
  }],
  
  // Status tracking
  status: {
    type: String,
    enum: ['draft', 'pending', 'sent', 'viewed', 'paid', 'overdue', 'cancelled', 'refunded'],
    default: 'draft',
    index: true
  },
  
  // Payment tracking
  payments: [{
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    paymentDate: {
      type: Date,
      required: true
    },
    paymentMethod: {
      type: String,
      enum: ['bank_transfer', 'credit_card', 'paypal', 'check', 'cash', 'stripe', 'stripe_checkout'],
      required: true
    },
    transactionId: String,
    reference: String,
    notes: String,
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    recordedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Communication tracking
  communications: [{
    type: {
      type: String,
      enum: ['email', 'sms', 'phone', 'mail', 'in_person'],
      required: true
    },
    sentTo: String,
    sentAt: Date,
    subject: String,
    content: String,
    status: {
      type: String,
      enum: ['sent', 'delivered', 'opened', 'failed']
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Document management
  documents: [{
    filename: String,
    originalName: String,
    path: String,
    mimeType: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Notes and additional info
  notes: {
    public: {
      type: String,
      maxlength: [1000, 'Public notes cannot exceed 1000 characters']
    },
    private: {
      type: String,
      maxlength: [1000, 'Private notes cannot exceed 1000 characters']
    }
  },
  
  // Audit trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // System flags
  isActive: {
    type: Boolean,
    default: true
  },
  
  isRecurring: {
    type: Boolean,
    default: false
  },
  
  recurringDetails: {
    frequency: {
      type: String,
      enum: ['weekly', 'monthly', 'quarterly', 'yearly']
    },
    nextInvoiceDate: Date,
    endDate: Date
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ property: 1 });
invoiceSchema.index({ agent: 1 });
invoiceSchema.index({ seller: 1 });
invoiceSchema.index({ buyer: 1 });
invoiceSchema.index({ status: 1, dueDate: 1 });
invoiceSchema.index({ createdAt: -1 });

// Virtual properties
// Alias for external integrations expecting invoiceId
invoiceSchema.virtual('invoiceId').get(function() {
  return this._id;
});

// Amount alias mapping to totalAmount
invoiceSchema.virtual('amount').get(function() {
  return this.totalAmount;
});

invoiceSchema.virtual('isOverdue').get(function() {
  return this.status !== 'paid' && this.dueDate < new Date();
});

invoiceSchema.virtual('daysPastDue').get(function() {
  if (this.status === 'paid' || this.dueDate >= new Date()) return 0;
  const diffTime = new Date() - this.dueDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

invoiceSchema.virtual('amountPaid').get(function() {
  return this.payments.reduce((sum, payment) => sum + payment.amount, 0);
});

invoiceSchema.virtual('amountDue').get(function() {
  return this.totalAmount - this.amountPaid;
});

// Static methods
invoiceSchema.statics.generateInvoiceNumber = async function() {
  const year = new Date().getFullYear();
  const count = await this.countDocuments({
    createdAt: {
      $gte: new Date(year, 0, 1),
      $lt: new Date(year + 1, 0, 1)
    }
  });
  
  return `INV-${year}-${String(count + 1).padStart(6, '0')}`;
};

invoiceSchema.statics.createSettlementInvoice = async function(propertyId, agentId, sellerId, settlementData = {}) {
  const property = await mongoose.model('Property').findById(propertyId);
  const agent = await mongoose.model('User').findById(agentId);
  if (!property || !agent) {
    throw new Error('Property or Agent not found');
  }

  // Prevent duplicate seller invoices for the same property
  const existing = await this.findOne({
    property: propertyId,
    seller: sellerId,
    category: 'settlement_commission',
    status: { $ne: 'cancelled' }
  }).sort({ createdAt: -1 });
  if (existing) {
    console.log(`[Invoice] Existing settlement invoice reused: ${existing.invoiceNumber} for property=${propertyId}`);
    return existing;
  }

  const invoiceNumber = await this.generateInvoiceNumber();
  // Enforce 1.1% commission as per requirements
  const commissionRate = 1.1;
  const commissionAmount = (property.price * commissionRate) / 100;
  const gstAmount = (commissionAmount * 10) / 100; // 10% GST

  const invoice = new this({
    invoiceNumber,
    category: 'settlement_commission',
    property: propertyId,
    agent: agentId,
    seller: sellerId,
    settlementDate: settlementData.settlementDate || new Date(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    propertyValue: property.price,
    commissionRate,
    commissionAmount,
    lineItems: [{
      description: `Real Estate Commission - ${property.title}`,
      quantity: 1,
      unitPrice: commissionAmount,
      totalPrice: commissionAmount,
      taxable: true
    }],
    tax: { gst: { rate: 10, amount: gstAmount } },
    subtotal: commissionAmount,
    totalTax: gstAmount,
    totalAmount: commissionAmount + gstAmount,
    status: 'pending',
    createdBy: agentId
  });

  await invoice.save();
  console.log(`[Invoice] New settlement invoice created: ${invoice.invoiceNumber} (1.1% on ${property.price})`);
  return invoice;
};

// Create platform commission invoice (half of 1.1% of sale price)
invoiceSchema.statics.createPlatformCommissionInvoice = async function(propertyId, agentId, sellerId, options = {}) {
  const property = await mongoose.model('Property').findById(propertyId);
  const agent = await mongoose.model('User').findById(agentId);
  if (!property || !agent) {
    throw new Error('Property or Agent not found');
  }
  const platformRate = 0.55; // percent (half of 1.1%)
  const invoiceNumber = await this.generateInvoiceNumber();
  const commissionAmount = (property.price * platformRate) / 100;
  const gstAmount = (commissionAmount * 10) / 100;
  const invoice = new this({
    invoiceNumber,
    category: 'platform_commission',
    property: propertyId,
    agent: agentId,
    seller: sellerId,
    settlementDate: options.settlementDate || new Date(),
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
    propertyValue: property.price,
    commissionRate: platformRate,
    commissionAmount,
    lineItems: [{
      description: `Platform Commission (0.55%) - ${property.title}`,
      quantity: 1,
      unitPrice: commissionAmount,
      totalPrice: commissionAmount,
      taxable: true
    }],
    tax: { gst: { rate: 10, amount: gstAmount } },
    subtotal: commissionAmount,
    totalTax: gstAmount,
    totalAmount: commissionAmount + gstAmount,
    status: 'pending',
    createdBy: agentId
  });
  await invoice.save();
  return invoice;
};

// Create buyer payment invoice (10% of property price)
invoiceSchema.statics.createBuyerPaymentInvoice = async function(propertyId, agentId, buyerId, options = {}) {
  const property = await mongoose.model('Property').findById(propertyId);
  const agent = await mongoose.model('User').findById(agentId);
  const buyer = await mongoose.model('User').findById(buyerId);
  
  if (!property || !agent || !buyer) {
    throw new Error('Property, Agent, or Buyer not found');
  }

  // Prevent duplicate buyer invoices for the same property
  const existing = await this.findOne({
    property: propertyId,
    buyer: buyerId,
    category: 'buyer_payment',
    status: { $ne: 'cancelled' }
  }).sort({ createdAt: -1 });
  
  if (existing) {
    console.log(`[Invoice] Existing buyer invoice reused: ${existing.invoiceNumber} for property=${propertyId}`);
    return existing;
  }

  const invoiceNumber = await this.generateInvoiceNumber();
  const buyerPaymentRate = 10; // 10% of property price
  const buyerPaymentAmount = (property.price * buyerPaymentRate) / 100;
  const gstAmount = (buyerPaymentAmount * 10) / 100; // 10% GST

  // Add payment method details with agent's bank account
  const paymentMethodDetails = {
    bank_transfer: {
      accountName: agent.name,
      accountNumber: agent.bankAccountNumber, // Added agent bank account
      bankName: 'Trust Account',
      reference: `PROP-${property._id.toString().slice(-6)}`
    }
  };

  const invoice = new this({
    invoiceNumber,
    category: 'buyer_payment',
    property: propertyId,
    agent: agentId,
    buyer: buyerId,
    settlementDate: options.settlementDate || new Date(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    propertyValue: property.price,
    commissionRate: buyerPaymentRate,
    commissionAmount: buyerPaymentAmount,
    paymentMethods: [{
      type: 'bank_transfer',
      details: paymentMethodDetails.bank_transfer
    }],
    lineItems: [{
      description: `Property Purchase Payment (10%) - ${property.title}`,
      quantity: 1,
      unitPrice: buyerPaymentAmount,
      totalPrice: buyerPaymentAmount,
      taxable: true
    }],
    notes: {
      public: `Please transfer the deposit amount to the agent's trust account using the reference: PROP-${property._id.toString().slice(-6)}`
    },
    tax: { gst: { rate: 10, amount: gstAmount } },
    subtotal: buyerPaymentAmount,
    totalTax: gstAmount,
    totalAmount: buyerPaymentAmount + gstAmount,
    status: 'pending',
    createdBy: agentId
  });

  await invoice.save();
  console.log(`[Invoice] New buyer payment invoice created: ${invoice.invoiceNumber} (10% on ${property.price})`);
  
  // Log payment details for verification
  console.log(`[Invoice] Payment details added:`, {
    accountName: agent.name,
    accountNumber: agent.bankAccountNumber,
    reference: `PROP-${property._id.toString().slice(-6)}`
  });

  return invoice;
};

// Instance methods
invoiceSchema.methods.addPayment = async function(paymentData) {
  this.payments.push(paymentData);
  
  // Update status based on payments
  const totalPaid = this.amountPaid;
  if (totalPaid >= this.totalAmount) {
    this.status = 'paid';
  } else if (totalPaid > 0) {
    this.status = 'partially_paid';
  }
  
  const savedInvoice = await this.save();
  
  // Emit real-time update if Socket.IO is available
  if (global.io && global.emitInvoiceUpdate) {
    try {
      // Populate the invoice for the update
      const populatedInvoice = await this.constructor.findById(this._id)
        .populate('property', 'title address price')
        .populate('agent', 'name email')
        .populate('seller', 'name email')
        .populate('buyer', 'name email');
      
      global.emitInvoiceUpdate(global.io, populatedInvoice, 'payment_received');
    } catch (error) {
      console.error('Error emitting invoice update:', error);
    }
  }
  
  return savedInvoice;
};

invoiceSchema.methods.markAsSent = async function(sentBy) {
  this.status = 'sent';
  this.communications.push({
    type: 'email',
    sentAt: new Date(),
    status: 'sent',
    sentBy
  });
  return this.save();
};

invoiceSchema.methods.calculateTotals = function() {
  this.subtotal = this.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  this.totalTax = this.tax.gst.amount + this.tax.other.reduce((sum, tax) => sum + tax.amount, 0);
  this.totalAmount = this.subtotal + this.totalTax;
};

// Pre-save middleware
invoiceSchema.pre('save', function(next) {
  // Auto-calculate totals
  if (this.isModified('lineItems') || this.isModified('tax')) {
    this.calculateTotals();
  }
  
  // Update lastModifiedBy
  if (this.isModified() && !this.isNew) {
    this.lastModifiedBy = this.lastModifiedBy || this.createdBy;
  }
  
  next();
});

// Post-save middleware
invoiceSchema.post('save', function(doc) {
  console.log(`💰 Invoice ${doc.invoiceNumber} ${doc.isNew ? 'created' : 'updated'} - Status: ${doc.status}`);
});

module.exports = mongoose.model('Invoice', invoiceSchema);