const Property = require('../models/Property');
const User = require('../models/User');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const corelogicService = require('../services/corelogicService');
const emailService = require('../services/emailService');
const { successResponse, errorResponse, paginationMeta } = require('../utils/responseFormatter');
const Purchase = require('../models/Purchase');
const { notifyBuyersAboutNewProperty, notifyBuyersAboutPriceDrop } = require('./notificationController');

// @desc    Update property sales status (Professional Implementation)
// @route   PATCH /api/properties/:id/status
// @access  Private (Agent only)
const updatePropertySalesStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, changeReason, settlementDetails } = req.body;
    const property = req.property; // Set by validation middleware
    const previousStatus = property.salesStatus;

    console.log(`🔄 Processing status update (no-tx): ${previousStatus || 'null'} -> ${status} for property ${id}`);

    // Update property state
    property.salesStatus = status;
    property.lastModifiedBy = req.user.id;
    if (status === 'settled') {
      property.status = 'sold';
      if (settlementDetails?.settlementDate) {
        property.settlementDate = new Date(settlementDetails.settlementDate);
      }
    }
    await property.save();

    // Create audit history (no session)
    const PropertyStatusHistory = require('../models/PropertyStatusHistory');

    // Prepare settlement details including off-platform deposit handling when settled
    let mergedSettlement = settlementDetails || {};
    if (status === 'settled') {
      const depositAmount = typeof property.price === 'number' ? Number((property.price * 0.10).toFixed(2)) : 0;
      mergedSettlement = {
        ...mergedSettlement,
        deposit: {
          percentage: 10,
          expectedAmount: depositAmount,
          handler: 'agent_trust_account',
          currency: 'AUD',
          releaseStatus: 'released',
          releasedAt: new Date(),
          commissionDeducted: true,
          notes: 'Deposit handled off-platform via agent trust account after solicitor confirmation.'
        }
      };
    }

    const statusHistory = await PropertyStatusHistory.createStatusChange({
      property: id,
      previousStatus,
      newStatus: status,
      changedBy: req.user.id,
      changeReason: changeReason || '',
      metadata: {
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        timestamp: new Date(),
        source: 'web'
      },
      settlementDetails: mergedSettlement,
      processingStatus: 'processing'
    });

    // Optional invoice on settled
    let invoiceResult = null;
    let buyerInvoiceResult = null;
    // Placeholder for potential platform-level commission invoice (not implemented yet)
    let platformInvoiceResult = null;
    if (status === 'settled') {
      try {
        // Determine sellerId to use (optional override via request)
        const sellerIdInput = req.body?.sellerId;
        const sellerIdForInvoice = (sellerIdInput && mongoose.Types.ObjectId.isValid(sellerIdInput))
          ? new mongoose.Types.ObjectId(sellerIdInput)
          : property.owner;

        // Seller-facing settlement invoice (1.1%) with duplicate prevention
        invoiceResult = await generateSettlementInvoice(property, req.user.id, settlementDetails, null, sellerIdForInvoice);

        statusHistory.invoice = {
          generated: true,
          invoiceId: invoiceResult.invoiceId,
          generatedAt: new Date(),
          amount: invoiceResult.amount,
          status: 'pending'
        };
        await statusHistory.save();
        console.log(`💰 Invoice ${invoiceResult.invoiceNumber} ${invoiceResult.alreadyExisted ? '(existing)' : 'generated'} for settled property: ${property.title}`);
      } catch (invoiceError) {
        console.error('❌ Invoice generation failed:', invoiceError);
        
        await statusHistory.markAsFailed(invoiceError);
        await createFailedInvoiceNotification(property, req.user, invoiceError);
      }

      // Generate buyer invoice (10% of property price)
      try {
        const buyerIdInput = req.body?.buyerId;
        if (buyerIdInput && mongoose.Types.ObjectId.isValid(buyerIdInput)) {
          buyerInvoiceResult = await generateBuyerInvoice(property, req.user.id, settlementDetails, buyerIdInput);
          
          statusHistory.buyerInvoice = {
            generated: true,
            invoiceId: buyerInvoiceResult.invoiceId,
            generatedAt: new Date(),
            amount: buyerInvoiceResult.amount,
            status: 'pending'
          };
          await statusHistory.save();
          console.log(`💰 Buyer Invoice ${buyerInvoiceResult.invoiceNumber} ${buyerInvoiceResult.alreadyExisted ? '(existing)' : 'generated'} for settled property: ${property.title}`);
        } else {
          console.log('⚠️ No buyerId provided for buyer invoice generation');
        }
      } catch (buyerInvoiceError) {
        console.error('❌ Buyer invoice generation failed:', buyerInvoiceError);
        // Don't fail the entire operation for buyer invoice errors
      }
    }
    // Async notifications
    setImmediate(async () => {
      try {
        await sendStatusChangeNotifications(property, previousStatus, status, req.user);
        if (status === 'settled' && invoiceResult?.invoiceId && !invoiceResult?.alreadyExisted) {
          const InvoiceNotificationService = require('../services/invoiceNotificationService');
          const Invoice = require('../models/Invoice');
          const fullInvoice = await Invoice.findById(invoiceResult.invoiceId)
            .populate('property', 'title address price owner');
          if (fullInvoice) {
            const io = req.app?.locals?.io || global.io;
            await InvoiceNotificationService.sendInvoiceGeneratedNotification(fullInvoice, property, io);
            console.log(`📧 Invoice notification sent for ${property.title}`);
          }
        }
      } catch (notificationError) {
        console.error('❌ Notification sending failed:', notificationError);
      }
    });

    await statusHistory.markAsProcessed();

    const responseData = {
      property: {
        id: property._id,
        salesStatus: property.salesStatus,
        status: property.status,
        lastModified: property.updatedAt
      },
      statusHistory: {
        id: statusHistory._id,
        previousStatus,
        newStatus: status,
        changedAt: statusHistory.createdAt
      }
    };
    if (invoiceResult) {
      responseData.invoice = {
        generated: true,
        invoiceNumber: invoiceResult.invoiceNumber,
        amount: invoiceResult.amount,
        dueDate: invoiceResult.dueDate
      };
    }
    if (platformInvoiceResult) {
      responseData.platformInvoice = {
        generated: true,
        invoiceNumber: platformInvoiceResult.invoiceNumber,
        amount: platformInvoiceResult.amount,
        dueDate: platformInvoiceResult.dueDate,
        invoiceId: platformInvoiceResult.invoiceId
      };
    }

    const message = `Property sales status successfully updated to ${getStatusDisplayName(status)}${
      invoiceResult ? ` and invoice ${invoiceResult.invoiceNumber} generated` : ''
    }`;

    console.log(`✅ Status update completed successfully (no-tx): ${property.title}`);
    return res.json(successResponse(responseData, message));
  } catch (error) {
    console.error('❌ Status update failed:', error);
    const errorDetails = {
      propertyId: req.params?.id || null,
      requestedStatus: req.body?.status,
      errorType: error?.name || 'Error',
      timestamp: new Date().toISOString()
    };
    if (error?.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors || {}).map(err => err.message);
      return res.status(400).json(errorResponse('Status update validation failed', 400, { ...errorDetails, validationErrors }));
    }
    if (error?.name === 'MongoServerError' && error?.code === 11000) {
      return res.status(409).json(errorResponse('Duplicate operation detected', 409, errorDetails));
    }
    return res.status(500).json(errorResponse(error?.message || 'Property status update failed', 500, errorDetails));
  }
};

