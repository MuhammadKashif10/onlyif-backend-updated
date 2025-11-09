const nodemailer = require('nodemailer');
const emailService = require('./emailService');

// Professional email templates for status changes
const getStatusChangeTemplate = (data) => {
  const { propertyTitle, previousStatus, newStatus, agentName, timestamp, recipientName } = data;
  
  const getStatusDisplayName = (status) => {
    switch (status) {
      case 'contract-exchanged': return 'Contract Exchanged';
      case 'unconditional': return 'Unconditional';
      case 'settled': return 'Settled';
      default: return status || 'No Status';
    }
  };

  const getStatusDescription = (status) => {
    switch (status) {
      case 'contract-exchanged':
        return 'The contracts have been exchanged between the buyer and seller. The sale is now legally binding and both parties are committed to the transaction.';
      case 'unconditional':
        return 'All conditions of sale have been satisfied or waived. The sale is now unconditional and will proceed to settlement.';
      case 'settled':
        return 'Settlement has been completed successfully. Ownership has been transferred to the buyer and all financial obligations have been met.';
      default:
        return 'The property status has been updated.';
    }
  };

  const getNextSteps = (status) => {
    switch (status) {
      case 'contract-exchanged':
        return [
          'Arrange building and pest inspections if required',
          'Organize finance approval and settlement arrangements',
          'Coordinate with your solicitor or conveyancer',
          'Prepare for settlement within the agreed timeframe'
        ];
      case 'unconditional':
        return [
          'Finalize settlement arrangements with your solicitor',
          'Arrange property insurance (buyers)',
          'Coordinate final property inspection',
          'Prepare for settlement date and key handover'
        ];
      case 'settled':
        return [
          'Congratulations on the successful completion of your property transaction!',
          'Ensure all keys and access cards are transferred',
          'Update utility companies with change of ownership',
          'Commission invoice has been generated and will be processed'
        ];
      default:
        return ['Contact your agent for more information'];
    }
  };

  return {
    subject: `Property Status Update: ${propertyTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Property Status Update</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981, #047857); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #ffffff; padding: 30px 20px; border: 1px solid #e5e7eb; }
          .status-update { background: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
          .status-flow { display: flex; align-items: center; justify-content: center; margin: 20px 0; }
          .status-box { padding: 10px 15px; border-radius: 6px; margin: 0 10px; font-weight: bold; }
          .status-previous { background: #f3f4f6; color: #6b7280; }
          .status-current { background: #10b981; color: white; }
          .arrow { color: #10b981; font-size: 18px; }
          .next-steps { background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .next-steps ul { padding-left: 20px; }
          .next-steps li { margin: 8px 0; }
          .footer { background: #f9fafb; color: #6b7280; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; }
          .property-details { background: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .timestamp { color: #6b7280; font-size: 14px; text-align: right; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 28px;">Property Status Update</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Important update regarding your property transaction</p>
          </div>
          
          <div class="content">
            <p><strong>Dear ${recipientName || 'Valued Client'},</strong></p>
            
            <p>We're writing to inform you of an important update regarding your property transaction.</p>
            
            <div class="property-details">
              <h3 style="margin-top: 0; color: #047857;">Property: ${propertyTitle}</h3>
              <p><strong>Your Agent:</strong> ${agentName}</p>
            </div>
            
            <div class="status-update">
              <h3 style="margin-top: 0; color: #047857;">Status Change</h3>
              <div class="status-flow">
                <div class="status-box status-previous">${getStatusDisplayName(previousStatus)}</div>
                <span class="arrow">→</span>
                <div class="status-box status-current">${getStatusDisplayName(newStatus)}</div>
              </div>
              <p>${getStatusDescription(newStatus)}</p>
            </div>
            
            <div class="next-steps">
              <h3 style="margin-top: 0; color: #047857;">What Happens Next</h3>
              <ul>
                ${getNextSteps(newStatus).map(step => `<li>${step}</li>`).join('')}
              </ul>
            </div>
            
            ${newStatus === 'settled' ? `
            <div style="background: #ecfdf5; border: 1px solid #10b981; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #047857;">🎉 Congratulations!</h4>
              <p>Your property transaction has been completed successfully. A commission invoice has been automatically generated and will be processed according to the agreed terms.</p>
            </div>
            ` : ''}
            
            <p>If you have any questions about this status update or need assistance with the next steps, please don't hesitate to contact your agent or our office.</p>
            
            <p>Thank you for choosing our services for your property transaction.</p>
            
            <p><strong>Best regards,</strong><br>
            The OnlyIf Real Estate Team</p>
            
            <div class="timestamp">
              Updated on ${new Date(timestamp).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from the OnlyIf Real Estate system. Please do not reply directly to this email.</p>
            <p>For assistance, contact your agent directly or visit our website.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Property Status Update: ${propertyTitle}

Dear ${recipientName || 'Valued Client'},

We're writing to inform you of an important update regarding your property transaction.

Property: ${propertyTitle}
Your Agent: ${agentName}

Status Change: ${getStatusDisplayName(previousStatus)} → ${getStatusDisplayName(newStatus)}

${getStatusDescription(newStatus)}

What Happens Next:
${getNextSteps(newStatus).map(step => `• ${step}`).join('\n')}

${newStatus === 'settled' ? `
Congratulations! Your property transaction has been completed successfully. A commission invoice has been automatically generated and will be processed according to the agreed terms.
` : ''}

If you have any questions about this status update or need assistance with the next steps, please don't hesitate to contact your agent or our office.

Thank you for choosing our services for your property transaction.

Best regards,
The OnlyIf Real Estate Team

Updated on ${new Date(timestamp).toLocaleDateString('en-US', { 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})}
    `
  };
};

