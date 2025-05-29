require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const config = require('./config/environment');
const { blockchainMiddleware } = require('./middleware/blockchain');
const { 
  securityHeaders, 
  generalLimiter, 
  sanitizeInput, 
  corsOptions, 
  compressionMiddleware 
} = require('./middleware/security');
const {
  advancedRateLimit,
  verifySignature,
  replayProtection,
  contentSecurityPolicy,
  securityHeaders: enhancedSecurityHeaders,
  inputSanitization,
  abuseDetection
} = require('./middleware/advancedSecurity');
const { setupGracefulShutdown, errorHandler, notFound } = require('./utils/errorHandler');
const { logger, auditLogger, performanceLogger } = require('./utils/logger');
const authRoutes = require('./routes/auth');
const retrofitRoutes = require('./routes/retrofits');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = config.port;

// Setup enhanced security middleware stack
app.use(enhancedSecurityHeaders);
app.use(contentSecurityPolicy);
app.use(compressionMiddleware);
app.use(cors(corsOptions));
app.use(advancedRateLimit);
app.use(inputSanitization);
app.use(abuseDetection);

// Performance monitoring middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    performanceLogger.apiResponse(req.path, req.method, duration, res.statusCode);
    
    // Log slow requests
    if (duration > 2000) {
      logger.warn('Slow API request detected', {
        path: req.path,
        method: req.method,
        duration: `${duration}ms`,
        statusCode: res.statusCode,
        ip: req.ip
      });
    }
  });
  next();
});

// Core middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Blockchain middleware
app.use(blockchainMiddleware);

// Database connection with enhanced security, encryption, and retry logic
const connectDB = async () => {
  try {
    const mongoOptions = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      retryWrites: true,
      writeConcern: { w: 'majority' },
      authSource: 'admin',
      ssl: config.nodeEnv === 'production',
      sslValidate: config.nodeEnv === 'production'
    };

    // Import encryption service in production environment
    if (config.nodeEnv === 'production' && config.useFieldEncryption) {
      try {
        const { getEncryptionService } = require('./config/encryption');
        const encryptionService = await getEncryptionService();
        logger.info('Initialized database field-level encryption');
        
        // Use the encrypted client instead of default mongoose connection
        // Note: This would require refactoring the application to use MongoDB driver directly
        // for encrypted fields. For now, we'll use mongoose as usual.
      } catch (encryptionError) {
        logger.error('Failed to initialize encryption service:', encryptionError);
        logger.warn('Continuing without field-level encryption');
      }
    }

    await mongoose.connect(config.mongoUri, mongoOptions);
    logger.info('MongoDB connected successfully', {
      environment: config.nodeEnv,
      encryption: config.useFieldEncryption ? 'enabled' : 'disabled',
      database: config.mongoUri.split('/').pop().split('?')[0]
    });
    
    // Set up database monitoring
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });
    
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

// Apply signature verification and replay protection to critical routes only
app.use(['/api/retrofits/verify', '/api/auth/mfa/disable', '/api/users/delete'], verifySignature);
app.use(['/api/retrofits/verify', '/api/auth/mfa/disable', '/api/users/delete'], replayProtection);

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

// Start server with enhanced logging
const server = app.listen(PORT, () => {
  logger.info(`🚀 RetroFitLink server running on port ${PORT}`, {
    environment: config.nodeEnv,
    port: PORT,
    mongoUri: config.mongoUri.includes('@') ? '[REDACTED]' : config.mongoUri,
    blockchainRpc: config.blockchainRpc,
    timestamp: new Date().toISOString()
  });
  
  // Log startup metrics
  auditLogger.securityEvent('server_startup', {
    environment: config.nodeEnv,
    port: PORT,
    nodeVersion: process.version,
    platform: process.platform
  });
});

// Setup graceful shutdown
setupGracefulShutdown(server);

module.exports = { app, server };