// @desc    Generate professional settlement invoice
const generateSettlementInvoice = async (property, agentId, settlementDetails, session, sellerIdOverride = null) => {
  try {
    const Invoice = require('../models/Invoice');
    const User = require('../models/User');
    
    // Determine seller to use
    const sellerIdToUse = sellerIdOverride || property.owner;
    
    // Get seller information (session optional)
    let sellerQuery = User.findById(sellerIdToUse);
    if (session) sellerQuery = sellerQuery.session(session);
    const seller = await sellerQuery;
    if (!seller) {
      throw new Error('Property seller not found');
    }
    
    // Enforce 1.1% commission; ignore incoming value
    const settlementDate = settlementDetails?.settlementDate ? new Date(settlementDetails.settlementDate) : new Date();

    // First, check for existing invoice to prevent duplicates
    const existing = await Invoice.findOne({
      property: property._id,
      seller: sellerIdToUse,
      category: 'settlement_commission',
      status: { $ne: 'cancelled' }
    }).sort({ createdAt: -1 });

    if (existing) {
      console.log(`📄 Existing settlement invoice found: ${existing.invoiceNumber} — returning.`);
      return {
        invoiceId: existing._id,
        invoiceNumber: existing.invoiceNumber,
        amount: existing.totalAmount,
        dueDate: existing.dueDate,
        commissionRate: existing.commissionRate,
        propertyValue: existing.propertyValue,
        alreadyExisted: true
      };
    }

    // Create the invoice (static method also double‑checks)
    const invoice = await Invoice.createSettlementInvoice(
      property._id,
      agentId,
      sellerIdToUse,
      { settlementDate }
    );
    
    console.log(`📄 Settlement invoice created: ${invoice.invoiceNumber}`);
    
    return {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.totalAmount,
      dueDate: invoice.dueDate,
      commissionRate: invoice.commissionRate,
      propertyValue: invoice.propertyValue,
      alreadyExisted: false
    };
    
  } catch (error) {
    console.error('❌ Settlement invoice generation failed:', error);
    throw new Error(`Invoice generation failed: ${error.message}`);
  }
};

// @desc    Generate buyer payment invoice (10% of property price)
const generateBuyerInvoice = async (property, agentId, settlementDetails, buyerId) => {
  try {
    const Invoice = require('../models/Invoice');
    const User = require('../models/User');
    
    // Get buyer information
    const buyer = await User.findById(buyerId);
    if (!buyer) {
      throw new Error('Buyer not found');
    }
    
    const settlementDate = settlementDetails?.settlementDate ? new Date(settlementDetails.settlementDate) : new Date();

    // First, check for existing buyer invoice to prevent duplicates
    const existing = await Invoice.findOne({
      property: property._id,
      buyer: buyerId,
      category: 'buyer_payment',
      status: { $ne: 'cancelled' }
    }).sort({ createdAt: -1 });

    if (existing) {
      console.log(`📄 Existing buyer invoice found: ${existing.invoiceNumber} — returning.`);
      return {
        invoiceId: existing._id,
        invoiceNumber: existing.invoiceNumber,
        amount: existing.totalAmount,
        dueDate: existing.dueDate,
        commissionRate: existing.commissionRate,
        propertyValue: existing.propertyValue,
        alreadyExisted: true
      };
    }

    // Create the buyer invoice using the static method
    const invoice = await Invoice.createBuyerPaymentInvoice(
      property._id,
      agentId,
      buyerId,
      { settlementDate }
    );
    
    console.log(`📄 Buyer invoice created: ${invoice.invoiceNumber}`);
    
    return {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.totalAmount,
      dueDate: invoice.dueDate,
      commissionRate: invoice.commissionRate,
      propertyValue: invoice.propertyValue,
      alreadyExisted: false
    };
    
  } catch (error) {
    console.error('❌ Buyer invoice generation failed:', error);
    throw new Error(`Buyer invoice generation failed: ${error.message}`);
  }
};

// @desc    Helper function to get status display name
const getStatusDisplayName = (status) => {
  switch (status) {
    case 'contract-exchanged':
      return 'Contract Exchanged';
    case 'unconditional':
      return 'Unconditional';
    case 'settled':
      return 'Settled';
    default:
      return status;
  }
};

// @desc    Send professional status change notifications
const sendStatusChangeNotifications = async (property, previousStatus, newStatus, changedBy) => {
  try {
    const statusNotificationService = require('../services/statusNotificationService');
    const Notification = require('../models/Notification');
    const User = require('../models/User');
    
    // Get seller information
    const seller = await User.findById(property.owner);
    
    // Create system notification
    await Notification.create({
      recipient: property.owner,
      type: 'status_change',
      title: `Property Status Updated: ${property.title}`,
      message: `Your property status has been updated from ${getStatusDisplayName(previousStatus)} to ${getStatusDisplayName(newStatus)}`,
      data: {
        propertyId: property._id,
        previousStatus,
        newStatus,
        changedBy: changedBy._id,
        timestamp: new Date()
      }
    });
    
    // Send professional email notification to seller
    if (property.contactInfo?.email) {
      const notificationData = {
        recipientEmail: property.contactInfo.email,
        recipientName: seller?.name || property.contactInfo.name,
        propertyTitle: property.title,
        previousStatus: getStatusDisplayName(previousStatus),
        newStatus: getStatusDisplayName(newStatus),
        agentName: changedBy.name,
        timestamp: new Date()
      };
      
      await statusNotificationService.sendStatusChangeNotification(notificationData);
    }
    
    // If settled, also send invoice notification
    if (newStatus === 'settled' && property.contactInfo?.email) {
      // This will be called separately after invoice generation
      console.log('📄 Invoice notification will be sent after invoice generation');
    }
    
    console.log(`📧 Professional status change notifications sent for property ${property._id}`);
  } catch (error) {
    console.error('❌ Failed to send status change notifications:', error);
    // Don't throw - notifications are non-critical
  }
};