// Enhanced status notification service
class StatusNotificationService {
  constructor() {
    this.emailService = emailService;
  }

  async sendStatusChangeNotification(data) {
    try {
      const template = getStatusChangeTemplate(data);
      
      // Send email using existing email service
      await this.emailService.sendEmail({
        to: data.recipientEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      });
      
      console.log(`📧 Status change notification sent to ${data.recipientEmail}`);
      
      return {
        success: true,
        recipient: data.recipientEmail,
        subject: template.subject,
        sentAt: new Date()
      };
      
    } catch (error) {
      console.error('❌ Failed to send status change notification:', error);
      
      return {
        success: false,
        error: error.message,
        recipient: data.recipientEmail,
        attemptedAt: new Date()
      };
    }
  }

  async sendBulkStatusNotifications(notifications) {
    const results = [];
    
    for (const notification of notifications) {
      try {
        const result = await this.sendStatusChangeNotification(notification);
        results.push(result);
        
        // Add small delay to avoid overwhelming email service
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          recipient: notification.recipientEmail,
          attemptedAt: new Date()
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    console.log(`📊 Bulk notification results: ${successCount} sent, ${failureCount} failed`);
    
    return {
      total: results.length,
      successful: successCount,
      failed: failureCount,
      results
    };
  }

  async sendInvoiceGeneratedNotification(data) {
    try {
      const { recipientEmail, recipientName, propertyTitle, agentName, invoiceNumber, invoiceAmount, dueDate } = data;
      
      const template = {
        subject: `Invoice Generated: ${propertyTitle}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #1f2937, #374151); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #ffffff; padding: 30px 20px; border: 1px solid #e5e7eb; }
              .invoice-details { background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .amount { font-size: 24px; font-weight: bold; color: #047857; }
              .footer { background: #f9fafb; color: #6b7280; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">Commission Invoice Generated</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Settlement completed successfully</p>
              </div>
              
              <div class="content">
                <p><strong>Dear ${recipientName || 'Valued Client'},</strong></p>
                
                <p>Congratulations! Your property settlement has been completed successfully, and we're pleased to inform you that your commission invoice has been generated.</p>
                
                <div class="invoice-details">
                  <h3 style="margin-top: 0; color: #047857;">Invoice Details</h3>
                  <p><strong>Property:</strong> ${propertyTitle}</p>
                  <p><strong>Agent:</strong> ${agentName}</p>
                  <p><strong>Invoice Number:</strong> ${invoiceNumber}</p>
                  <p><strong>Amount:</strong> <span class="amount">$${invoiceAmount.toLocaleString()}</span></p>
                  <p><strong>Due Date:</strong> ${new Date(dueDate).toLocaleDateString()}</p>
                </div>
                
                <p>The invoice will be processed according to the terms agreed upon in your listing contract. Payment arrangements have been set up automatically, and you should receive further details regarding payment processing shortly.</p>
                
                <p>Thank you for choosing OnlyIf Real Estate for your property transaction. We appreciate your business and trust.</p>
                
                <p><strong>Best regards,</strong><br>
                The OnlyIf Real Estate Team</p>
              </div>
              
              <div class="footer">
                <p>This is an automated notification. For questions about your invoice, please contact your agent directly.</p>
              </div>
            </div>
          </body>
          </html>
        `
      };
      
      await this.emailService.sendEmail({
        to: recipientEmail,
        subject: template.subject,
        html: template.html
      });
      
      console.log(`💰 Invoice notification sent to ${recipientEmail}`);
      
      return { success: true, invoiceNumber, sentAt: new Date() };
      
    } catch (error) {
      console.error('❌ Failed to send invoice notification:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export service instance
module.exports = new StatusNotificationService();