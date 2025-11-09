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
const { Server } = require('socket.io'); // ✅ import Server from socket.io
const bodyParser = require('body-parser');

const path = require('path');
require('dotenv').config();

// Database connection
const connectDB = require('./config/db');

// Middleware imports
const { errorHandler } = require('./middleware/errorHandler');
const { generalLimiter, authLimiter, messageLimiter } = require('./middleware/rateLimitMiddleware');

// Route imports
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

// Connect to database
connectDB();

const app = express();
// ✅ Stripe webhook must use raw body — mount first
app.use(
  '/api/webhook/stripe-webhook',
  bodyParser.raw({ type: 'application/json' }),
  webhookRoutes
);
const server = http.createServer(app); // IMPORTANT
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3010'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Make io available to routes/controllers if needed
app.locals.io = io;

// Attach socket.io
// socketConnection(io, app);
app.set('connectedUsers', []);

// Enhanced CORS configuration for frontend at localhost:3010
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:3010',
    'http://127.0.0.1:3010',
    'http://127.0.0.1:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Additional CORS headers for static files and all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3010');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Configure helmet with relaxed settings for development
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rate limiting
app.use(generalLimiter);

// Serve static files from uploads directory with explicit CORS headers
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3010');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
}, express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path) => {
    res.set('Access-Control-Allow-Origin', 'http://localhost:3010');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API health check endpoints
app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is working 🚀'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is working 🚀'
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chatting', chatRoutes);
app.use('/api/invoices', invoiceRoutes);

// ✅ Normal routes can use JSON parser
app.use('/api/payment', paymentRoutes);
socketConnection(io,app);

app.use('/api/properties', propertyRoutes);
// The admin routes should be mounted like this:
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
// Public settings endpoint (e.g., maintenance mode)
app.use('/api/settings', settingsRoutes);

// Catch all handler
app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Uploads directory: ${path.join(__dirname, 'uploads')}`);
  console.log(`🌐 CORS enabled for: http://localhost:3010`);
});

module.exports = app;