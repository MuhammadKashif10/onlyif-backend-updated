const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { allowAdmin } = require('../middleware/roleMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  getAllUsers,
  toggleUserSuspension,
  updateUserStatus,
  deleteUser,
  deleteProperty,
  resetAssignments,
  getTermsLogs,
  changeAdminPassword,
  getUserStats,
  getAgentRequests,
  updateAgentRequestStatus
} = require('../controllers/adminController');
const Property = require('../models/Property');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const PlatformSettings = require('../models/PlatformSettings');

// All admin routes require admin role
router.use(authMiddleware, allowAdmin);

// Settings endpoints
router.get('/settings', asyncHandler(async (req, res) => {
  const doc = await PlatformSettings.getSingleton();
  res.json({ success: true, data: doc });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const email = req.body.contactEmail;
  const phone = req.body.contactPhone;
  const emailOk = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneOk = !phone || /[0-9()+\-\s]{7,}/.test(phone);
  if (!emailOk) return res.status(400).json({ success: false, message: 'Invalid email' });
  if (!phoneOk) return res.status(400).json({ success: false, message: 'Invalid phone' });
  const doc = await PlatformSettings.getSingleton();
  Object.assign(doc, req.body || {});
  await doc.save();
  res.json({ success: true, data: doc, message: 'Settings updated' });
}));

router.get('/users', asyncHandler(getAllUsers));
router.get('/users/stats', asyncHandler(getUserStats));
router.get('/agent-requests', asyncHandler(getAgentRequests));
router.put('/agent-status/:userId', asyncHandler(updateAgentRequestStatus));
router.patch('/users/:id/suspend', asyncHandler(toggleUserSuspension));
router.patch('/users/:id/status', asyncHandler(updateUserStatus));
router.delete('/users/:id', asyncHandler(deleteUser));
router.delete('/properties/:id', asyncHandler(deleteProperty));
router.post('/assignments/reset', asyncHandler(resetAssignments));
router.get('/terms-logs', asyncHandler(getTermsLogs));

// Password Change Route
router.post('/change-password', asyncHandler(changeAdminPassword));

// Add this route to your existing adminRoutes.js file
router.get('/dashboard/stats', asyncHandler(async (req, res) => {
  try {
    // Get total properties count
    const totalProperties = await Property.countDocuments({ isDeleted: false });
    
    // Get total agents count (users with role 'agent')
    const totalAgents = await User.countDocuments({ 
      role: 'agent', 
      isDeleted: false 
    });
    
    // Get total users count (all users except admins)
    const totalUsers = await User.countDocuments({ 
      role: { $in: ['buyer', 'seller', 'agent'] }, 
      isDeleted: false 
    });
    
    // Get pending approvals count (properties with status 'pending')
    const pendingApprovals = await Property.countDocuments({ 
      status: 'pending', 
      isDeleted: false 
    });
    
    // Get recent payments count (transactions from last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentPayments = await Transaction.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
      status: 'completed'
    });
    
    // Calculate monthly revenue (sum of completed transactions this month)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const monthlyRevenueResult = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    const monthlyRevenue = monthlyRevenueResult.length > 0 ? monthlyRevenueResult[0].total : 0;
    
    const stats = {
      totalProperties,
      totalAgents,
      totalUsers,
      pendingApprovals,
      recentPayments,
      monthlyRevenue
    };
    
    res.json({
      success: true,
      data: stats,
      message: 'Dashboard statistics retrieved successfully'
    });
    
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics',
      data: {
        totalProperties: 0,
        totalAgents: 0,
        totalUsers: 0,
        pendingApprovals: 0,
        recentPayments: 0,
        monthlyRevenue: 0
      }
    });
  }
}));
// Individual count endpoints
router.get('/properties/count', asyncHandler(async (req, res) => {
  try {
    const count = await Property.countDocuments({ isDeleted: false });
    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Error fetching properties count:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch properties count',
      count: 0
    });
  }
}));

router.get('/agents/count', asyncHandler(async (req, res) => {
  try {
    const count = await User.countDocuments({ 
      role: 'agent', 
      isDeleted: false 
    });
    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Error fetching agents count:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch agents count',
      count: 0
    });
  }
}));