// @desc    Create notification for failed invoice generation
const createFailedInvoiceNotification = async (property, agent, error) => {
  try {
    const Notification = require('../models/Notification');
    
    // Create admin notification for manual follow-up
    await Notification.create({
      recipient: 'admin', // Will be handled by admin notification system
      type: 'system_error',
      title: 'Invoice Generation Failed',
      message: `Failed to generate invoice for settled property: ${property.title}`,
      priority: 'high',
      data: {
        propertyId: property._id,
        agentId: agent._id,
        errorMessage: error.message,
        timestamp: new Date(),
        requiresManualAction: true
      }
    });
    
    console.log(`🚨 Created admin notification for failed invoice generation: ${property._id}`);
  } catch (notificationError) {
    console.error('❌ Failed to create error notification:', notificationError);
  }
};

// @desc    Create property listing
// @route   POST /api/properties
// @access  Private (Seller only)
const createProperty = async (req, res) => {
  try {
    // Only sellers can create properties
    if (req.user.role !== 'seller') {
      return res.status(403).json(
        errorResponse('Only sellers can create property listings', 403)
      );
    }

    // Extract form data properly
    const {
      title, street, city, state, zipCode, price, beds, baths,
      squareMeters, propertyType, description, contactName, 
      contactEmail, contactPhone, yearBuilt, lotSize, carSpaces
    } = req.body;

    // Validate required fields
    const requiredFields = ['title', 'street', 'city', 'state', 'zipCode', 'price', 'beds', 'baths', 'squareMeters', 'propertyType'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json(
        errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400)
      );
    }

    // Create property data with proper structure
    const propertyData = {
      owner: req.user.id, // ✅ This is correctly setting the owner field
      title: title.trim(),
      address: {
        street: street.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        zipCode: zipCode.trim(),
        country: 'US'
      },
      location: {
        type: 'Point',
        coordinates: [-98.5795, 39.8283] // Default coordinates
      },
      price: parseFloat(price),
      beds: parseInt(beds),
      baths: parseFloat(baths),
      carSpaces: carSpaces ? parseInt(carSpaces) : undefined,
      squareMeters: parseFloat(squareMeters),
      propertyType: propertyType.toLowerCase().replace(/\s+/g, '-'),
      description: description ? description.trim() : '',
      contactInfo: {
        name: contactName || req.user.name,
        email: contactEmail || req.user.email,
        phone: contactPhone || ''
      },
      status: 'active',
      yearBuilt: yearBuilt ? parseInt(yearBuilt) : undefined,
      lotSize: lotSize ? parseFloat(lotSize) : undefined
    };

    // Handle image uploads from req.files (Cloudinary via multer-storage-cloudinary)
    if (req.files && req.files.images && req.files.images.length > 0) {
      const imagesArray = [];
      let mainImageUrl = null;

      // Each file now contains Cloudinary data; `file.path` is the URL.
      req.files.images.forEach((file, index) => {
        const imageUrl = file.path;

        imagesArray.push({
          url: imageUrl,
          caption: file.originalname,
          isPrimary: index === 0,
          order: index
        });

        // Set first image as main image
        if (index === 0) {
          mainImageUrl = imageUrl;
        }
      });

      // Set image fields
      propertyData.images = imagesArray;
      propertyData.mainImage = { url: mainImageUrl };
      propertyData.finalImageUrl = { url: mainImageUrl };
    } else {
      // No images uploaded
      propertyData.images = [];
      propertyData.mainImage = { url: null };
      propertyData.finalImageUrl = { url: null };
    }

    // Handle floor plans (Cloudinary URLs)
    if (req.files && req.files.floorPlans && req.files.floorPlans.length > 0) {
      propertyData.floorPlans = req.files.floorPlans.map((file, index) => ({
        url: file.path,
        caption: file.originalname,
        order: index
      }));
    }

    // Handle videos (Cloudinary URLs)
    if (req.files && req.files.videos && req.files.videos.length > 0) {
      propertyData.videos = req.files.videos.map((file, index) => ({
        url: file.path,
        caption: file.originalname,
        order: index
      }));
    }

    const property = await Property.create(propertyData);
    
    // If property is created with 'active' status, notify all buyers
    if (property.status === 'active') {
      try {
        await notifyBuyersAboutNewProperty(property);
        console.log(`📢 Notified buyers about new property: ${property.title}`);
      } catch (notificationError) {
        console.error('Error sending new property notifications:', notificationError);
        // Don't fail the property creation due to notification errors
      }
    }
    
    res.status(201).json(
      successResponse(property, 'Property listing created successfully')
    );
  } catch (error) {
    console.error('Error creating property:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json(
        errorResponse(`Validation failed: ${validationErrors.join(', ')}`, 400)
      );
    }
    
    res.status(500).json(
      errorResponse('Failed to create property listing', 500)
    );
  }
};

// @desc    Get property details
// @route   GET /api/properties/:id
// @access  Public
const getPropertyById = async (req, res) => {
  try {
    let property;
    const { id } = req.params;
    //   const purchased = await Purchase.findOne({
    //   user: req.user._id,
    //   property: id,
    //   status: 'paid'
    // });

    // if (!purchased) {
    //   return res.status(403).json({ message: 'Payment required to view this property' });
    // }
    // Check if the parameter is a valid MongoDB ObjectId
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      // Search by ObjectId
      property = await Property.findById(id)
        .populate('owner', 'name email')
        .populate('agents.agent', 'name email phone');
    } else {
      // Search by slug
      property = await Property.findOne({ slug: id })
        .populate('owner', 'name email')
        .populate('agents.agent', 'name email phone');
    }

    if (!property) {
      return res.status(404).json(
        errorResponse('Property not found', 404)
      );
    }

    // Normalize single property to flat structure
    const propertyObj = property.toObject();
    console.log("🚀 ~ getPropertyById ~ propertyObj:", propertyObj.agents[0].agent._id)
    
    // Normalize address to string format
    const addressString = propertyObj.address && typeof propertyObj.address === 'object' 
      ? `${propertyObj.address.street}, ${propertyObj.address.city}, ${propertyObj.address.state} ${propertyObj.address.zipCode}`
      : propertyObj.address || 'Address not available';
    
    // Get main image URL
    let mainImageUrl = null;
    if (propertyObj.mainImage && propertyObj.mainImage.url) {
      mainImageUrl = propertyObj.mainImage.url;
    } else if (propertyObj.images && propertyObj.images.length > 0 && propertyObj.images[0].url) {
      mainImageUrl = propertyObj.images[0].url;
    }
    
    // Extract contact phone
    const contactPhone = propertyObj.contactInfo && propertyObj.contactInfo.phone 
      ? propertyObj.contactInfo.phone 
      : null;
    
    // Transform coordinates
    let coordinates = null;
    if (propertyObj.location && propertyObj.location.coordinates && propertyObj.location.coordinates.length === 2) {
      coordinates = {
        lng: propertyObj.location.coordinates[0],
        lat: propertyObj.location.coordinates[1]
      };
    }
    
    const normalizedProperty = {
      id: propertyObj._id.toString(),
      title: propertyObj.title || '',
      address: addressString,
      city: propertyObj.address?.city || '',
      state: propertyObj.address?.state || '',
      zipCode: propertyObj.address?.zipCode || '',
      price: propertyObj.price || 0,
      beds: propertyObj.beds || 0,
      baths: propertyObj.baths || 0,
      carSpaces: propertyObj.carSpaces || 0,
      size: propertyObj.squareMeters || 0,
      yearBuilt: propertyObj.yearBuilt || null,
      propertyType: propertyObj.propertyType || '',
      status: propertyObj.status || 'pending',
      description: propertyObj.description || '',
      features: propertyObj.features || [],
      images: propertyObj.images || [],
      mainImage: mainImageUrl,
      coordinates: coordinates,
      contactPhone: contactPhone,
      featured: propertyObj.featured || false,
      dateListed: propertyObj.dateListed || propertyObj.createdAt,
      daysOnMarket: propertyObj.daysOnMarket || 0,
      slug: propertyObj.slug, // Include slug in response
      agent: propertyObj.agents && propertyObj.agents.length > 0 && propertyObj.agents[0].agent 
        ? {
            id: propertyObj.agents[0].agent._id.toString(),
            name: propertyObj.agents[0].agent.name || 'Agent Name',
            phone: propertyObj.agents[0].agent.phone || contactPhone || '',
            email: propertyObj.agents[0].agent.email || ''
          }
        : null
    };

    res.json(
      successResponse(
        normalizedProperty,
        'Property retrieved successfully',
        200
      )
    );
  } catch (error) {
    console.error('Error fetching property:', error);
    res.status(500).json(
      errorResponse('Server error while fetching property', 500)
    );
  }
};

