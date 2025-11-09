const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = this.createTransporter();
  }

  createTransporter() {
    if (process.env.EMAIL_SERVICE && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      return nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
    }
    return null;
  }

  async sendEmail(to, subject, html, text = null) {
    if (!this.transporter) {
      console.warn('Email transporter not configured');
      return false;
    }

    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, '') // Strip HTML if no text provided
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', result.messageId);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  async sendNotificationEmail(user, type, data) {
    const templates = {
      'property_match': {
        subject: 'New Property Match Found!',
        html: `<h2>Hi ${user.name},</h2><p>We found a property that matches your criteria!</p>`
      },
      'offer_received': {
        subject: 'New Offer Received',
        html: `<h2>Hi ${user.name},</h2><p>You have received a new offer on your property.</p>`
      },
      'inspection_scheduled': {
        subject: 'Inspection Scheduled',
        html: `<h2>Hi ${user.name},</h2><p>An inspection has been scheduled for your property.</p>`
      }
    };

    const template = templates[type];
    if (!template) {
      console.error('Unknown email template type:', type);
      return false;
    }

    return await this.sendEmail(user.email, template.subject, template.html);
  }
}

module.exports = new EmailService();