router.get('/users/count', asyncHandler(async (req, res) => {
  try {
    const count = await User.countDocuments({ 
      role: { $in: ['buyer', 'seller', 'agent'] }, 
      isDeleted: false 
    });
    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Error fetching users count:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users count',
      count: 0
    });
  }
}));

// Invoice reporting - list with filters
router.get('/invoices', asyncHandler(async (req, res) => {
  const Invoice = require('../models/Invoice');
  const { from, to, propertyId, agentId, sellerId, status, category, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  if (propertyId) filter.property = propertyId;
  if (agentId) filter.agent = agentId;
  if (sellerId) filter.seller = sellerId;
  if (status) filter.status = status;
  if (category) filter.category = category;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .populate('property', 'title address')
      .populate('agent', 'name email')
      .populate('seller', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Invoice.countDocuments(filter)
  ]);

  res.json({ success: true, data: { invoices, pagination: { page: parseInt(page), limit: parseInt(limit), total } } });
}));

// Invoice reporting - CSV export
router.get('/invoices/export', asyncHandler(async (req, res) => {
  const Invoice = require('../models/Invoice');
  const { from, to, propertyId, agentId, sellerId, status, category } = req.query;
  const filter = {};
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  if (propertyId) filter.property = propertyId;
  if (agentId) filter.agent = agentId;
  if (sellerId) filter.seller = sellerId;
  if (status) filter.status = status;
  if (category) filter.category = category;

  const invoices = await Invoice.find(filter)
    .populate('property', 'title')
    .populate('agent', 'name')
    .populate('seller', 'name')
    .sort({ createdAt: -1 });

  const header = ['invoiceNumber','category','amount','currency','status','property','agent','seller','createdAt','dueDate'];
  const rows = invoices.map(inv => [
    inv.invoiceNumber,
    inv.category || '',
    (inv.totalAmount || 0).toString(),
    'A$',
    inv.status,
    inv.property?.title || '',
    inv.agent?.name || '',
    inv.seller?.name || '',
    inv.createdAt?.toISOString() || '',
    inv.dueDate?.toISOString() || ''
  ]);
  const csv = [header.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
  res.status(200).send(csv);
}));

// List payments (transactions) for Admin with search/filter and latest-first sorting
router.get('/payments', asyncHandler(async (req, res) => {
  const Transaction = require('../models/Transaction');
  const Purchase = require('../models/Purchase'); // Add Purchase model
  const User = require('../models/User');
  const Property = require('../models/Property');

  const { q, sellerName, propertyName, transactionId, status, type } = req.query;

  // Fetch Transaction records
  const txnQuery = { isDeleted: false };
  if (status && status !== 'all') {
    txnQuery.status = status === 'completed' ? 'succeeded' : status;
  }
  if (type && type !== 'all') {
    txnQuery.transactionType = type === 'unlock fee' ? 'unlock_fee' : type;
  }
  if (transactionId) txnQuery.transactionId = transactionId;

  let txns = await Transaction.find(txnQuery)
    .populate('user', 'name email')
    .populate('property', 'title address')
    .sort({ createdAt: -1 });

  // Fetch Purchase records (buyer unlock payments)
  const purchaseQuery = {};
  if (status && status !== 'all') {
    purchaseQuery.status = status === 'completed' ? 'paid' : status;
  }
  // Only include purchases if type is 'unlock fee' or 'all' types
  let purchases = [];
  if (!type || type === 'all' || type === 'unlock fee') {
    purchases = await Purchase.find(purchaseQuery)
      .populate('user', 'name email')
      .populate('property', 'title address')
      .sort({ createdAt: -1 });
  }

  // Convert Transactions to unified format
  const txnPayments = txns.map(t => {
    const paymentType = t.transactionType === 'commission'
      ? 'commission'
      : (t.transactionType === 'unlock_fee' ? 'unlock fee' : (t.transactionType || 'fee'));
    return {
      id: t._id,
      transactionId: t.transactionId,
      userId: t.user?._id,
      userName: t.user?.name || '—',
      propertyId: t.property?._id,
      propertyAddress: t.property?.title || '—',
      amount: t.totalAmount || 0,
      type: paymentType,
      status: t.status === 'succeeded' ? 'completed' : (t.status || 'pending'),
      paymentMethod: t.paymentMethod || 'stripe',
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      source: 'transaction'
    };
  });

  // Convert Purchases to unified format
  const purchasePayments = purchases.map(p => {
    return {
      id: p._id,
      transactionId: p.paymentIntentId || `purchase_${p._id}`,
      userId: p.user?._id,
      userName: p.user?.name || '—',
      propertyId: p.property?._id,
      propertyAddress: p.property?.title || '—',
      amount: (p.amount || 4900) / 100, // Convert from cents to dollars
      type: 'unlock fee',
      status: p.status === 'paid' ? 'completed' : (p.status || 'pending'),
      paymentMethod: 'stripe',
      createdAt: p.createdAt,
      completedAt: p.status === 'paid' ? p.updatedAt : null,
      source: 'purchase'
    };
  });

  // Merge and sort all payments by creation date, de-duplicating by transactionId (prefer Transaction source)
  const byTxnId = new Map();
  txnPayments.forEach(p => {
    if (p.transactionId) byTxnId.set(p.transactionId, p);
  });
  purchasePayments.forEach(p => {
    if (!p.transactionId || !byTxnId.has(p.transactionId)) {
      byTxnId.set(p.transactionId || `purchase_${p.id}`, p);
    }
  });
  let allPayments = Array.from(byTxnId.values());
  allPayments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Apply search filters
  const qLower = (q || '').toString().toLowerCase();
  const sellerLower = (sellerName || '').toString().toLowerCase();
  const propertyLower = (propertyName || '').toString().toLowerCase();

  if (qLower) {
    allPayments = allPayments.filter(p =>
      (p.transactionId || '').toLowerCase().includes(qLower) ||
      (p.userName || '').toLowerCase().includes(qLower) ||
      (p.propertyAddress || '').toLowerCase().includes(qLower)
    );
  }
  if (sellerLower) {
    allPayments = allPayments.filter(p => (p.userName || '').toLowerCase().includes(sellerLower));
  }
  if (propertyLower) {
    allPayments = allPayments.filter(p => (p.propertyAddress || '').toLowerCase().includes(propertyLower));
  }

  // Remove the source field from final response
  const payments = allPayments.map(({ source, ...payment }) => payment);

  res.json({ success: true, data: payments });
}));

router.get('/payments/:transactionId/invoice.pdf', asyncHandler(async (req, res) => {
  try {
    const { transactionId } = req.params;
    const Invoice = require('../models/Invoice');
    const Transaction = require('../models/Transaction');

    // Try to find a seller invoice that includes this transactionId
    const invoice = await Invoice.findOne({ 'payments.transactionId': transactionId });
    if (invoice) {
      // Redirect to the canonical invoice PDF generator
      return res.redirect(302, `/api/invoices/${invoice._id}/pdf`);
    }

    // Otherwise, generate a receipt PDF from the Transaction (e.g., buyer unlock fee)
    let txn = await Transaction.findOne({ transactionId })
      .populate('user', 'name email')
      .populate('property', 'title address')
      .lean();

    // Fallback: try to build a pseudo transaction from Purchase if Transaction not found
    if (!txn) {
      try {
        const Purchase = require('../models/Purchase');
        const purchase = await Purchase.findOne({ paymentIntentId: transactionId })
          .populate('user', 'name email')
          .populate('property', 'title address')
          .lean();
        if (purchase) {
          txn = {
            transactionId,
            transactionType: 'unlock_fee',
            user: purchase.user,
            property: purchase.property,
            totalAmount: (purchase.amount || 4900) / 100,
            paymentMethod: 'stripe',
            createdAt: purchase.createdAt,
            items: [{ description: `Property unlock access - ${purchase.property?.title || 'Property'}`, unitPrice: (purchase.amount || 4900) / 100, totalPrice: (purchase.amount || 4900) / 100, quantity: 1 }]
          };
        }
      } catch (_) {}
    }

    if (!txn) {
      return res.status(404).json({ success: false, message: 'Payment not found for provided transactionId' });
    }

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });

    // Headers for file download
    res.setHeader('Content-Type', 'application/pdf');
    const safeType = (txn.transactionType || 'payment').replace(/[^a-zA-Z0-9_-]+/g, '-');
    const filename = `${safeType.toUpperCase()}-${transactionId}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Pipe PDF to response
    doc.pipe(res);

    // ---- Layout constants / brand palette ----
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentWidth = right - left;
    const GREEN = '#3AB861';
    const DARK = '#111827';
    const GRAY = '#6B7280';
    const BORDER = '#E5E7EB';
    const ZEBRA = '#F9FAFB';

    const currency = 'A$';
    const money = (v) => `${currency}${Number(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ---- Header: brand (left) + title/meta (right) ----
    doc.font('Helvetica-Bold').fontSize(26);
    doc.fillColor(GREEN).text('Only', left, 52, { continued: true });
    doc.fillColor(DARK).text('If');
    doc.fillColor(GRAY).font('Helvetica').fontSize(9).text('Real Estate', left, 82);

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(22).text('RECEIPT', left, 50, { align: 'right', width: contentWidth });
    const dateStr = new Date(txn.createdAt).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
    doc.fillColor(GRAY).font('Helvetica').fontSize(9)
      .text(`Transaction ID: ${transactionId}`, left, 80, { align: 'right', width: contentWidth })
      .text(`Date: ${dateStr}`, left, 92, { align: 'right', width: contentWidth });

    // divider
    doc.moveTo(left, 112).lineTo(right, 112).lineWidth(2).strokeColor(GREEN).stroke();

    // ---- Details: clean two-column label/value ----
    const colGap = 24;
    const colW = (contentWidth - colGap) / 2;
    const rightColX = left + colW + colGap;
    const addr = txn.property && txn.property.address;
    const addressLine = addr
      ? [addr.street, addr.city, addr.state, addr.zipCode].filter(Boolean).join(', ')
      : (txn.property ? (txn.property.title || '—') : '—');
    const typeLabel = txn.transactionType === 'unlock_fee' ? 'Unlock Fee' : (txn.transactionType || 'Payment');

    const pair = (label, value, x, y, w) => {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8).text(String(label).toUpperCase(), x, y, { width: w });
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text(value || '—', x, y + 11, { width: w });
    };

    let y = 132;
    pair('Buyer Name', txn.user?.name, left, y, colW);
    pair('Payment Method', txn.paymentMethod || 'stripe', rightColX, y, colW);
    y += 40;
    pair('Buyer Email', txn.user?.email, left, y, colW);
    pair('Transaction Type', typeLabel, rightColX, y, colW);
    y += 40;
    pair('Property Name', txn.property?.title, left, y, colW);
    pair('Property Address', addressLine, rightColX, y, colW);
    y += 56;

    // ---- Items table ----
    const cols = [
      { key: 'idx', label: '#', w: 28, align: 'left' },
      { key: 'desc', label: 'Description', w: 247, align: 'left' },
      { key: 'qty', label: 'Qty', w: 50, align: 'center' },
      { key: 'unit', label: 'Unit Price', w: 85, align: 'right' },
      { key: 'total', label: 'Total', w: 85, align: 'right' },
    ];
    let cx = left;
    cols.forEach((c) => { c.x = cx; cx += c.w; });
    const pad = 6;

    const items = (Array.isArray(txn.items) && txn.items.length)
      ? txn.items
      : [{ description: `Payment - ${typeLabel}`, quantity: 1, unitPrice: txn.totalAmount || 0, totalPrice: txn.totalAmount || 0 }];

    const drawCells = (cells, yTop, { header = false, fill = null } = {}) => {
      doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 9 : 10);
      let rowH = header ? 22 : 24;
      if (!header) {
        cols.forEach((c) => {
          const h = doc.heightOfString(String(cells[c.key] ?? ''), { width: c.w - pad * 2, align: c.align });
          rowH = Math.max(rowH, h + pad * 2);
        });
      }
      if (header) doc.rect(left, yTop, contentWidth, rowH).fill(DARK);
      else if (fill) doc.rect(left, yTop, contentWidth, rowH).fill(fill);

      cols.forEach((c) => {
        doc.fillColor(header ? '#FFFFFF' : DARK)
          .font(header ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(header ? 9 : 10)
          .text(String(cells[c.key] ?? ''), c.x + pad, yTop + pad, { width: c.w - pad * 2, align: c.align });
      });
      return rowH;
    };

    // header row
    let rowY = y;
    rowY += drawCells({ idx: '#', desc: 'Description', qty: 'Qty', unit: 'Unit Price', total: 'Total' }, rowY, { header: true });

    // data rows
    const rowTops = [];
    items.forEach((li, idx) => {
      rowTops.push(rowY);
      const h = drawCells({
        idx: String(idx + 1),
        desc: li.description || '—',
        qty: String(li.quantity || 1),
        unit: money(li.unitPrice),
        total: money(li.totalPrice != null ? li.totalPrice : (li.unitPrice || 0) * (li.quantity || 1)),
      }, rowY, { fill: idx % 2 === 1 ? ZEBRA : null });
      rowY += h;
    });

    // table grid (outer box + column separators + row separators)
    const tableTop = y;
    doc.lineWidth(0.5).strokeColor(BORDER);
    doc.rect(left, tableTop, contentWidth, rowY - tableTop).stroke();
    cols.slice(1).forEach((c) => doc.moveTo(c.x, tableTop).lineTo(c.x, rowY).stroke());
    rowTops.forEach((ry) => doc.moveTo(left, ry).lineTo(right, ry).stroke());

    // ---- Summary (right-aligned) ----
    const subtotal = (typeof txn.subtotal === 'number')
      ? txn.subtotal
      : items.reduce((s, li) => s + Number(li.totalPrice != null ? li.totalPrice : (li.unitPrice || 0) * (li.quantity || 1)), 0);
    const taxAmount = txn.tax && typeof txn.tax.amount === 'number' ? txn.tax.amount : 0;
    const total = (typeof txn.totalAmount === 'number') ? txn.totalAmount : subtotal + taxAmount;

    const sumW = 240;
    const sumX = right - sumW;
    let sy = rowY + 18;
    const sumRow = (label, value, { bold = false, accent = false } = {}) => {
      const h = 20;
      if (accent) doc.rect(sumX, sy, sumW, h).fill(GREEN);
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10)
        .fillColor(accent ? '#FFFFFF' : (bold ? DARK : GRAY))
        .text(label, sumX + 10, sy + (bold ? 5 : 5), { width: sumW / 2 - 10, align: 'left' });
      doc.fillColor(accent ? '#FFFFFF' : DARK)
        .text(value, sumX + sumW / 2, sy + (bold ? 5 : 5), { width: sumW / 2 - 10, align: 'right' });
      sy += h;
    };
    sumRow('Subtotal', money(subtotal));
    if (taxAmount > 0) sumRow('GST', money(taxAmount));
    sumRow('Total Paid', money(total), { bold: true, accent: true });

    // ---- Footer ----
    const footerY = doc.page.height - doc.page.margins.bottom - 40;
    doc.lineWidth(0.5).strokeColor(BORDER).moveTo(left, footerY).lineTo(right, footerY).stroke();
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
      .text('Thank you for choosing OnlyIf.', left, footerY + 12, { align: 'center', width: contentWidth });
    doc.fillColor(GRAY).font('Helvetica').fontSize(8)
      .text('This receipt confirms successful payment processing.', left, footerY + 28, { align: 'center', width: contentWidth });

    doc.end();
  } catch (error) {
    console.error('Error generating payment invoice:', error);
    res.status(500).json({ success: false, message: 'Failed to generate payment invoice' });
  }
}));

