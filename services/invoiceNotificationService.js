const BuyerNotification = require('../models/BuyerNotification');
const User = require('../models/User');
const Agent = require('../models/Agent');

class InvoiceNotificationService {
  /**
   * Send real-time notification to seller about invoice generation
   * Also persists a BuyerNotification so the Seller Dashboard panel can display it
   */
  static async sendInvoiceGeneratedNotification(invoice, property, io = null) {
    try {
      console.log(`📧 Sending invoice notification for property: ${property.title}`);

      // Get buyer information (fixed: was checking seller)
      const buyer = await User.findById(property.buyerId);
      if (!buyer) {
        throw new Error(`Buyer not found for property ${property._id}`);
      }

      // Get agent details for trust account
      const agent = await Agent.findById(property.agentId);
      if (!agent) {
        throw new Error(`Agent not found for property ${property._id}`);
      }

      // Validate and calculate deposit amount
      if (typeof property.price !== 'number' || isNaN(property.price)) {
        throw new Error(`Invalid property price for ${property._id}`);
      }
      const depositAmount = Number((property.price * 0.10).toFixed(2));

      // Create BuyerNotification record with complete details
      const notification = await BuyerNotification.create({
        userId: property.buyerId, // Fixed: now references buyer
        type: 'system_alert',
        title: 'Settlement Invoice Generated',
        message: `Property settlement invoice generated for ${property.title}. Required deposit: A$${depositAmount.toLocaleString('en-AU')} (10%).`,
        data: {
          propertyId: property._id,
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          amount: depositAmount,
          currency: 'AUD',
          dueDate: invoice.dueDate,
          bankAccountNumber: agent.bankAccountNumber,
          deposit: {
            percentage: 10,
            expectedAmount: depositAmount,
            handler: 'agent_trust_account',
            currency: 'AUD'
          },
          agent: {
            id: agent._id,
            name: agent.name,
            licenseNumber: agent.licenseNumber,
            bankAccount: {
              number: agent.bankAccountNumber,
              name: agent.name,
              reference: `PROP-${property._id.toString().slice(-6)}`
            }
          },
          actionUrl: `/dashboards/buyer/invoices/${invoice._id}`,
          metadata: { 
            kind: 'invoice_generated',
            propertyTitle: property.title,
            propertyAddress: property.address
          }
        },
        priority: 'high',
        status: 'unread',
        channels: { inApp: true, email: { sent: false }, push: { sent: false } }
      });

      console.log(`✅ Invoice notification created: ${notification._id}`);

      // Send real-time notification to buyer (fixed: was targeting seller)
      if (io) {
        io.to(`user_${buyer._id}`).emit('new-notification', {
          type: 'invoice_generated',
          notification: {
            id: notification._id,
            title: notification.title,
            message: notification.message,
            data: notification.data
          }
        });
        console.log(`🔔 Real-time notification sent to buyer ${buyer._id}`);
      }

      // Send email notification
      await this.sendInvoiceEmailNotification(invoice, property, buyer, agent);

      return {
        success: true,
        notificationId: notification._id,
        message: 'Invoice notification sent successfully to buyer'
      };

    } catch (error) {
      console.error('❌ Failed to send invoice notification:', error);
      throw error;
    }
  }

  /**
   * Send email notification about invoice generation
   * @param {Object} invoice - Generated invoice object
   * @param {Object} property - Property object
   * @param {Object} buyer - Buyer user object
   * @param {Object} agent - Agent object
   */
  static async sendInvoiceEmailNotification(invoice, property, buyer, agent) {
    try {
      // Log email content for now
      console.log(`
        📧 Invoice Email Content
        To: ${buyer.email}
        Subject: Settlement Invoice Generated - ${property.title}
        
        Property: ${property.title}
        Address: ${property.address}
        Deposit Amount: A$${invoice.totalAmount.toLocaleString('en-AU')}
        
        Payment Details:
        Account Name: ${agent.name}
        Account Number: ${agent.bankAccountNumber}
        Reference: PROP-${property._id.toString().slice(-6)}
        
        Due Date: ${invoice.dueDate}
      `);
    } catch (error) {
      console.error('Failed to send invoice email:', error);
      throw error;
    }
  }

  /**
   * Get seller invoices for dashboard display
   * @param {String} sellerId - Seller's user ID
   * @param {Object} filters - Optional filters (status, dateRange, etc.)
   */
  static async getSellerInvoices(sellerId, filters = {}) {
    try {
      const Invoice = require('../models/Invoice');
      
      const query = { seller: sellerId };
      
      if (filters.status) {
        query.status = filters.status;
      }
      
      if (filters.fromDate) {
        query.createdAt = { $gte: new Date(filters.fromDate) };
      }
      
      if (filters.toDate) {
        query.createdAt = { ...query.createdAt, $lte: new Date(filters.toDate) };
      }

      const invoices = await Invoice.find(query)
        .populate('property', 'title address price')
        .populate('agent', 'name email phone')
        .sort({ createdAt: -1 });

      return invoices;
    } catch (error) {
      console.error('❌ Failed to get seller invoices:', error);
      throw error;
    }
  }
}

module.exports = InvoiceNotificationService;