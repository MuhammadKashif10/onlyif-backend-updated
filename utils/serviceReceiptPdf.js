// utils/serviceReceiptPdf.js
// Generates a professional ONLYIF-branded PDF receipt for a service order.
// Uses pdfkit (already a backend dependency). Streams directly to the provided
// writable stream (e.g. an Express response). Does NOT use Stripe receipts.
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const BRAND_GREEN = '#2FA553';
const INK = '#111827';
const MUTED = '#6b7280';

const money = (v) =>
  `A$${Number(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Try a few likely logo locations; fall back to a text wordmark if not found.
function drawBrandHeader(doc, order) {
  const candidates = [
    path.join(__dirname, '..', 'uploads', 'logo.PNG'),
    path.join(__dirname, '..', 'uploads', 'logo.png'),
    path.join(__dirname, '..', 'assets', 'logo.PNG'),
  ];
  const logo = candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  if (logo) {
    try {
      doc.image(logo, 50, 45, { width: 120 });
    } catch {
      doc.fontSize(24).fillColor(BRAND_GREEN).text('ONLY IF', 50, 50);
    }
  } else {
    doc.fontSize(24).fillColor(BRAND_GREEN).text('ONLY IF', 50, 50);
  }

  // Top-right: receipt details
  const tid = order.stripePaymentIntentId || order.stripeSessionId || 'N/A';
  doc.fillColor(INK).fontSize(20).text('RECEIPT', 0, 50, { align: 'right' });
  doc
    .fontSize(9)
    .fillColor(MUTED)
    .text(`Receipt No: ${order.orderNumber}`, { align: 'right' })
    .text(`TID: ${tid}`, { align: 'right' })
    .text(`Date: ${new Date(order.paidAt || order.createdAt).toLocaleDateString('en-AU')}`, {
      align: 'right',
    })
    .text(`Payment: ${String(order.paymentStatus || 'paid').toUpperCase()}`, { align: 'right' });
}

function drawBilledTo(doc, order) {
  doc.moveTo(50, 150).lineTo(545, 150).strokeColor('#e5e7eb').stroke();
  doc.fillColor(INK).fontSize(12).text('Billed To', 50, 165, { underline: false });
  doc
    .fontSize(11)
    .fillColor('#374151')
    .text(order.customerName || 'Customer', 50, 183)
    .text(order.customerEmail || '');
}

function drawTable(doc, order) {
  const top = 235;
  const cols = { service: 50, qty: 320, unit: 380, total: 470 };

  // Header row
  doc.rect(50, top, 495, 24).fill(BRAND_GREEN);
  doc.fillColor('#ffffff').fontSize(10);
  doc.text('SERVICE', cols.service + 8, top + 7);
  doc.text('QTY', cols.qty, top + 7);
  doc.text('UNIT PRICE', cols.unit, top + 7);
  doc.text('TOTAL', cols.total, top + 7);

  // Single line item
  const rowY = top + 24;
  doc.fillColor(INK).fontSize(10);
  doc.text(order.serviceName, cols.service + 8, rowY + 8, { width: 250 });
  doc.text('1', cols.qty, rowY + 8);
  doc.text(money(order.amount), cols.unit, rowY + 8);
  doc.text(money(order.amount), cols.total, rowY + 8);
  doc.moveTo(50, rowY + 30).lineTo(545, rowY + 30).strokeColor('#e5e7eb').stroke();

  // Summary
  const sumY = rowY + 45;
  const labelX = 380;
  const valX = 470;
  doc.fillColor(MUTED).fontSize(10);
  doc.text('Subtotal', labelX, sumY);
  doc.fillColor(INK).text(money(order.amount), valX, sumY);
  doc.fillColor(MUTED).text('Tax (GST)', labelX, sumY + 18);
  doc.fillColor(INK).text(money(0), valX, sumY + 18);

  doc.moveTo(labelX, sumY + 36).lineTo(545, sumY + 36).strokeColor('#e5e7eb').stroke();
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12);
  doc.text('Grand Total', labelX, sumY + 44);
  doc.fillColor(BRAND_GREEN).text(money(order.amount), valX, sumY + 44);
  doc.font('Helvetica');

  // Transaction reference below the table (left-aligned) for uniqueness / reconciliation
  const tid = order.stripePaymentIntentId || order.stripeSessionId || 'N/A';
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10);
  doc.text('Transaction ID (TID):', 50, sumY + 80);
  doc.font('Helvetica').fillColor(MUTED).fontSize(10);
  doc.text(tid, 50, sumY + 94);
}

function drawFooter(doc) {
  const y = 700;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
  doc
    .fillColor(BRAND_GREEN)
    .fontSize(13)
    .text('Thank You For Choosing Only If', 50, y + 14, { align: 'center' });
  doc
    .fillColor(MUTED)
    .fontSize(9)
    .text('Questions? Contact us at hello@onlyif.com.au', { align: 'center' });
}

/**
 * Generate the receipt PDF and pipe it to `stream`.
 * @param {Object} order - ServiceOrder document (plain or mongoose doc)
 * @param {NodeJS.WritableStream} stream - destination (e.g. Express res)
 */
function renderReceipt(doc, order) {
  drawBrandHeader(doc, order);
  drawBilledTo(doc, order);
  drawTable(doc, order);
  drawFooter(doc);
  doc.end();
}

function generateServiceReceiptPDF(order, stream) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(stream);
  renderReceipt(doc, order);
}

/**
 * Build the receipt PDF in memory and resolve a Buffer — used for email attachments.
 * @param {Object} order - ServiceOrder document
 * @returns {Promise<Buffer>}
 */
function generateServiceReceiptBuffer(order) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      renderReceipt(doc, order);
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateServiceReceiptPDF, generateServiceReceiptBuffer };
