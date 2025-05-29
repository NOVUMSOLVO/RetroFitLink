const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { AppError } = require('../utils/errorHandler');
const logger = require('../utils/logger');

/**
 * Advanced rate limiting with role-based limits
 */
const advancedRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    // Role-based rate limits
    if (req.user?.role === 'Local Authority') return 1000;
    if (req.user?.role === 'Installer') return 500;
    if (req.user?.role === 'Resident') return 200;
    return 100; // Anonymous users
  },
  keyGenerator: (req) => {
    // Combine IP and user ID for rate limiting
    const userId = req.user?.userId || 'anonymous';
    return `${req.ip}:${userId}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    error: 'Too many requests, please try again later.',
    retryAfter: 15 * 60 // 15 minutes in seconds
  },
  // Skip rate limiting for health checks
  skip: (req) => req.path === '/api/health'
});

/**
 * Request signature verification for critical operations
 */
const verifySignature = (req, res, next) => {
  // Only apply to critical operations
  const criticalEndpoints = [
    '/api/retrofits/verify',
    '/api/auth/mfa/disable',
    '/api/users/delete'
  ];

  if (!criticalEndpoints.some(endpoint => req.path.startsWith(endpoint))) {
    return next();
  }

  const signature = req.headers['x-signature'];
  if (!signature) {
    return next(new AppError('Signature required for this operation', 400));
  }

  try {
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', process.env.API_SECRET)
      .update(payload)
      .digest('hex');
    
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), 
                                Buffer.from(expectedSignature, 'hex'))) {
      logger.warn('Invalid signature detected:', {
        endpoint: req.path,
        ip: req.ip,
        userId: req.user?.userId
      });
      return next(new AppError('Invalid signature', 401));
    }

    next();
  } catch (error) {
    logger.error('Signature verification error:', error);
    return next(new AppError('Signature verification failed', 500));
  }
};

/**
 * Request replay protection
 */
const replayProtection = (() => {
  const requestCache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Clean up cache periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of requestCache.entries()) {
      if (now - timestamp > CACHE_TTL) {
        requestCache.delete(key);
      }
    }
  }, 60 * 1000); // Run every minute

  return (req, res, next) => {
    const timestamp = req.headers['x-timestamp'];
    const nonce = req.headers['x-nonce'];

    if (!timestamp || !nonce) {
      return next(new AppError('Timestamp and nonce headers required', 400));
    }

    // Check timestamp (must be within 5 minutes)
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    if (Math.abs(now - requestTime) > CACHE_TTL) {
      return next(new AppError('Request timestamp is too old or too far in the future', 400));
    }

    // Check for replay
    const requestKey = `${req.ip}:${nonce}:${timestamp}`;
    if (requestCache.has(requestKey)) {
      logger.warn('Replay attack detected:', {
        ip: req.ip,
        nonce,
        timestamp,
        userId: req.user?.userId
      });
      return next(new AppError('Duplicate request detected', 400));
    }

    // Store request
    requestCache.set(requestKey, now);
    next();
  };
})();

/**
 * Content Security Policy middleware
 */
const contentSecurityPolicy = (req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' wss: https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );
  next();
};

/**
 * Additional security headers
 */
const securityHeaders = (req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Enforce HTTPS
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
};

/**
 * Input validation and sanitization
 */
const inputSanitization = (req, res, next) => {
  // Remove potential XSS patterns
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    
    // Remove script tags and event handlers
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '')
      .replace(/javascript:/gi, '');
  };

  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = sanitizeString(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };

  if (req.body) {
    sanitizeObject(req.body);
  }

  if (req.query) {
    sanitizeObject(req.query);
  }

  next();
};

/**
 * API abuse detection
 */
const abuseDetection = (() => {
  const suspiciousActivity = new Map();
  const ABUSE_THRESHOLD = 50; // requests
  const ABUSE_WINDOW = 5 * 60 * 1000; // 5 minutes
  const BLOCK_DURATION = 30 * 60 * 1000; // 30 minutes

  return (req, res, next) => {
    const clientKey = req.ip;
    const now = Date.now();

    let activity = suspiciousActivity.get(clientKey);
    if (!activity) {
      activity = { count: 0, firstRequest: now, blocked: false, blockUntil: 0 };
      suspiciousActivity.set(clientKey, activity);
    }

    // Check if client is currently blocked
    if (activity.blocked && now < activity.blockUntil) {
      logger.warn('Blocked client attempted access:', {
        ip: req.ip,
        endpoint: req.path,
        remainingBlockTime: activity.blockUntil - now
      });
      return res.status(429).json({
        error: 'IP temporarily blocked due to suspicious activity',
        unblockTime: new Date(activity.blockUntil).toISOString()
      });
    }

    // Reset if outside time window
    if (now - activity.firstRequest > ABUSE_WINDOW) {
      activity.count = 1;
      activity.firstRequest = now;
      activity.blocked = false;
    } else {
      activity.count++;
    }

    // Check for abuse
    if (activity.count > ABUSE_THRESHOLD) {
      activity.blocked = true;
      activity.blockUntil = now + BLOCK_DURATION;
      
      logger.error('API abuse detected - blocking client:', {
        ip: req.ip,
        requestCount: activity.count,
        timeWindow: ABUSE_WINDOW / 1000,
        blockDuration: BLOCK_DURATION / 1000
      });

      return res.status(429).json({
        error: 'Too many requests - IP temporarily blocked',
        unblockTime: new Date(activity.blockUntil).toISOString()
      });
    }

    suspiciousActivity.set(clientKey, activity);
    next();
  };
})();

module.exports = {
  advancedRateLimit,
  verifySignature,
  replayProtection,
  contentSecurityPolicy,
  securityHeaders,
  inputSanitization,
  abuseDetection
};
