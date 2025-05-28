const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { validateUser, validateLogin } = require('../utils/validation');
const { AppError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const router = express.Router();

// Strict rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { message: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to auth routes
router.use(authLimiter);

// Register
router.post('/register', async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = validateUser(req.body);
    if (error) {
      logger.warn('Registration validation failed:', { 
        errors: error.details,
        ip: req.ip 
      });
      return next(new AppError(error.details[0].message, 400));
    }

    const { name, email, password, role, authorityId, address, certifications } = value;
    
    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      logger.warn('Registration attempt with existing email:', { 
        email: email.toLowerCase(), 
        ip: req.ip 
      });
      return next(new AppError('User already exists', 400));
    }

    // Hash password with stronger salt rounds for production
    const saltRounds = process.env.NODE_ENV === 'production' ? 12 : 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      authorityId,
      address,
      certifications,
      registrationIp: req.ip,
      lastLoginIp: req.ip
    });

    await user.save();

    // Log successful registration
    logger.logUserAction(user._id, 'REGISTER', {
      role,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Generate JWT with more secure options
    const token = jwt.sign(
      { 
        userId: user._id, 
        role: user.role,
        tokenVersion: user.tokenVersion || 1
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        issuer: 'retrofitlink-api',
        audience: 'retrofitlink-client'
      }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        authorityId: user.authorityId,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    next(error);
  }
});

// Login
router.post('/login', async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = validateLogin(req.body);
    if (error) {
      logger.warn('Login validation failed:', { 
        errors: error.details,
        ip: req.ip 
      });
      return next(new AppError(error.details[0].message, 400));
    }

    const { email, password } = value;

    // Find user with security fields
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+password +failedLoginAttempts +lockUntil');
    
    if (!user) {
      logger.warn('Login attempt with non-existent email:', { 
        email: email.toLowerCase(), 
        ip: req.ip 
      });
      return next(new AppError('Invalid credentials', 401));
    }

    // Check if account is locked
    if (user.isLocked) {
      logger.warn('Login attempt on locked account:', { 
        userId: user._id, 
        ip: req.ip 
      });
      return next(new AppError('Account temporarily locked due to too many failed login attempts', 423));
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Increment failed attempts
      await user.incFailedAttempts();
      
      logger.warn('Failed login attempt:', { 
        userId: user._id, 
        ip: req.ip,
        attempts: user.failedLoginAttempts + 1
      });
      
      return next(new AppError('Invalid credentials', 401));
    }

    // Reset failed attempts on successful login
    if (user.failedLoginAttempts > 0) {
      await User.updateOne(
        { _id: user._id },
        { $unset: { failedLoginAttempts: 1, lockUntil: 1 } }
      );
    }

    // Update last login info
    await User.updateOne(
      { _id: user._id },
      { 
        $set: { 
          lastLogin: new Date(),
          lastLoginIp: req.ip
        }
      }
    );

    // Log successful login
    logger.logUserAction(user._id, 'LOGIN', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Generate JWT
    const token = jwt.sign(
      { 
        userId: user._id, 
        role: user.role,
        tokenVersion: user.tokenVersion || 1
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        issuer: 'retrofitlink-api',
        audience: 'retrofitlink-client'
      }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        authorityId: user.authorityId,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    next(error);
  }
});

// Logout endpoint (for token blacklisting if implemented)
router.post('/logout', async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      // In a production system, you might want to blacklist the token
      // or increment the user's tokenVersion to invalidate all tokens
      const decoded = jwt.decode(token);
      if (decoded?.userId) {
        logger.logUserAction(decoded.userId, 'LOGOUT', {
          ip: req.ip
        });
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    next(error);
  }
});

module.exports = router;