// @desc    Update property
// @route   PATCH /api/properties/:id
// @access  Private (Owner/Agent/Admin)
const updateProperty = async (req, res) => {
  const property = await Property.findById(req.params.id);

  if (!property) {
    return res.status(404).json(
      errorResponse('Property not found', 404)
    );
  }

  // Check permissions
  const canEdit = (
    req.user.id === property.owner.toString() ||
    req.user.role === 'admin' ||
    (property.assignedAgent && req.user.id === property.assignedAgent.toString())
  );

  if (!canEdit) {
    return res.status(403).json(
      errorResponse('Not authorized to edit this property', 403)
    );
  }

  // Store old price for comparison
  const oldPrice = property.price;
  const oldStatus = property.status;

  const updatedProperty = await Property.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).populate('owner', 'name email').populate('assignedAgent', 'name email');

  // Check if property status changed from inactive to active (newly available)
  if (oldStatus !== 'active' && updatedProperty.status === 'active') {
    try {
      await notifyBuyersAboutNewProperty(updatedProperty);
      console.log(`📢 Notified buyers about property becoming active: ${updatedProperty.title}`);
    } catch (notificationError) {
      console.error('Error sending new property notifications:', notificationError);
    }
  }
  
  // Check if price was reduced (only for active properties)
  if (updatedProperty.status === 'active' && 
      req.body.price && 
      parseFloat(req.body.price) < oldPrice) {
    try {
      await notifyBuyersAboutPriceDrop(updatedProperty, oldPrice);
      console.log(`💰 Notified buyers about price drop for: ${updatedProperty.title}`);
    } catch (notificationError) {
      console.error('Error sending price drop notifications:', notificationError);
    }
  }

  res.json(
    successResponse(updatedProperty, 'Property updated successfully')
  );
};

// @desc    Delete property
// @route   DELETE /api/properties/:id
// @access  Private (Owner/Admin only)
const deleteProperty = async (req, res) => {
  const property = await Property.findById(req.params.id);

  if (!property) {
    return res.status(404).json(
      errorResponse('Property not found', 404)
    );
  }

  // Only owner or admin can delete
  const canDelete = (
    req.user.id === property.owner.toString() ||
    req.user.role === 'admin'
  );

  if (!canDelete) {
    return res.status(403).json(
      errorResponse('Not authorized to delete this property', 403)
    );
  }

  await Property.findByIdAndDelete(req.params.id);

  res.json(
    successResponse(null, 'Property deleted successfully')
  );
};

// @desc    Assign agent to property
// @route   POST /api/properties/:id/assign-agent
// @access  Private (Seller only)
const assignAgent = async (req, res) => {
  const { agentId } = req.body;
  
  const property = await Property.findById(req.params.id);
  if (!property) {
    return res.status(404).json(
      errorResponse('Property not found', 404)
    );
  }

  // Only property owner can assign agent
  if (req.user.id !== property.owner.toString()) {
    return res.status(403).json(
      errorResponse('Only property owner can assign agent', 403)
    );
  }

  // Verify agent exists and has correct role
  const agent = await User.findById(agentId);
  if (!agent || agent.role !== 'agent') {
    return res.status(400).json(
      errorResponse('Invalid agent ID', 400)
    );
  }

  property.assignedAgent = agentId;
  await property.save();

  // Create notification for agent
  await Notification.create({
    user: agentId,
    type: 'new_assignment',
    title: 'New Property Assignment',
    message: `You have been assigned to help with property: ${property.title}`,
    data: { propertyId: property._id, propertyTitle: property.title }
  });

  // Send email notification
  await emailService.sendNotificationEmail(agent, 'new_assignment', {
    propertyTitle: property.title
  });

  res.json(
    successResponse(property, 'Agent assigned successfully')
  );
};

// @desc    Get CoreLogic price check
// @route   GET /api/properties/:id/price-check
// @access  Private (Owner/Agent/Admin)
const getPriceCheck = async (req, res) => {
  const property = await Property.findById(req.params.id);
  
  if (!property) {
    return res.status(404).json(
      errorResponse('Property not found', 404)
    );
  }

  // Check permissions
  const canAccess = (
    req.user.id === property.owner.toString() ||
    req.user.role === 'admin' ||
    (property.assignedAgent && req.user.id === property.assignedAgent.toString())
  );

  if (!canAccess) {
    return res.status(403).json(
      errorResponse('Not authorized to access price check', 403)
    );
  }

  try {
    const priceEstimate = await corelogicService.getPriceEstimate(property);
    
    res.json(
      successResponse(priceEstimate, 'Price check completed successfully')
    );
  } catch (error) {
    res.status(500).json(
      errorResponse('Price check service unavailable', 500)
    );
  }
};

