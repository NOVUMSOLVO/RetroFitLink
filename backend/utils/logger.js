const winston = require('winston');
const path = require('path');

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for console output
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

winston.addColors(logColors);

// Create log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    if (info.stack) {
      return `${info.timestamp} ${info.level}: ${info.message}\n${info.stack}`;
    }
    return `${info.timestamp} ${info.level}: ${info.message}`;
  })
);

// Create file format (without colors)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports array
const transports = [
  // Console transport
  new winston.transports.Console({
    format: logFormat,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  })
];

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  const logDir = process.env.LOG_FILE_PATH || './logs';
  
  transports.push(
    // Error log file
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    
    // Combined log file
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: fileFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format: fileFormat,
  transports,
  exceptionHandlers: [
    new winston.transports.Console({ format: logFormat }),
    ...(process.env.NODE_ENV === 'production' ? [
      new winston.transports.File({
        filename: path.join(process.env.LOG_FILE_PATH || './logs', 'exceptions.log'),
        format: fileFormat
      })
    ] : [])
  ],
  rejectionHandlers: [
    new winston.transports.Console({ format: logFormat }),
    ...(process.env.NODE_ENV === 'production' ? [
      new winston.transports.File({
        filename: path.join(process.env.LOG_FILE_PATH || './logs', 'rejections.log'),
        format: fileFormat
      })
    ] : [])
  ]
});

// Stream for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

// Enhanced logging methods with context
const createContextLogger = (context) => {
  return {
    error: (message, meta = {}) => logger.error(message, { context, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { context, ...meta }),
    info: (message, meta = {}) => logger.info(message, { context, ...meta }),
    http: (message, meta = {}) => logger.http(message, { context, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { context, ...meta })
  };
};

// Security audit logger
const auditLogger = {
  login: (userId, ip, success = true) => {
    logger.info('User login attempt', {
      userId,
      ip,
      success,
      type: 'auth',
      action: 'login'
    });
  },
  
  logout: (userId, ip) => {
    logger.info('User logout', {
      userId,
      ip,
      type: 'auth',
      action: 'logout'
    });
  },
  
  apiAccess: (userId, endpoint, method, statusCode, ip) => {
    logger.info('API access', {
      userId,
      endpoint,
      method,
      statusCode,
      ip,
      type: 'api',
      action: 'access'
    });
  },
  
  dataAccess: (userId, resource, action, ip) => {
    logger.info('Data access', {
      userId,
      resource,
      action,
      ip,
      type: 'data',
      action: 'access'
    });
  },
  
  securityEvent: (event, details, ip) => {
    logger.warn('Security event', {
      event,
      details,
      ip,
      type: 'security',
      action: 'alert'
    });
  }
};

// Performance logger
const performanceLogger = {
  apiResponse: (endpoint, method, duration, statusCode) => {
    logger.info('API performance', {
      endpoint,
      method,
      duration,
      statusCode,
      type: 'performance'
    });
  },
  
  dbQuery: (query, duration, recordCount) => {
    logger.debug('Database query', {
      query: query.slice(0, 100), // Truncate long queries
      duration,
      recordCount,
      type: 'performance'
    });
  }
};

// Business logic logger
const businessLogger = {
  retrofitCreated: (retrofitId, userId, propertyId) => {
    logger.info('Retrofit project created', {
      retrofitId,
      userId,
      propertyId,
      type: 'business',
      action: 'create'
    });
  },
  
  retrofitStatusChanged: (retrofitId, oldStatus, newStatus, userId) => {
    logger.info('Retrofit status changed', {
      retrofitId,
      oldStatus,
      newStatus,
      userId,
      type: 'business',
      action: 'status_change'
    });
  },
  
  blockchainTransaction: (txHash, contractAddress, action, userId) => {
    logger.info('Blockchain transaction', {
      txHash,
      contractAddress,
      action,
      userId,
      type: 'blockchain',
      action: 'transaction'
    });
  }
};

module.exports = {
  logger,
  createContextLogger,
  auditLogger,
  performanceLogger,
  businessLogger
};