router.get('/payments/monthly-revenue', asyncHandler(async (req, res) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const monthlyRevenueResult = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    const revenue = monthlyRevenueResult.length > 0 ? monthlyRevenueResult[0].total : 0;
    
    res.json({
      success: true,
      revenue
    });
  } catch (error) {
    console.error('Error fetching monthly revenue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch monthly revenue',
      revenue: 0
    });
  }
}));

router.get('/activity', asyncHandler(async (req, res) => {
  try {
    // Get recent activities from different sources
    const recentProperties = await Property.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('owner', 'name')
      .select('title createdAt status');

    // Include recent buyer/seller registrations
    const recentUsers = await User.find({
      role: { $in: ['buyer', 'seller'] },
      isDeleted: false
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name role createdAt');

    const recentAgents = await User.find({
      role: 'agent',
      isDeleted: false
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .select('name createdAt');

    const recentPayments = await Transaction.find({ status: 'completed' })
      .sort({ createdAt: -1 })
      .limit(3)
      .select('amount createdAt');

    // Format activities
    const activities = [];

    recentProperties.forEach(property => {
      const msg = `New property listed: ${property.title}`;
      activities.push({
        id: `property-${property._id}`,
        type: 'property',
        action: msg,            // keep for frontend compatibility
        message: msg,           // semantic field
        timestamp: property.createdAt,
        status: property.status
      });
    });

    recentUsers.forEach(user => {
      const msg = `New ${user.role} added: ${user.name}`;
      activities.push({
        id: `user-${user._id}`,
        type: 'user',
        action: msg,
        message: msg,
        timestamp: user.createdAt,
        status: 'active'
      });
    });

    recentAgents.forEach(agent => {
      const msg = `Agent registration: ${agent.name}`;
      activities.push({
        id: `agent-${agent._id}`,
        type: 'agent',
        action: msg,
        message: msg,
        timestamp: agent.createdAt,
        status: 'pending'
      });
    });

    recentPayments.forEach(payment => {
      const msg = `Payment received: $${payment.amount}`;
      activities.push({
        id: `payment-${payment._id}`,
        type: 'payment',
        action: msg,
        message: msg,
        timestamp: payment.createdAt,
        status: 'completed'
      });
    });

    // Sort by timestamp and limit to 10
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Wrap under `data` to match frontend expectations
    res.json({
      success: true,
      data: {
        activities: activities.slice(0, 10)
      },
      message: 'Recent activity fetched successfully'
    });
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activity',
      data: { activities: [] }
    });
  }
}));
router.delete('/properties/:id', asyncHandler(deleteProperty));
router.post('/assignments/reset', asyncHandler(resetAssignments));
router.get('/terms-logs', asyncHandler(getTermsLogs));

// New stats endpoints as requested
router.get('/stats/properties', asyncHandler(async (req, res) => {
  try {
    const total = await Property.countDocuments({ isDeleted: false });
    
    res.json({
      success: true,
      total
    });
  } catch (error) {
    console.error('Error fetching properties stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch properties stats'
    });
  }
}));

router.get('/stats/agents', asyncHandler(async (req, res) => {
  try {
    const total = await User.countDocuments({ 
      role: 'agent', 
      isDeleted: false 
    });
    
    res.json({
      success: true,
      total
    });
  } catch (error) {
    console.error('Error fetching agents stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agents stats'
    });
  }
}));