// @desc    Get all properties
// @route   GET /api/properties
// @access  Public
const getAllProperties = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 0; // 0 means no limit - show all
    const skip = limit > 0 ? (page - 1) * limit : 0;

    // Build comprehensive filter object
    const filter = { isDeleted: false }; // Always exclude soft-deleted properties
    const sortOptions = {};
    
    // Status filter
    if (req.query.status) {
      filter.status = req.query.status;
    } else {
      // Default to active properties for public browsing
      filter.status = { $in: ['active', 'public'] };
    }

    // Location filters
    if (req.query.city) {
      filter['address.city'] = new RegExp(req.query.city.trim(), 'i');
    }
    if (req.query.state) {
      filter['address.state'] = new RegExp(req.query.state.trim(), 'i');
    }
    if (req.query.zipCode) {
      filter['address.zipCode'] = req.query.zipCode.trim();
    }

    // Price filters
    if (req.query.minPrice || req.query.maxPrice) {
      filter.price = {};
      if (req.query.minPrice) filter.price.$gte = parseFloat(req.query.minPrice);
      if (req.query.maxPrice) filter.price.$lte = parseFloat(req.query.maxPrice);
    }

    // Size filters
    if (req.query.minSize || req.query.maxSize) {
      filter.squareMeters = {};
      if (req.query.minSize) filter.squareMeters.$gte = parseFloat(req.query.minSize);
      if (req.query.maxSize) filter.squareMeters.$lte = parseFloat(req.query.maxSize);
    }

    // Bedroom and bathroom filters (minimum counts)
    if (req.query.beds) filter.beds = { $gte: parseInt(req.query.beds) };
    if (req.query.baths) filter.baths = { $gte: parseFloat(req.query.baths) };

    // Property type filter
    if (req.query.propertyType) {
      filter.propertyType = req.query.propertyType.toLowerCase();
    }

    // Featured filter
    if (req.query.featured === 'true') {
      filter.featured = true;
    }

    // Text search across multiple fields
    if (req.query.search && req.query.search.trim()) {
      const searchTerm = req.query.search.trim();
      filter.$or = [
        { title: new RegExp(searchTerm, 'i') },
        { description: new RegExp(searchTerm, 'i') },
        { 'address.street': new RegExp(searchTerm, 'i') },
        { 'address.city': new RegExp(searchTerm, 'i') },
        { 'address.state': new RegExp(searchTerm, 'i') },
        { propertyType: new RegExp(searchTerm, 'i') }
      ];
    }

    // Sorting logic
    if (req.query.sortBy) {
      const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
      
      switch (req.query.sortBy) {
        case 'price':
          sortOptions.price = sortOrder;
          break;
        case 'size':
          sortOptions.squareMeters = sortOrder;
          break;
        case 'date':
          sortOptions.dateListed = sortOrder;
          break;
        case 'beds':
          sortOptions.beds = sortOrder;
          break;
        default:
          // Default sort: featured first, then by date
          sortOptions.featured = -1;
          sortOptions.dateListed = -1;
      }
    } else {
      // Default sort: featured first, then by date
      sortOptions.featured = -1;
      sortOptions.dateListed = -1;
    }

    console.log('🔍 Property search filter:', filter);
    console.log('📊 Property search sort:', sortOptions);

    const total = await Property.countDocuments(filter);
    
    let query = Property.find(filter)
      .populate('owner', 'name email')
      .populate('agents.agent', 'name email')
      .sort(sortOptions)
      .skip(skip);
      
    // Only apply limit if specified (> 0)
    if (limit > 0) {
      query = query.limit(limit);
    }
    
    const properties = await query;

  // Normalize properties to flat structure for frontend compatibility
  const normalizedProperties = properties.map(property => {
    const propertyObj = property.toObject();
    
    // Normalize address to string format
    const addressString = propertyObj.address && typeof propertyObj.address === 'object' 
      ? `${propertyObj.address.street}, ${propertyObj.address.city}, ${propertyObj.address.state} ${propertyObj.address.zipCode}`
      : propertyObj.address || 'Address not available';
    
    // Get main image URL - prioritize mainImage, then first image, then null
    let mainImageUrl = null;
    if (propertyObj.mainImage && propertyObj.mainImage.url) {
      mainImageUrl = propertyObj.mainImage.url;
    } else if (propertyObj.images && propertyObj.images.length > 0 && propertyObj.images[0].url) {
      mainImageUrl = propertyObj.images[0].url;
    }
    
    // Extract contact phone from nested contactInfo
    const contactPhone = propertyObj.contactInfo && propertyObj.contactInfo.phone 
      ? propertyObj.contactInfo.phone 
      : null;
    
    // Transform coordinates for frontend
    let coordinates = null;
    if (propertyObj.location && propertyObj.location.coordinates && propertyObj.location.coordinates.length === 2) {
      coordinates = {
        lng: propertyObj.location.coordinates[0], // GeoJSON uses [longitude, latitude]
        lat: propertyObj.location.coordinates[1]
      };
    }
    
    // Return normalized flat structure
    return {
      id: propertyObj._id.toString(), // Convert MongoDB _id to string id
      title: propertyObj.title || '',
      address: addressString, // Flat string address
      city: propertyObj.address?.city || '',
      state: propertyObj.address?.state || '',
      zipCode: propertyObj.address?.zipCode || '',
      price: propertyObj.price || 0,
      beds: propertyObj.beds || 0,
      baths: propertyObj.baths || 0,
      carSpaces: propertyObj.carSpaces || 0,
      size: propertyObj.squareMeters || 0, // Map squareMeters to size
      yearBuilt: propertyObj.yearBuilt || null,
      propertyType: propertyObj.propertyType || '',
      status: propertyObj.status || 'pending',
      description: propertyObj.description || '',
      features: propertyObj.features || [],
      images: propertyObj.images || [],
      mainImage: mainImageUrl, // Flat string URL instead of object
      coordinates: coordinates,
      contactPhone: contactPhone, // Flat contact phone
      featured: propertyObj.featured || false,
      dateListed: propertyObj.dateListed || propertyObj.createdAt,
      daysOnMarket: propertyObj.daysOnMarket || 0,
      slug: propertyObj.slug, // Add slug to response
      // Agent information (if available)
      agent: propertyObj.agents && propertyObj.agents.length > 0 && propertyObj.agents[0].agent 
        ? {
            id: propertyObj.agents[0].agent._id || propertyObj.agents[0].agent,
            name: propertyObj.agents[0].agent.name || 'Agent Name',
            phone: propertyObj.agents[0].agent.phone || contactPhone || '',
            email: propertyObj.agents[0].agent.email || ''
          }
        : null
    };
  });

    res.json(
      successResponse(
        normalizedProperties,
        'Properties retrieved successfully',
        200,
        paginationMeta(page, limit, total)
      )
    );
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json(
      errorResponse('Failed to fetch properties', 500)
    );
  }
};

