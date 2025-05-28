const express = require('express');
const rateLimit = require('express-rate-limit');
const Retrofit = require('../models/Retrofit');
const Property = require('../models/Property');
const { authenticateToken } = require('../middleware/auth');
const { validateRetrofit, validateRetrofitUpdate, validateIoTData } = require('../utils/validation');
const { AppError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const router = express.Router();

// Rate limiting for retrofit operations
const retrofitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { message: 'Too many retrofit requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(retrofitLimiter);

// Get all retrofits (with authorization filtering)
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    let query = {};
    const { page = 1, limit = 20, status, search } = req.query;
    
    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 items per page
    
    // Filter based on user role
    if (req.user.role === 'Resident') {
      // Residents see only their own retrofits
      const properties = await Property.find({ owner: req.user.userId });
      const propertyIds = properties.map(p => p._id);
      query.propertyId = { $in: propertyIds };
    } else if (req.user.role === 'Installer') {
      // Installers see only retrofits they're assigned to
      query.installer = req.user.userId;
    }
    // Local Authority sees all retrofits in their area

    // Apply filters
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { 'propertyDetails.address': { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const retrofits = await Retrofit.find(query)
      .populate('propertyId', 'address owner')
      .populate('installer', 'name email')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);
    
    const total = await Retrofit.countDocuments(query);
    
    // Log analytics
    logger.logBusinessMetric('retrofits_listed', {
      userId: req.user.userId,
      role: req.user.role,
      count: retrofits.length,
      filters: { status, search },
      pagination: { page: pageNum, limit: limitNum }
    });
    
    res.json({
      success: true,
      data: retrofits,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('Error fetching retrofits:', error);
    next(error);
  }
});

// Get specific retrofit by ID
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const retrofit = await Retrofit.findById(req.params.id)
      .populate('propertyId')
      .populate('installer', 'name email certifications');
    
    if (!retrofit) {
      return next(new AppError('Retrofit not found', 404));
    }
    
    // Check authorization
    if (req.user.role === 'Resident') {
      const property = await Property.findOne({ 
        _id: retrofit.propertyId._id, 
        owner: req.user.userId 
      });
      if (!property) {
        return next(new AppError('Access denied', 403));
      }
    } else if (req.user.role === 'Installer' && retrofit.installer._id.toString() !== req.user.userId) {
      return next(new AppError('Access denied', 403));
    }
    
    res.json({
      success: true,
      data: retrofit
    });
  } catch (error) {
    logger.error('Error fetching retrofit:', error);
    next(error);
  }
});

// Create new retrofit
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = validateRetrofit(req.body);
    if (error) {
      logger.warn('Retrofit creation validation failed:', { 
        errors: error.details,
        userId: req.user.userId 
      });
      return next(new AppError(error.details[0].message, 400));
    }

    // Check if user can create retrofits
    if (req.user.role === 'Installer') {
      return next(new AppError('Installers cannot create retrofit projects', 403));
    }

    // Verify property ownership for residents
    if (req.user.role === 'Resident') {
      const property = await Property.findOne({ 
        _id: value.propertyId, 
        owner: req.user.userId 
      });
      if (!property) {
        return next(new AppError('Property not found or access denied', 403));
      }
    }
    
    const retrofit = new Retrofit({
      ...value,
      createdBy: req.user.userId,
      status: 'Planning'
    });
    
    await retrofit.save();
    
    // Log retrofit creation
    logger.logBusinessMetric('retrofit_created', {
      retrofitId: retrofit._id,
      userId: req.user.userId,
      propertyId: value.propertyId,
      estimatedCost: value.estimatedCost
    });
    
    res.status(201).json({
      success: true,
      data: retrofit,
      message: 'Retrofit project created successfully'
    });
  } catch (error) {
    logger.error('Error creating retrofit:', error);
    next(error);
  }
});

// Update retrofit status
router.patch('/:id/status', authenticateToken, async (req, res, next) => {
  try {
    const { error, value } = validateRetrofitUpdate(req.body);
    if (error) {
      return next(new AppError(error.details[0].message, 400));
    }

    const { status } = value;
    const retrofit = await Retrofit.findById(req.params.id);
    
    if (!retrofit) {
      return next(new AppError('Retrofit not found', 404));
    }

    // Check authorization for status updates
    if (req.user.role === 'Installer' && retrofit.installer?.toString() !== req.user.userId) {
      return next(new AppError('Access denied', 403));
    }
    
    const oldStatus = retrofit.status;
    retrofit.status = status;
    retrofit.lastUpdated = new Date();
    
    await retrofit.save();
    
    // Log status change
    logger.logBusinessMetric('retrofit_status_updated', {
      retrofitId: retrofit._id,
      userId: req.user.userId,
      oldStatus,
      newStatus: status
    });
    
    res.json({
      success: true,
      data: retrofit,
      message: `Retrofit status updated to ${status}`
    });
  } catch (error) {
    logger.error('Error updating retrofit status:', error);
    next(error);
  }
});

// Add verification data (IoT sensor readings)
router.post('/:id/verify', authenticateToken, async (req, res, next) => {
  try {
    const { error, value } = validateIoTData(req.body);
    if (error) {
      return next(new AppError(error.details[0].message, 400));
    }

    const { sensorId, reading, readingType } = value;
    const retrofit = await Retrofit.findById(req.params.id);
    
    if (!retrofit) {
      return next(new AppError('Retrofit not found', 404));
    }

    // Check authorization
    if (req.user.role === 'Installer' && retrofit.installer?.toString() !== req.user.userId) {
      return next(new AppError('Access denied', 403));
    }
    
    const verificationEntry = {
      sensorId,
      reading,
      readingType,
      timestamp: new Date(),
      recordedBy: req.user.userId
    };
    
    retrofit.verificationData.push(verificationEntry);
    await retrofit.save();
    
    // Log IoT data submission
    logger.logIoTData({
      retrofitId: retrofit._id,
      sensorId,
      reading,
      readingType,
      userId: req.user.userId
    });
    
    res.json({
      success: true,
      data: retrofit,
      message: 'Verification data added successfully'
    });
  } catch (error) {
    logger.error('Error adding verification data:', error);
    next(error);
  }
});

// Get retrofit analytics (for Local Authority)
router.get('/analytics/summary', authenticateToken, async (req, res, next) => {
  try {
    if (req.user.role !== 'Local Authority') {
      return next(new AppError('Access denied', 403));
    }

    const analytics = await Retrofit.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalCost: { $sum: '$estimatedCost' },
          avgCost: { $avg: '$estimatedCost' }
        }
      }
    ]);

    const totalRetrofits = await Retrofit.countDocuments();
    const completedRetrofits = await Retrofit.countDocuments({ status: 'Completed' });
    
    res.json({
      success: true,
      data: {
        statusBreakdown: analytics,
        totalProjects: totalRetrofits,
        completionRate: totalRetrofits > 0 ? (completedRetrofits / totalRetrofits * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    logger.error('Error fetching analytics:', error);
    next(error);
  }
});

module.exports = router;
