// services/serviceOrderService.js
// Side effects that run after a Marketplace service order is paid:
//   1. ONLYIF-branded customer confirmation email (NOT a Stripe receipt)
//   2. Admin in-app notifications (reuses the existing Notification model)
//   3. Socket.IO broadcast to admin dashboards
// Everything is defensive — a failure here must never break the Stripe webhook.
const emailService = require('./emailService');
const { generateServiceReceiptBuffer } = require('../utils/serviceReceiptPdf');

const BRAND_GREEN = '#2FA553';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'hello@onlyif.com.au';

const fmtMoney = (amount, currency = 'AUD') =>
  `${currency === 'AUD' ? 'A$' : ''}${Number(amount || 0).toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function buildConfirmationHTML(order) {
  const paidDate = new Date(order.paidAt || order.createdAt).toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const amount = fmtMoney(order.amount, order.currency);

  return `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="margin:0;background-color:#f3f8f4;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f8f4;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(17,24,39,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:${BRAND_GREEN};padding:28px 32px;">
              <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.5px;">ONLY IF</span>
            </td>
          </tr>
          <!-- Body -->
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:#111827;">Your Service Booking Has Been Confirmed</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">
              Hi ${order.customerName || 'there'}, thank you for your booking. We've received your payment and our team is on it.
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;">
              <tr><td style="padding:16px 20px;border-bottom:1px solid #f0f0f0;">
                <span style="display:block;font-size:12px;color:#6b7280;">Order Number</span>
                <span style="font-size:15px;font-weight:700;color:#111827;">${order.orderNumber}</span>
              </td></tr>
              <tr><td style="padding:16px 20px;border-bottom:1px solid #f0f0f0;">
                <span style="display:block;font-size:12px;color:#6b7280;">Service Purchased</span>
                <span style="font-size:15px;font-weight:700;color:#111827;">${order.serviceName}</span>
              </td></tr>
              <tr><td style="padding:16px 20px;border-bottom:1px solid #f0f0f0;">
                <span style="display:block;font-size:12px;color:#6b7280;">Amount Paid</span>
                <span style="font-size:15px;font-weight:700;color:${BRAND_GREEN};">${amount}</span>
              </td></tr>
              <tr><td style="padding:16px 20px;border-bottom:1px solid #f0f0f0;">
                <span style="display:block;font-size:12px;color:#6b7280;">Payment Date</span>
                <span style="font-size:15px;color:#111827;">${paidDate}</span>
              </td></tr>
              <tr><td style="padding:16px 20px;">
                <span style="display:block;font-size:12px;color:#6b7280;">Customer Email</span>
                <span style="font-size:15px;color:#111827;">${order.customerEmail || ''}</span>
              </td></tr>
            </table>

            <h2 style="margin:28px 0 8px;font-size:16px;color:#111827;">Next Steps</h2>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#4b5563;">
              Our production team will reach out within 1 business day to schedule your service and confirm the details.
              You can track the status of this order anytime from your Seller Dashboard under <strong>Marketplace Orders</strong>.
            </p>

            <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#4b5563;">
              Need help? Contact our support team at
              <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_GREEN};font-weight:600;text-decoration:none;">${SUPPORT_EMAIL}</a>.
            </p>
          </td></tr>
          <!-- Footer -->
          <tr><td style="background:#f3f8f4;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} Only If. Thank you for choosing Only If.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`;
}

async function sendConfirmationEmail(order) {
  if (!order.customerEmail) {
    console.warn(`ServiceOrder ${order.orderNumber}: no customer email, skipping confirmation email`);
    return false;
  }
  const subject = 'Your Service Booking Has Been Confirmed';
  const html = buildConfirmationHTML(order);

  // Attach the ONLYIF-branded PDF receipt. If PDF generation fails for any
  // reason, still send the email (without the attachment) rather than dropping it.
  let attachments = [];
  try {
    const pdfBuffer = await generateServiceReceiptBuffer(order);
    attachments = [
      {
        filename: `Receipt_${order.orderNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ];
  } catch (err) {
    console.error(`ServiceOrder ${order.orderNumber}: failed to build PDF for email:`, err?.message);
  }

  return emailService.sendEmail(order.customerEmail, subject, html, null, attachments);
}

async function notifyAdmins(order, app) {
  try {
    const User = require('../models/User');
    const Notification = require('../models/Notification');

    const admins = await User.find({ $or: [{ role: 'admin' }, { roles: 'admin' }] }).select('_id');
    const amount = fmtMoney(order.amount, order.currency);
    const title = 'New Marketplace Service Order';
    const body = `${order.customerName || 'A customer'} booked "${order.serviceName}" (${order.orderNumber}) for ${amount}.`;

    await Promise.all(
      admins.map((a) =>
        Notification.create({
          user: a._id,
          type: 'system',
          category: 'success',
          title,
          body,
          actionUrl: '/admin/service-orders',
          actionText: 'View Orders',
          priority: 'high',
          meta: {
            additionalData: {
              orderId: order._id.toString(),
              orderNumber: order.orderNumber,
              serviceId: order.serviceId,
              serviceName: order.serviceName,
              amount: order.amount,
              customerName: order.customerName,
              customerEmail: order.customerEmail,
            },
          },
        })
      )
    );

    // Real-time broadcast to admin dashboards (best-effort)
    try {
      const io = app?.locals?.io || global.io;
      if (io) {
        io.emit('service_order_created', {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          serviceName: order.serviceName,
          amount: order.amount,
          customer: order.customerName,
          customerEmail: order.customerEmail,
          date: new Date().toISOString(),
        });
      }
    } catch (socketErr) {
      console.error('Service order socket broadcast failed:', socketErr?.message);
    }
  } catch (err) {
    console.error('Failed to create admin notifications for service order:', err?.message);
  }
}

/**
 * Run all post-payment side effects for a paid service order.
 * Defensive: individual failures are logged, never thrown.
 */
async function handlePaidOrder(order, app) {
  await Promise.allSettled([sendConfirmationEmail(order), notifyAdmins(order, app)]);
}

/**
 * Idempotently mark a ServiceOrder as paid from a Stripe Checkout Session and
 * run all side effects. Shared by the Stripe webhook and the /confirm fallback
 * so both paths behave identically. Returns the (updated) order.
 */
async function confirmAndFulfill(order, session, app) {
  if (!order) return order;
  if (order.paymentStatus === 'paid') return order; // already processed — no double email/notify

  order.paymentStatus = 'paid';
  order.stripePaymentIntentId = session.payment_intent || order.stripePaymentIntentId;
  order.stripeSessionId = order.stripeSessionId || session.id;
  order.paidAt = new Date();
  if (!order.customerEmail && session.customer_details?.email) {
    order.customerEmail = session.customer_details.email;
  }
  await order.save();

  await handlePaidOrder(order, app);
  return order;
}

module.exports = {
  buildConfirmationHTML,
  sendConfirmationEmail,
  notifyAdmins,
  handlePaidOrder,
  confirmAndFulfill,
};