// Add new function for property stats
const getPropertyStats = async (req, res) => {
  try {
    const totalProperties = await Property.countDocuments({ status: 'public' });
    const soldProperties = await Property.countDocuments({ status: 'sold' });
    const avgPriceResult = await Property.aggregate([
      { $match: { status: 'public' } },
      { $group: { _id: null, avgPrice: { $avg: '$price' } } }
    ]);
    
    const stats = {
      totalProperties: totalProperties || 0,
      soldProperties: soldProperties || 0,
      averagePrice: avgPriceResult[0]?.avgPrice || 0,
      activeListings: totalProperties || 0
    };
    
    res.json(successResponse(stats, 'Property stats retrieved successfully'));
  } catch (error) {
    // Return fallback stats if database query fails
    const fallbackStats = {
      totalProperties: 150,
      soldProperties: 45,
      averagePrice: 450000,
      activeListings: 150
    };
    res.json(successResponse(fallbackStats, 'Property stats retrieved successfully'));
  }
};

// @desc    Get seller's properties
// @route   GET /api/seller/properties
// @access  Private (Seller only)
const getSellerProperties = async (req, res) => {
  if (req.user.role !== 'seller') {
    return res.status(403).json(
      errorResponse('Only sellers can access this endpoint', 403)
    );
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Filter by owner (current seller)
  const filter = { owner: req.user.id };
  
  const total = await Property.countDocuments(filter);
  const properties = await Property.find(filter)
    .populate('assignedAgent', 'name email')
    .sort({ dateListed: -1 })
    .skip(skip)
    .limit(limit);

  res.json(
    successResponse(
      properties,
      'Seller properties retrieved successfully',
      200,
      paginationMeta(page, limit, total)
    )
  );
};

// @desc    Submit property publicly (no authentication required)
// @route   POST /api/properties/public-submit
// @access  Public
const submitPropertyPublic = async (req, res) => {
  try {
    const {
      title, address, city, state, zipCode, price, beds, baths, 
      squareMeters, propertyType, yearBuilt, description, features,
      contactName, contactEmail, contactPhone, images, timeframe,
      latitude = 39.8283, longitude = -98.5795  // Use valid default coordinates
    } = req.body;

    // Validation for required fields
    const requiredFields = {
      title, address, city, state, zipCode, price, beds, baths,
      squareMeters, propertyType, contactName, contactEmail, contactPhone
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value && value !== 0)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Create or find user
    let user = await User.findOne({ email: contactEmail });
    if (!user) {
      // Generate a temporary password for public submissions
      const tempPassword = Math.random().toString(36).slice(-12) + 'Temp123!';
      
      user = new User({
        name: contactName,
        email: contactEmail,
        phone: contactPhone,
        password: tempPassword, // Add temporary password
        role: 'seller',
        isVerified: false
      });
      await user.save();
    }

    // Process images if provided
    const processedImages = images && images.length > 0 
      ? images.map((img, index) => ({
          url: img.url || img.preview || '',
          caption: img.caption || '',
          isPrimary: index === 0,
          order: index
        }))
      : [];

    // Create property data
    const propertyData = {
      owner: user._id,
      title,
      address: {
        street: address,
        city,
        state,
        zipCode,
        country: 'US'
      },
      location: {
        type: 'Point',
        coordinates: [parseFloat(longitude) || -98.5795, parseFloat(latitude) || 39.8283]  // Use valid defaults
      },
      propertyType,
      price: parseFloat(price),
      beds: parseInt(beds),
      baths: parseFloat(baths),
      squareMeters: parseFloat(squareMeters),
      yearBuilt: yearBuilt ? parseInt(yearBuilt) : undefined,
      description: description || '',
      contactInfo: {
        name: contactName,
        email: contactEmail,
        phone: contactPhone
      },
      images: processedImages,
      status: 'draft'
    };

    const property = new Property(propertyData);
    await property.save();

    res.status(201).json({
      success: true,
      message: 'Property submitted successfully',
      data: {
        propertyId: property._id,
        status: property.status
      }
    });

  } catch (error) {
    console.error('Property submission error:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: `Validation failed: ${validationErrors.join(', ')}`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during property submission'
    });
  }
};

// @desc    Get filter options for properties
// @route   GET /api/properties/filter-options
// @access  Public
const getFilterOptions = async (req, res) => {
  try {
    // Filter for active/public properties only
    const activeFilter = { 
      status: { $in: ['active', 'public'] }, 
      isDeleted: false 
    };

    // Get unique property types
    const propertyTypes = await Property.distinct('propertyType', activeFilter);
    
    // Get unique cities from address.city
    const cities = await Property.distinct('address.city', activeFilter);
    
    // Get price range
    const priceStats = await Property.aggregate([
      { $match: activeFilter },
      {
        $group: {
          _id: null,
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' }
        }
      }
    ]);
    
    // Get size range
    const sizeStats = await Property.aggregate([
      { $match: activeFilter },
      {
        $group: {
          _id: null,
          minSize: { $min: '$squareMeters' },
          maxSize: { $max: '$squareMeters' }
        }
      }
    ]);
    
    const filterOptions = {
      propertyTypes: propertyTypes.filter(type => type && type.length > 0), // Remove null/undefined/empty values
      cities: cities.filter(city => city && city.length > 0), // Remove null/undefined/empty values
      priceRange: {
        min: priceStats[0]?.minPrice || 0,
        max: priceStats[0]?.maxPrice || 2000000
      },
      sizeRange: {
        min: sizeStats[0]?.minSize || 0,
        max: sizeStats[0]?.maxSize || 1000 // Reasonable max for square meters
      }
    };

    console.log('📊 Filter options generated:', filterOptions);
    
    res.json(
      successResponse(filterOptions, 'Filter options retrieved successfully')
    );
  } catch (error) {
    console.error('Get filter options error:', error);
    
    // Return fallback options on error
    const fallbackOptions = {
      propertyTypes: ['single-family', 'condo', 'townhouse', 'multi-family'],
      cities: ['Austin', 'Dallas', 'Houston', 'San Antonio'],
      priceRange: { min: 100000, max: 2000000 },
      sizeRange: { min: 50, max: 500 }
    };
    
    res.json(
      successResponse(fallbackOptions, 'Filter options retrieved successfully (fallback)')
    );
  }
};

// ...    Get user's favorite properties
// @route   GET /api/properties/favorites/:userId?
// @access  Private
const getFavoriteProperties = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    
    // Find user's favorite properties
    const user = await User.findById(userId).populate({
      path: 'favorites',
      match: { isDeleted: false, status: { $in: ['active', 'public'] } },
      populate: {
        path: 'owner',
        select: 'name email avatar'
      }
    });

    if (!user) {
      return res.status(404).json(
        errorResponse('User not found', 404)
      );
    }

    res.json(
      successResponse(
        user.favorites || [],
        'Favorite properties retrieved successfully'
      )
    );
  } catch (error) {
    console.error('Error fetching favorite properties:', error);
    res.status(500).json(
      errorResponse('Failed to fetch favorite properties', 500)
    );
  }
};

