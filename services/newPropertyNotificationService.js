const User = require('../models/User');
const BuyerNotification = require('../models/BuyerNotification');
const { createNotification } = require('../controllers/notificationController');

/**
 * Service to send notifications to all buyers when a new property is added to browse page
 */
class NewPropertyNotificationService {
  /**
   * Notify all active buyers about a new property
   * @param {Object} property - The property object that was added
   */
  async notifyBuyersAboutNewProperty(property) {
    try {
      console.log(`📢 Sending new property notifications for: ${property.title}`);
      
      // Get all active buyer users
      const buyers = await User.find({ 
        role: 'buyer', 
        isActive: { $ne: false },
        isDeleted: { $ne: true }
      }).select('_id name email');

      console.log(`👥 Found ${buyers.length} buyers to notify`);

      if (buyers.length === 0) {
        console.log('No buyers found to notify');
        return;
      }

      // Create notifications for each buyer
      const notificationPromises = buyers.map(async (buyer) => {
        try {
          const notificationData = {
            userId: buyer._id,
            type: 'new_property',
            title: 'New Property Available!',
            message: `A new property "${property.title}" has been added to the browse page. Check it out now!`,
            data: {
              propertyId: property._id,
              actionUrl: `/property/${property._id}`,
              metadata: {
                propertyTitle: property.title,
                propertyPrice: property.price,
                propertyAddress: this.formatPropertyAddress(property.address),
                propertyType: property.propertyType
              }
            },
            priority: 'medium',
            status: 'unread',
            channels: {
              inApp: true,
              email: false, // Set to true if you want email notifications
              push: false   // Set to true if you want push notifications
            }
          };

          // Create the notification using BuyerNotification model
          const notification = new BuyerNotification(notificationData);
          await notification.save();
          
          console.log(`✅ Notification sent to buyer: ${buyer.name} (${buyer.email})`);
          return notification;
        } catch (error) {
          console.error(`❌ Error sending notification to buyer ${buyer.name}:`, error);
          return null;
        }
      });

      // Wait for all notifications to be sent
      const results = await Promise.all(notificationPromises);
      const successCount = results.filter(result => result !== null).length;
      
      console.log(`📊 Notification Summary: ${successCount}/${buyers.length} notifications sent successfully`);
      
      return {
        success: true,
        totalBuyers: buyers.length,
        notificationsSent: successCount,
        property: {
          id: property._id,
          title: property.title,
          price: property.price
        }
      };
    } catch (error) {
      console.error('❌ Error in notifyBuyersAboutNewProperty:', error);
      throw error;
    }
  }

  /**
   * Format property address for notification display
   * @param {Object} address - Property address object
   * @returns {String} Formatted address string
   */
  formatPropertyAddress(address) {
    if (!address) return 'Address not available';
    
    if (typeof address === 'string') return address;
    
    const parts = [];
    if (address.street) parts.push(address.street);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.zipCode) parts.push(address.zipCode);
    
    return parts.join(', ') || 'Address not available';
  }

  /**
   * Notify buyers when a property price drops
   * @param {Object} property - The property with updated price
   * @param {Number} oldPrice - The previous price
   */
  async notifyBuyersAboutPriceDrop(property, oldPrice) {
    try {
      console.log(`💰 Sending price drop notifications for: ${property.title}`);
      
      // Get all active buyer users
      const buyers = await User.find({ 
        role: 'buyer', 
        isActive: { $ne: false },
        isDeleted: { $ne: true }
      }).select('_id name email');

      if (buyers.length === 0) {
        console.log('No buyers found to notify about price drop');
        return;
      }

      const priceReduction = oldPrice - property.price;
      const percentageReduction = ((priceReduction / oldPrice) * 100).toFixed(1);

      // Create notifications for each buyer
      const notificationPromises = buyers.map(async (buyer) => {
        try {
          const notificationData = {
            userId: buyer._id,
            type: 'price_drop',
            title: 'Price Drop Alert!',
            message: `Great news! The price of "${property.title}" has dropped by $${priceReduction.toLocaleString()} (${percentageReduction}%)!`,
            data: {
              propertyId: property._id,
              actionUrl: `/property/${property._id}`,
              metadata: {
                propertyTitle: property.title,
                newPrice: property.price,
                oldPrice: oldPrice,
                priceReduction: priceReduction,
                percentageReduction: percentageReduction,
                propertyAddress: this.formatPropertyAddress(property.address)
              }
            },
            priority: 'high',
            status: 'unread',
            channels: {
              inApp: true,
              email: false,
              push: false
            }
          };

          const notification = new BuyerNotification(notificationData);
          await notification.save();
          
          console.log(`✅ Price drop notification sent to buyer: ${buyer.name}`);
          return notification;
        } catch (error) {
          console.error(`❌ Error sending price drop notification to buyer ${buyer.name}:`, error);
          return null;
        }
      });

      await Promise.all(notificationPromises);
      console.log(`📊 Price drop notifications sent to ${buyers.length} buyers`);
      
    } catch (error) {
      console.error('❌ Error in notifyBuyersAboutPriceDrop:', error);
      throw error;
    }
  }
}

module.exports = new NewPropertyNotificationService();