const { logger, auditLogger } = require('../utils/logger');

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400);
    this.details = details;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
  }
}

class BlockchainError extends AppError {
  constructor(message = 'Blockchain operation failed', details = {}) {
    super(message, 500);
    this.details = details;
  }
}

// Error handling for different types of errors
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new ValidationError(message);
};

const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const message = `${field} '${value}' already exists`;
  return new ConflictError(message);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => ({
    field: el.path,
    message: el.message
  }));
  const message = 'Invalid input data';
  return new ValidationError(message, errors);
};

const handleJWTError = () => new AuthenticationError('Invalid token');

const handleJWTExpiredError = () => new AuthenticationError('Token expired');

// Send error response in development
const sendErrorDev = (err, req, res) => {
  // Log the error
  logger.error('Error in development:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  });
};

// Send error response in production
const sendErrorProd = (err, req, res) => {
  // Log the error
  logger.error('Production error:', {
    error: err.message,
    statusCode: err.statusCode,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.userId,
    userAgent: req.get('User-Agent')
  });

  // Operational, trusted error: send message to client
  if (err.isOperational) {
    const errorResponse = {
      status: err.status,
      message: err.message,
      timestamp: new Date().toISOString(),
      requestId: req.id || `req_${Date.now()}`
    };

    // Add details for validation errors
    if (err instanceof ValidationError && err.details?.length) {
      errorResponse.details = err.details;
    }

    // Log security events
    if (err.statusCode === 401 || err.statusCode === 403) {
      auditLogger.securityEvent('Authentication/Authorization failure', {
        message: err.message,
        statusCode: err.statusCode,
        userId: req.user?.userId
      }, req.ip);
    }

    res.status(err.statusCode).json(errorResponse);
  } else {
    // Programming or other unknown error: don't leak error details
    logger.error('Unexpected error:', {
      error: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.user?.userId
    });

    res.status(500).json({
      status: 'error',
      message: 'Something went wrong!',
      timestamp: new Date().toISOString(),
      requestId: req.id || `req_${Date.now()}`
    });
  }
};

// Global error handling middleware
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // Handle specific error types
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, req, res);
  }
};

// Async error wrapper
const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler for unmatched routes
const notFoundHandler = (req, res, next) => {
  const err = new NotFoundError(`Can't find ${req.originalUrl} on this server`);
  next(err);
};

// Graceful shutdown handler
const gracefulShutdown = (server) => {
  return (signal) => {
    logger.info(`Received ${signal}. Graceful shutdown...`);
    
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force close server after 30 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 30000);
  };
};

// Unhandled rejection handler
const unhandledRejectionHandler = (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise,
    reason: reason.stack || reason
  });
  
  // Close server & exit process
  process.exit(1);
};

// Uncaught exception handler
const uncaughtExceptionHandler = (err) => {
  logger.error('Uncaught Exception:', {
    error: err.message,
    stack: err.stack
  });
  
  // Close server & exit process
  process.exit(1);
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  BlockchainError,
  globalErrorHandler,
  catchAsync,
  notFoundHandler,
  gracefulShutdown,
  unhandledRejectionHandler,
  uncaughtExceptionHandler
};
