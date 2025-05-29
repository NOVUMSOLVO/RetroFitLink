const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { validateUser, validateLogin } = require('../utils/validation');
const { AppError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const MFAService = require('../utils/mfa');
const { authenticateToken } = require('../middleware/auth');
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

    // Check if MFA is enabled
    if (user.mfaEnabled) {
      // Return partial success - require MFA verification
      logger.logUserAction(user._id, 'LOGIN_MFA_REQUIRED', {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.json({
        success: true,
        requiresMFA: true,
        message: 'Please provide your 2FA verification code',
        user: {
          id: user._id,
          email: user.email,
          name: user.name
        }
      });
    }

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
        lastLogin: user.lastLogin,
        mfaEnabled: user.mfaEnabled
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

// MFA Setup - Generate QR code and backup codes
router.post('/mfa/setup', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    if (user.mfaEnabled) {
      return next(new AppError('MFA is already enabled', 400));
    }

    // Generate MFA secret and QR code
    const mfaData = await MFAService.generateMFASecret(user.email, user.name);

    // Store the secret temporarily (user needs to verify before enabling)
    await User.updateOne(
      { _id: user._id },
      { mfaSecret: mfaData.secret }
    );

    logger.logUserAction(user._id, 'MFA_SETUP_INITIATED', {
      ip: req.ip
    });

    res.json({
      success: true,
      qrCode: mfaData.qrCode,
      manualEntryKey: mfaData.manualEntryKey,
      backupCodes: mfaData.backupCodes
    });
  } catch (error) {
    logger.error('MFA setup error:', error);
    next(error);
  }
});

// MFA Verify and Enable
router.post('/mfa/verify', authenticateToken, async (req, res, next) => {
  try {
    const { token, backupCodes } = req.body;

    if (!token || !backupCodes || !Array.isArray(backupCodes)) {
      return next(new AppError('TOTP token and backup codes are required', 400));
    }

    const user = await User.findById(req.user.userId).select('+mfaSecret');
    if (!user || !user.mfaSecret) {
      return next(new AppError('MFA setup not initiated', 400));
    }

    // Verify the TOTP token
    const isValidToken = MFAService.verifyTOTP(token, user.mfaSecret);
    if (!isValidToken) {
      logger.warn('Invalid MFA token during setup:', {
        userId: user._id,
        ip: req.ip
      });
      return next(new AppError('Invalid verification code', 400));
    }

    // Hash backup codes for secure storage
    const hashedBackupCodes = MFAService.hashBackupCodes(backupCodes);

    // Enable MFA
    await User.updateOne(
      { _id: user._id },
      {
        mfaEnabled: true,
        mfaBackupCodes: hashedBackupCodes
      }
    );

    logger.logUserAction(user._id, 'MFA_ENABLED', {
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'MFA enabled successfully'
    });
  } catch (error) {
    logger.error('MFA verification error:', error);
    next(error);
  }
});

// MFA Disable
router.post('/mfa/disable', authenticateToken, async (req, res, next) => {
  try {
    const { password, token } = req.body;

    if (!password || !token) {
      return next(new AppError('Password and TOTP token are required', 400));
    }

    const user = await User.findById(req.user.userId)
      .select('+password +mfaSecret +mfaBackupCodes');
    
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    if (!user.mfaEnabled) {
      return next(new AppError('MFA is not enabled', 400));
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      logger.warn('Invalid password during MFA disable:', {
        userId: user._id,
        ip: req.ip
      });
      return next(new AppError('Invalid password', 401));
    }

    // Verify TOTP token
    const isValidToken = MFAService.verifyTOTP(token, user.mfaSecret);
    if (!isValidToken) {
      logger.warn('Invalid MFA token during disable:', {
        userId: user._id,
        ip: req.ip
      });
      return next(new AppError('Invalid verification code', 400));
    }

    // Disable MFA
    await User.updateOne(
      { _id: user._id },
      {
        $unset: {
          mfaSecret: 1,
          mfaBackupCodes: 1
        },
        mfaEnabled: false
      }
    );

    logger.logUserAction(user._id, 'MFA_DISABLED', {
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'MFA disabled successfully'
    });
  } catch (error) {
    logger.error('MFA disable error:', error);
    next(error);
  }
});

// MFA Validate (for login)
router.post('/mfa/validate', async (req, res, next) => {
  try {
    const { email, token, isBackupCode = false } = req.body;

    if (!email || !token) {
      return next(new AppError('Email and verification code are required', 400));
    }

    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+mfaSecret +mfaBackupCodes');

    if (!user || !user.mfaEnabled) {
      return next(new AppError('Invalid request', 400));
    }

    let isValid = false;
    let updatedBackupCodes = user.mfaBackupCodes;

    if (isBackupCode) {
      // Verify backup code
      const verification = MFAService.verifyHashedBackupCode(token, user.mfaBackupCodes);
      isValid = verification.isValid;
      updatedBackupCodes = verification.remainingCodes;

      if (isValid) {
        // Update user's backup codes
        await User.updateOne(
          { _id: user._id },
          { mfaBackupCodes: updatedBackupCodes }
        );
      }
    } else {
      // Verify TOTP token
      isValid = MFAService.verifyTOTP(token, user.mfaSecret);
    }

    if (!isValid) {
      logger.warn('Invalid MFA validation attempt:', {
        userId: user._id,
        isBackupCode,
        ip: req.ip
      });
      return next(new AppError('Invalid verification code', 400));
    }

    // Generate JWT token
    const jwtToken = jwt.sign(
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

    logger.logUserAction(user._id, 'MFA_LOGIN_SUCCESS', {
      isBackupCode,
      ip: req.ip
    });

    res.json({
      success: true,
      token: jwtToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        authorityId: user.authorityId,
        mfaEnabled: user.mfaEnabled
      },
      backupCodesRemaining: updatedBackupCodes.length
    });
  } catch (error) {
    logger.error('MFA validation error:', error);
    next(error);
  }
});

// Get MFA Status
router.get('/mfa/status', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('+mfaBackupCodes');
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    res.json({
      success: true,
      mfaEnabled: user.mfaEnabled,
      backupCodesRemaining: user.mfaBackupCodes ? user.mfaBackupCodes.length : 0
    });
  } catch (error) {
    logger.error('MFA status error:', error);
    next(error);
  }
});

module.exports = router;