router.get('/stats/users', asyncHandler(async (req, res) => {
  try {
    const total = await User.countDocuments({ 
      role: { $in: ['buyer', 'seller'] }, 
      isDeleted: false 
    });
    
    res.json({
      success: true,
      total
    });
  } catch (error) {
    console.error('Error fetching users stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users stats'
    });
  }
}));

// Add missing agents endpoint
router.get('/agents', asyncHandler(async (req, res) => {
  try {
    const agents = await User.find({ role: 'agent', isDeleted: false })
      .select('name email phone isActive isSuspended agentStatus createdAt agentProfile avatar profileImage')
      .sort({ createdAt: -1 });
    
    // Transform the data to match frontend expectations
    const transformedAgents = agents.map(agent => {
      const approvalStatus = agent.agentStatus || (agent.isActive ? 'approved' : 'pending');
      const displayStatus = agent.isSuspended ? 'suspended' : approvalStatus;

      return {
        _id: agent._id,  // Use _id instead of id for consistency
        id: agent._id,   // Keep id for backward compatibility
        name: agent.name,
        email: agent.email,
        phone: agent.phone || agent.agentProfile?.phone || '',
        licenseNumber: agent.agentProfile?.licenseNumber || '',
        status: displayStatus,
        agentStatus: agent.agentStatus || approvalStatus,
        joinedDate: agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : '',
        totalListings: 0, // You can calculate this from properties
        totalSales: 0, // You can calculate this from transactions
        rating: 5, // Default rating
        profileImage: agent.profileImage || agent.avatar || ''
      };
    });
    
    res.json({
      success: true,
      data: transformedAgents
    });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agents'
    });
  }
}));

