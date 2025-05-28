require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { blockchainMiddleware } = require('./middleware/blockchain');
const { setupSecurity } = require('./middleware/security');
const { setupGracefulShutdown, errorHandler, notFound } = require('./utils/errorHandler');
const logger = require('./utils/logger');
const authRoutes = require('./routes/auth');
const retrofitRoutes = require('./routes/retrofits');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 5000;

// Setup security middleware first
setupSecurity(app);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logApiRequest(req, res, duration);
  });
  next();
});

// Core middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Blockchain middleware
app.use(blockchainMiddleware);

// Database connection with retry logic
const connectDB = async () => {
  try {
    const mongoOptions = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      retryWrites: true,
      writeConcern: { w: 'majority' }
    };

    await mongoose.connect(process.env.MONGO_URI, mongoOptions);
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Initialize database
connectDB();

// Health check routes (must be before authentication)
app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/retrofits', retrofitRoutes);

// IoT Webhook endpoint with validation
app.post('/api/iot-data', (req, res) => {
  try {
    const { deviceId, timestamp, energyConsumption, temperature, humidity } = req.body;
    
    // Log IoT data for monitoring
    logger.logIoTData({
      deviceId,
      timestamp,
      energyConsumption,
      temperature,
      humidity,
      ip: req.ip
    });
    
    // Process sensor data (placeholder for actual processing logic)
    logger.info('Processed IoT data:', { deviceId, energyConsumption });
    
    res.status(200).json({ 
      success: true, 
      message: 'Data received and processed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('IoT data processing error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  logger.info(`🚀 RetroFitLink server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`MongoDB: ${process.env.MONGO_URI ? 'Connected' : 'Not configured'}`);
});

// Setup graceful shutdown
setupGracefulShutdown(server);

module.exports = { app, server };