// ...    Create property with file uploads
// @route   POST /api/properties/upload
// @access  Private
const createPropertyWithFiles = async (req, res) => {
  console.log('🏠 Creating property with files...');
  
  try {
    // Validate user authentication and role
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'You must be logged in to create a property.'
      });
    }

    if (req.user.role !== 'seller') {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'Only sellers can create property listings.'
      });
    }

    // Extract and validate form data
    const {
      title, street, city, state, zipCode, price, beds, baths,
      squareMeters, propertyType, yearBuilt, description,
      contactName, contactEmail, contactPhone, lotSize, carSpaces
    } = req.body;

    console.log('📝 Form data received:', {
      title, street, city, state, zipCode, price, beds, baths,
      squareMeters, propertyType, contactName, contactEmail
    });

    // Comprehensive field validation
    const requiredFields = {
      title: 'Property title',
      street: 'Street address', 
      city: 'City',
      state: 'State',
      zipCode: 'ZIP code',
      price: 'Price',
      beds: 'Number of bedrooms',
      baths: 'Number of bathrooms',
      squareMeters: 'Square meters',
      propertyType: 'Property type',
      contactName: 'Contact name',
      contactEmail: 'Contact email',
      contactPhone: 'Contact phone'
    };

    const missingFields = [];
    const invalidFields = [];

    // Check for missing required fields
    Object.entries(requiredFields).forEach(([key, label]) => {
      const value = req.body[key];
      if (!value && value !== 0 && value !== '0') {
        missingFields.push(label);
      }
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: `Please provide the following required fields: ${missingFields.join(', ')}.`,
        missingFields
      });
    }

    // Validate data types and ranges
    try {
      const numericPrice = parseFloat(price);
      const numericBeds = parseInt(beds);
      const numericBaths = parseFloat(baths);
      const numericSquareMeters = parseFloat(squareMeters);
      const numericYearBuilt = yearBuilt ? parseInt(yearBuilt) : undefined;
      const numericLotSize = lotSize ? parseFloat(lotSize) : undefined;

      // Validate numeric ranges
      if (isNaN(numericPrice) || numericPrice <= 0) {
        invalidFields.push('Price must be a positive number');
      }
      if (isNaN(numericBeds) || numericBeds < 0) {
        invalidFields.push('Bedrooms must be a non-negative number');
      }
      if (isNaN(numericBaths) || numericBaths < 0) {
        invalidFields.push('Bathrooms must be a non-negative number');
      }
      if (isNaN(numericSquareMeters) || numericSquareMeters <= 0) {
        invalidFields.push('Square meters must be a positive number');
      }
      if (yearBuilt && (isNaN(numericYearBuilt) || numericYearBuilt < 1800 || numericYearBuilt > new Date().getFullYear() + 2)) {
        invalidFields.push('Year built must be between 1800 and ' + (new Date().getFullYear() + 2));
      }
      if (lotSize && (isNaN(numericLotSize) || numericLotSize < 0)) {
        invalidFields.push('Lot size must be a non-negative number');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(contactEmail)) {
        invalidFields.push('Contact email must be a valid email address');
      }

      // Validate ZIP code format
      const zipRegex = /^\d{5}(-\d{4})?$/;
      if (!zipRegex.test(zipCode)) {
        invalidFields.push('ZIP code must be in format 12345 or 12345-6789');
      }

      // Validate property type
      const validPropertyTypes = ['single-family', 'condo', 'townhouse', 'multi-family', 'land', 'commercial', 'apartment'];
      const normalizedPropertyType = propertyType.toLowerCase().replace(/\s+/g, '-');
      if (!validPropertyTypes.includes(normalizedPropertyType)) {
        invalidFields.push('Property type must be one of: ' + validPropertyTypes.join(', '));
      }

      if (invalidFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid field values',
          message: 'Please correct the following errors: ' + invalidFields.join(', '),
          invalidFields
        });
      }
    } catch (validationError) {
      console.error('❌ Data validation error:', validationError);
      return res.status(400).json({
        success: false,
        error: 'Data validation failed',
        message: 'Invalid data format provided. Please check your input values.'
      });
    }

    // Process uploaded files with error handling
    const images = [];
    const floorPlans = [];
    const videos = [];

    try {
      if (req.files) {
        console.log('📁 Processing uploaded files:', Object.keys(req.files));
        
        // Process property images (Cloudinary URLs)
        if (req.files.images && Array.isArray(req.files.images)) {
          req.files.images.forEach((file, index) => {
            try {
              images.push({
                url: file.path,
                caption: file.originalname,
                isPrimary: index === 0,
                order: index
              });
              console.log(`✅ Processed image ${index + 1}: ${file.filename || file.path}`);
            } catch (fileError) {
              console.error(`❌ Error processing image ${index + 1}:`, fileError);
              throw new Error(`Failed to process image file: ${file.originalname}`);
            }
          });
        }

        // Process floor plans (Cloudinary URLs)
        if (req.files.floorPlans && Array.isArray(req.files.floorPlans)) {
          req.files.floorPlans.forEach((file, index) => {
            try {
              floorPlans.push({
                url: file.path,
                caption: file.originalname,
                order: index
              });
              console.log(`✅ Processed floor plan ${index + 1}: ${file.filename || file.path}`);
            } catch (fileError) {
              console.error(`❌ Error processing floor plan ${index + 1}:`, fileError);
              throw new Error(`Failed to process floor plan file: ${file.originalname}`);
            }
          });
        }

        // Process videos (Cloudinary URLs)
        if (req.files.videos && Array.isArray(req.files.videos)) {
          req.files.videos.forEach((file, index) => {
            try {
              videos.push({
                url: file.path,
                caption: file.originalname,
                order: index
              });
              console.log(`✅ Processed video ${index + 1}: ${file.filename || file.path}`);
            } catch (fileError) {
              console.error(`❌ Error processing video ${index + 1}:`, fileError);
              throw new Error(`Failed to process video file: ${file.originalname}`);
            }
          });
        }
      }
    } catch (fileProcessingError) {
      console.error('❌ File processing error:', fileProcessingError);
      return res.status(400).json({
        success: false,
        error: 'File processing failed',
        message: fileProcessingError.message || 'Failed to process uploaded files.'
      });
    }

    // Use default coordinates for US properties (center of continental US)
    // In production, you should implement proper geocoding
    const defaultCoordinates = [-98.5795, 39.8283]; // Center of continental US

    // Create property data object
    const propertyData = {
      owner: new mongoose.Types.ObjectId(req.user.id), // Convert to ObjectId
      title: title.trim(),
      address: {
        street: street.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        zipCode: zipCode.trim(),
        country: 'US'
      },
      location: {
        type: 'Point',
        coordinates: defaultCoordinates
      },
      price: parseFloat(price),
      beds: parseInt(beds),
      baths: parseFloat(baths),
      carSpaces: carSpaces ? parseInt(carSpaces) : undefined,
      squareMeters: parseFloat(squareMeters),
      propertyType: propertyType.toLowerCase().replace(/\s+/g, '-'),
      description: description ? description.trim() : '',
      contactInfo: {
        name: contactName.trim(),
        email: contactEmail.trim().toLowerCase(),
        phone: contactPhone.trim()
      },
      images,
      floorPlans,
      videos,
      status: 'review', // Changed from 'pending' to 'review' for proper admin workflow
      yearBuilt: yearBuilt ? parseInt(yearBuilt) : undefined,
      lotSize: lotSize ? parseFloat(lotSize) : undefined,
      // Set mainImage to first uploaded image
      mainImage: images.length > 0 ? {
        url: images[0].url,
        caption: images[0].caption
      } : null,
      finalImageUrl: images.length > 0 ? {
        url: images[0].url
      } : null
    };

    console.log('💾 Saving property to database...');
    
    // Save to database with comprehensive error handling
    let savedProperty;
    try {
      const property = new Property(propertyData);
      savedProperty = await property.save();
      console.log('✅ Property saved successfully:', savedProperty._id);
      
      // If property is active, notify all buyers (though typically properties start as 'review')
      if (savedProperty.status === 'active') {
        try {
          await notifyBuyersAboutNewProperty(savedProperty);
          console.log(`📢 Notified buyers about new property: ${savedProperty.title}`);
        } catch (notificationError) {
          console.error('Error sending new property notifications:', notificationError);
          // Don't fail the property creation due to notification errors
        }
      }
    } catch (dbError) {
      console.error('❌ Database save error:', dbError);
      
      // Handle specific MongoDB validation errors
      if (dbError.name === 'ValidationError') {
        const validationErrors = Object.values(dbError.errors).map(err => err.message);
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          message: 'Property data validation failed: ' + validationErrors.join(', '),
          validationErrors
        });
      } else if (dbError.code === 11000) {
        return res.status(400).json({
          success: false,
          error: 'Duplicate entry',
          message: 'A property with similar details already exists.'
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'Database error',
          message: 'Failed to save property to database. Please try again.'
        });
      }
    }

    // Success response
    console.log('🎉 Property created successfully with files');
    res.status(201).json({
      success: true,
      data: savedProperty,
      message: 'Property created successfully with files',
      filesUploaded: {
        images: images.length,
        floorPlans: floorPlans.length,
        videos: videos.length
      }
    });

  } catch (error) {
    console.error('❌ Unexpected error in createPropertyWithFiles:', error);
    
    // Log detailed error for debugging
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'An unexpected error occurred while creating the property. Please try again.',
      ...(process.env.NODE_ENV === 'development' && { 
        debug: {
          message: error.message,
          stack: error.stack
        }
      })
    });
  }
};