// Get all properties (admin only)
router.get('/properties', asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const search = req.query.search;
    
    // Build query
    let query = { isDeleted: false };
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'address.street': { $regex: search, $options: 'i' } },
        { 'address.city': { $regex: search, $options: 'i' } },
        { 'address.state': { $regex: search, $options: 'i' } },
        { 'address.zipCode': { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // If limit is 0, return all properties without pagination
    if (limit === 0) {
      const properties = await Property.find(query)
        .populate('owner', 'name email phone')
        .populate('assignedAgent', 'name email')
        .populate('agents.agent', 'name email')
        .sort({ createdAt: -1 });
      
      return res.json({
        success: true,
        data: properties,
        message: 'Properties fetched successfully'
      });
    }
    
    // With pagination
    const skip = (page - 1) * limit;
    const properties = await Property.find(query)
      .populate('owner', 'name email phone')
      .populate('assignedAgent', 'name email')
      .populate('agents.agent', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Property.countDocuments(query);
    
    res.json({
      success: true,
      data: properties,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      message: 'Properties fetched successfully'
    });
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch properties'
    });
  }
}));

// Add these routes after the existing properties route
router.patch('/properties/:id/approve', asyncHandler(async (req, res) => {
  try {
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'active',  // Changed from 'approved' to 'active'
        approvedAt: new Date(),
        approvedBy: req.user._id
      },
      { new: true }
    ).populate('owner', 'name email phone')
     .populate('assignedAgent', 'name email')
   .populate('agents.agent', 'name email');

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    res.json({
      success: true,
      data: property,
      message: 'Property approved and activated successfully'
    });
  } catch (error) {
    console.error('Error approving property:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve property'
    });
  }
}));

