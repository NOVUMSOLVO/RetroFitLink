const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');
const logger = require('../utils/logger');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next(new AppError('Access token required', 401));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'retrofitlink-api',
      audience: 'retrofitlink-client'
    });

    // Check if user still exists and is active
    const user = await User.findById(decoded.userId).select('+tokenVersion');
    if (!user || !user.isActive) {
      return next(new AppError('User not found or inactive', 401));
    }

    // Check token version for logout/security invalidation
    if (decoded.tokenVersion && user.tokenVersion !== decoded.tokenVersion) {
      return next(new AppError('Token has been invalidated', 401));
    }

    // Add user info to request
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      email: user.email,
      name: user.name
    };

    // Log API access for audit
    logger.logApiAccess(req.user.userId, req.method, req.originalUrl, req.ip);

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token', 401));
    } else if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expired', 401));
    } else {
      logger.error('Authentication error:', error);
      return next(new AppError('Authentication failed', 401));
    }
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Unauthorized access attempt:', {
        userId: req.user.userId,
        role: req.user.role,
        requiredRoles: roles,
        endpoint: req.originalUrl
      });
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

// Optional authentication (for public endpoints that enhance with user context)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next(); // Continue without authentication
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'retrofitlink-api',
      audience: 'retrofitlink-client'
    });

    const user = await User.findById(decoded.userId);
    if (user && user.isActive) {
      req.user = {
        userId: decoded.userId,
        role: decoded.role,
        email: user.email,
        name: user.name
      };
    }

    next();
  } catch (error) {
    // Ignore authentication errors for optional auth
    next();
  }
};

// API key authentication for IoT devices
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return next(new AppError('API key required', 401));
  }

  // In production, you'd validate against a database of API keys
  const validApiKeys = process.env.IOT_API_KEYS?.split(',') || [];
  
  if (!validApiKeys.includes(apiKey)) {
    logger.warn('Invalid API key attempt:', {
      apiKey: apiKey.substring(0, 8) + '...',
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return next(new AppError('Invalid API key', 401));
  }

  // Add API key info to request
  req.apiKey = apiKey;
  next();
};

module.exports = { 
  authenticateToken, 
  authorize, 
  optionalAuth, 
  authenticateApiKey 
};