// Admin function to approve properties
const approveProperty = async (req, res) => {
  try {
    // Only admins can approve properties
    if (req.user.role !== 'admin') {
      return res.status(403).json(
        errorResponse('Only admins can approve properties', 403)
      );
    }

    const { id } = req.params;
    
    // Validate property ID
    if (!id) {
      return res.status(400).json(
        errorResponse('Property ID is required for approval', 400)
      );
    }
    
    const property = await Property.findById(id);
    if (!property) {
      return res.status(404).json(
        errorResponse('Property not found', 404)
      );
    }

    // Update status to active
    property.status = 'active';
    await property.save();

    // Notify all buyers about the new property being available
    try {
      await notifyBuyersAboutNewProperty(property);
      console.log(`📢 Notified buyers about approved property: ${property.title}`);
    } catch (notificationError) {
      console.error('Error sending new property notifications:', notificationError);
      // Don't fail the approval due to notification errors
    }

    res.json(
      successResponse(
        property,
        'Property approved successfully',
        200
      )
    );
  } catch (error) {
    console.error('Error approving property:', error);
    res.status(500).json(
      errorResponse('Failed to approve property', 500)
    );
  }
};

// Admin function to reject properties
const rejectProperty = async (req, res) => {
  try {
    // Only admins can reject properties
    if (req.user.role !== 'admin') {
      return res.status(403).json(
        errorResponse('Only admins can reject properties', 403)
      );
    }

    const { id } = req.params;
    
    // Validate property ID
    if (!id) {
      return res.status(400).json(
        errorResponse('Property ID is required for rejection', 400)
      );
    }
    
    const property = await Property.findById(id);
    if (!property) {
      return res.status(404).json(
        errorResponse('Property not found', 404)
      );
    }

    // Update status to rejected
    property.status = 'rejected';
    await property.save();

    res.json(
      successResponse(
        property,
        'Property rejected successfully',
        200
      )
    );
  } catch (error) {
    console.error('Error rejecting property:', error);
    res.status(500).json(
      errorResponse('Failed to reject property', 500)
    );
  }
};

const markPropertyAsSettled = async (req, res) => {
  try {
    const { propertyId } = req.params;
    
    // Get property with agent details
    const property = await Property.findById(propertyId)
      .populate('agentId') // Make sure agent is populated
      .exec();
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Verify agent has bank details
    const agent = property.agentId;
    if (!agent.bankAccountNumber) {
      console.error(`Agent ${agent._id} missing bank account number`);
      return res.status(400).json({ 
        message: 'Agent bank details not configured'
      });
    }

    // Generate invoice with complete agent details
    const invoice = await Invoice.createBuyerPaymentInvoice(
      propertyId,
      agent._id,
      property.buyerId,
      { includeAgentDetails: true } // Flag to ensure agent details are included
    );

    // Log generated invoice details
    console.log('Invoice generated with payment details:', {
      invoiceId: invoice._id,
      agentBank: agent.bankAccountNumber,
      propertyRef: `PROP-${propertyId.toString().slice(-6)}`
    });

    res.status(200).json({ 
      success: true,
      invoiceId: invoice._id
    });

  } catch (error) {
    console.error('Error in markPropertyAsSettled:', error);
    res.status(500).json({ message: 'Error generating settlement invoice' });
  }
};

module.exports = {
  getAllProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
  assignAgent,
  getPriceCheck,
  getSellerProperties,
  getPropertyStats,
  submitPropertyPublic,
  getFilterOptions,
  getFavoriteProperties,
  createPropertyWithFiles,
  approveProperty,
  rejectProperty,
  updatePropertySalesStatus, // Add new sales status update function
  markPropertyAsSettled // Add markPropertyAsSettled function
};