router.patch('/properties/:id/reject', asyncHandler(async (req, res) => {
  try {
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected' },
      { new: true }
    );
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    res.json({
      success: true,
      data: property,
      message: 'Property rejected successfully'
    });
  } catch (error) {
    console.error('Error rejecting property:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject property'
    });
  }
}));

router.patch('/properties/:id/assign-agent', asyncHandler(async (req, res) => {
  try {
    const { agentId } = req.body;
    const propertyId = req.params.id;
    
    // Enhanced validation
    console.log('=== AGENT ASSIGNMENT DEBUG ===');
    console.log('Property ID:', propertyId);
    console.log('Agent ID:', agentId);
    console.log('User:', req.user ? { id: req.user.id, role: req.user.role } : 'No user');
    
    // Validate required fields
    if (!agentId) {
      console.log('ERROR: Missing agentId');
      return res.status(400).json({
        success: false,
        message: 'Agent ID is required'
      });
    }

    // Validate ObjectId format
    if (!agentId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('ERROR: Invalid agentId format');
      return res.status(400).json({
        success: false,
        message: 'Invalid agent ID format'
      });
    }

    // Verify agent exists and has correct role
    console.log('Verifying agent exists...');
    const agent = await User.findById(agentId);
    if (!agent) {
      console.log('ERROR: Agent not found');
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    if (agent.role !== 'agent') {
      console.log('ERROR: User is not an agent, role:', agent.role);
      return res.status(400).json({
        success: false,
        message: 'Selected user is not an agent'
      });
    }

    console.log('Agent verified:', { id: agent._id, name: agent.name, role: agent.role });

    // Find the property
    console.log('Searching for property...');
    const property = await Property.findById(propertyId);
    
    if (!property) {
      console.log('ERROR: Property not found');
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    console.log('Property found:', { id: property._id, title: property.title });

    // Ensure agents array exists
    property.agents = property.agents || [];

    // Check if agent is already assigned (active)
    const existingAgentIndex = property.agents.findIndex(
      agentEntry => agentEntry.agent.toString() === agentId && agentEntry.isActive
    );

    if (existingAgentIndex !== -1) {
      console.log('ERROR: Agent already assigned');
      return res.status(400).json({
        success: false,
        message: 'Agent is already assigned to this property'
      });
    }

    // Deactivate any previously active agents
    property.agents = property.agents.map(entry => ({
      ...entry,
      isActive: false
    }));

    // Update the primary assignedAgent field to reflect reassignment
    property.assignedAgent = agentId;

    // Add new agent to the agents array as active
    const newAgent = {
      agent: agentId,
      role: 'listing',
      commissionRate: 3,
      assignedAt: new Date(),
      assignedBy: req.user.id,
      isActive: true
    };
    
    console.log('Adding agent:', newAgent);
    property.agents.push(newAgent);

    // Save the property with validation
    console.log('Saving property...');
    const savedProperty = await property.save({ validateBeforeSave: true });
    console.log('Property saved successfully');

    // Populate the agent details for response
    await savedProperty.populate('agents.agent', 'name email');
    await savedProperty.populate('assignedAgent', 'name email');
    console.log('=== ASSIGNMENT SUCCESSFUL ===');

    res.json({
      success: true,
      data: savedProperty,
      message: 'Agent assigned successfully'
    });
  } catch (error) {
    console.error('=== ASSIGNMENT ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error: ' + error.message,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to assign agent',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

router.patch('/properties/:id', asyncHandler(async (req, res) => {
  try {
    const property = await Property.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('owner', 'name email')
     .populate('agents.agent', 'name email'); // Fixed: populate agents array instead of assignedAgent
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    res.json({
      success: true,
      data: property,
      message: 'Property updated successfully'
    });
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update property'
    });
  }
}));

// Add agent status update route
router.patch('/agents/:id/status', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Validate status
    const validStatuses = ['pending', 'approved', 'rejected', 'suspended'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: pending, approved, rejected, suspended'
      });
    }
    
    // Map status to User model fields
    let updateFields = {};
    switch (status) {
      case 'suspended':
        updateFields = {
          isSuspended: true,
          isActive: false,
          suspendedAt: new Date(),
          suspendedBy: req.user.id
        };
        break;
      case 'approved':
        updateFields = {
          agentStatus: 'approved',
          isSuspended: false,
          isActive: true,
          suspendedAt: null,
          suspendedBy: null,
          suspensionReason: null
        };
        break;
      case 'pending':
        updateFields = {
          agentStatus: 'pending',
          isSuspended: false,
          isActive: true,
          suspendedAt: null,
          suspendedBy: null,
          suspensionReason: null
        };
        break;
      case 'rejected':
        updateFields = {
          agentStatus: 'rejected',
          isSuspended: false,
          isActive: true,
          suspendedAt: null,
          suspendedBy: null,
          suspensionReason: null
        };
        break;
    }
    
    // Find and update the agent - ONLY agents, not other user types
    const agent = await User.findOneAndUpdate(
      { _id: id, role: 'agent', isDeleted: false },
      updateFields,
      { new: true }
    ).select('name email isActive isSuspended agentStatus role');
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or user is not an agent'
      });
    }
    
    // Transform response to match frontend expectations
    const transformedAgent = {
      id: agent._id,
      name: agent.name,
      email: agent.email,
      status: agent.isSuspended ? 'suspended' : (agent.agentStatus || (agent.isActive ? 'approved' : 'pending')),
      agentStatus: agent.agentStatus || (agent.isActive ? 'approved' : 'pending')
    };
    
    res.json({
      success: true,
      data: transformedAgent,
      message: `Agent status updated to ${status} successfully`
    });
  } catch (error) {
    console.error('Error updating agent status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update agent status'
    });
  }
}));

// Add agent delete route
router.delete('/agents/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // Soft delete the agent - ONLY agents, not other user types
    const agent = await User.findOneAndUpdate(
      { _id: id, role: 'agent', isDeleted: false },
      { 
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id
      },
      { new: true }
    );
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or user is not an agent'
      });
    }
    
    res.json({
      success: true,
      message: 'Agent deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete agent'
    });
  }
}));

module.exports = router;
