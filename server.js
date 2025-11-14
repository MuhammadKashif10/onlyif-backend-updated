const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

// Database
const connectDB = require('./config/db');

// Middleware imports
const { errorHandler } = require('./middleware/errorHandler');

// Rate limits
const { generalLimiter } = require('./middleware/rateLimitMiddleware');

// Routes
const authRoutes = require('./routes/authRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const adminRoutes = require('./routes/adminRoutes');
const messageRoutes = require('./routes/messageRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const inspectionRoutes = require('./routes/inspectionRoutes');
const addonRoutes = require('./routes/addonRoutes');
const sellerRoutes = require('./routes/sellerRoutes');
const termsRoutes = require('./routes/termsRoutes');
const testimonialRoutes = require('./routes/testimonialRoutes');
const buyerRoutes = require('./routes/buyerRoutes');
const chatRoutes = require('./routes/chatRoutes');
const agentRoutes = require('./routes/agentRoutes');
const agentsRoutes = require('./routes/agentsRoutes');
const paymentRecordRoutes = require('./routes/paymentRecordRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const socketConnection = require('./config/socketConnection');

// Connect to DB
connectDB();

const app = express();

// Stripe webhook (raw body)
app.use(
  '/api/webhook/stripe-webhook',
  bodyParser.raw({ type: 'application/json' }),
  webhookRoutes
);

const server = http.createServer(app);

// SOCKET.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
  }
});
app.locals.io = io;

app.set('connectedUsers', []);

// ------------------ CORS (Production Ready) ------------------

const corsOptions = {
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Universal Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// -------------------------------------------------------------

// Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use(generalLimiter);

// Serve Static
app.use(
  '/uploads',
  (req, res, next) => {
    res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL);
    next();
  },
  express.static(path.join(__dirname, 'uploads'))
);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is working 🚀',
  });
});

// ------------------ Routes ------------------

app.use('/api/auth', authRoutes);
app.use('/api/chatting', chatRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payment', paymentRoutes);
socketConnection(io, app);

app.use('/api/properties', propertyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/addons', addonRoutes);
app.use('/api/sellers', sellerRoutes);
app.use('/api/terms', termsRoutes);
app.use('/api/testimonials', testimonialRoutes);
app.use('/api/buyer', buyerRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/admin/payment-records', paymentRecordRoutes);
app.use('/api/cash-offers', require('./routes/cashOfferRoutes'));
app.use('/api/settings', settingsRoutes);

// 404 Handler
app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Global Error Handler
app.use(errorHandler);

// ------------------ Start Server ------------------

const PORT = process.env.PORT || 8080; // Railway uses 8080

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 FRONTEND_URL: ${process.env.FRONTEND_URL}`);
});

module.exports = app;
