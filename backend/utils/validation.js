const Joi = require('joi');

// Common validation patterns
const patterns = {
  objectId: /^[0-9a-fA-F]{24}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+?[\d\s-()]{10,15}$/,
  postcode: /^[A-Z]{1,2}[0-9]{1,2}[A-Z]?\s?[0-9][A-Z]{2}$/i,
  ethAddress: /^0x[a-fA-F0-9]{40}$/
};

// User validation schemas
const userSchemas = {
  register: Joi.object({
    name: Joi.string()
      .min(2)
      .max(50)
      .required()
      .messages({
        'string.min': 'Name must be at least 2 characters long',
        'string.max': 'Name must not exceed 50 characters',
        'any.required': 'Name is required'
      }),
    
    email: Joi.string()
      .pattern(patterns.email)
      .required()
      .messages({
        'string.pattern.base': 'Please provide a valid email address',
        'any.required': 'Email is required'
      }),
    
    password: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.max': 'Password must not exceed 128 characters',
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
        'any.required': 'Password is required'
      }),
    
    role: Joi.string()
      .valid('Resident', 'Installer', 'LocalAuthority')
      .required()
      .messages({
        'any.only': 'Role must be one of: Resident, Installer, LocalAuthority',
        'any.required': 'Role is required'
      }),
    
    phone: Joi.string()
      .pattern(patterns.phone)
      .optional()
      .messages({
        'string.pattern.base': 'Please provide a valid phone number'
      })
  }),

  login: Joi.object({
    email: Joi.string()
      .pattern(patterns.email)
      .required()
      .messages({
        'string.pattern.base': 'Please provide a valid email address',
        'any.required': 'Email is required'
      }),
    
    password: Joi.string()
      .required()
      .messages({
        'any.required': 'Password is required'
      })
  }),

  updateProfile: Joi.object({
    name: Joi.string()
      .min(2)
      .max(50)
      .optional(),
    
    phone: Joi.string()
      .pattern(patterns.phone)
      .optional()
      .allow(''),
    
    email: Joi.string()
      .pattern(patterns.email)
      .optional()
  })
};

// Property validation schemas
const propertySchemas = {
  create: Joi.object({
    address: Joi.string()
      .min(10)
      .max(200)
      .required()
      .messages({
        'string.min': 'Address must be at least 10 characters long',
        'string.max': 'Address must not exceed 200 characters',
        'any.required': 'Address is required'
      }),
    
    postcode: Joi.string()
      .pattern(patterns.postcode)
      .required()
      .messages({
        'string.pattern.base': 'Please provide a valid UK postcode',
        'any.required': 'Postcode is required'
      }),
    
    propertyType: Joi.string()
      .valid('House', 'Flat', 'Maisonette', 'Bungalow', 'Other')
      .required()
      .messages({
        'any.only': 'Property type must be one of: House, Flat, Maisonette, Bungalow, Other',
        'any.required': 'Property type is required'
      }),
    
    bedrooms: Joi.number()
      .integer()
      .min(1)
      .max(20)
      .required()
      .messages({
        'number.min': 'Property must have at least 1 bedroom',
        'number.max': 'Property cannot have more than 20 bedrooms',
        'any.required': 'Number of bedrooms is required'
      }),
    
    buildYear: Joi.number()
      .integer()
      .min(1800)
      .max(new Date().getFullYear())
      .optional()
      .messages({
        'number.min': 'Build year cannot be before 1800',
        'number.max': `Build year cannot be in the future`
      }),
    
    floorArea: Joi.number()
      .positive()
      .max(10000)
      .optional()
      .messages({
        'number.positive': 'Floor area must be a positive number',
        'number.max': 'Floor area cannot exceed 10,000 square meters'
      }),
    
    localAuthority: Joi.string()
      .min(2)
      .max(100)
      .required()
      .messages({
        'string.min': 'Local authority must be at least 2 characters long',
        'string.max': 'Local authority must not exceed 100 characters',
        'any.required': 'Local authority is required'
      })
  }),

  update: Joi.object({
    address: Joi.string().min(10).max(200).optional(),
    postcode: Joi.string().pattern(patterns.postcode).optional(),
    propertyType: Joi.string().valid('House', 'Flat', 'Maisonette', 'Bungalow', 'Other').optional(),
    bedrooms: Joi.number().integer().min(1).max(20).optional(),
    buildYear: Joi.number().integer().min(1800).max(new Date().getFullYear()).optional(),
    floorArea: Joi.number().positive().max(10000).optional(),
    localAuthority: Joi.string().min(2).max(100).optional()
  })
};

// Retrofit validation schemas
const retrofitSchemas = {
  create: Joi.object({
    propertyId: Joi.string()
      .pattern(patterns.objectId)
      .required()
      .messages({
        'string.pattern.base': 'Invalid property ID format',
        'any.required': 'Property ID is required'
      }),
    
    workType: Joi.string()
      .valid('Insulation', 'Heat Pump', 'Solar Panels', 'Boiler', 'Windows', 'Other')
      .required()
      .messages({
        'any.only': 'Work type must be one of: Insulation, Heat Pump, Solar Panels, Boiler, Windows, Other',
        'any.required': 'Work type is required'
      }),
    
    description: Joi.string()
      .min(10)
      .max(1000)
      .required()
      .messages({
        'string.min': 'Description must be at least 10 characters long',
        'string.max': 'Description must not exceed 1000 characters',
        'any.required': 'Description is required'
      }),
    
    estimatedCost: Joi.number()
      .positive()
      .max(1000000)
      .required()
      .messages({
        'number.positive': 'Estimated cost must be a positive number',
        'number.max': 'Estimated cost cannot exceed £1,000,000',
        'any.required': 'Estimated cost is required'
      }),
    
    expectedStartDate: Joi.date()
      .min('now')
      .required()
      .messages({
        'date.min': 'Start date cannot be in the past',
        'any.required': 'Expected start date is required'
      }),
    
    expectedEndDate: Joi.date()
      .greater(Joi.ref('expectedStartDate'))
      .required()
      .messages({
        'date.greater': 'End date must be after start date',
        'any.required': 'Expected end date is required'
      }),
    
    installer: Joi.string()
      .pattern(patterns.objectId)
      .optional()
      .messages({
        'string.pattern.base': 'Invalid installer ID format'
      })
  }),

  updateStatus: Joi.object({
    status: Joi.string()
      .valid('Pending', 'Approved', 'In Progress', 'Completed', 'Rejected', 'Cancelled')
      .required()
      .messages({
        'any.only': 'Status must be one of: Pending, Approved, In Progress, Completed, Rejected, Cancelled',
        'any.required': 'Status is required'
      }),
    
    statusReason: Joi.string()
      .max(500)
      .optional()
      .messages({
        'string.max': 'Status reason must not exceed 500 characters'
      })
  }),

  verify: Joi.object({
    verificationData: Joi.object({
      workCompleted: Joi.boolean().required(),
      qualityCheck: Joi.boolean().required(),
      complianceCheck: Joi.boolean().required(),
      finalCost: Joi.number().positive().max(1000000).optional(),
      completionDate: Joi.date().max('now').optional(),
      notes: Joi.string().max(1000).optional()
    }).required(),
    
    blockchainHash: Joi.string()
      .pattern(/^0x[a-fA-F0-9]{64}$/)
      .optional()
      .messages({
        'string.pattern.base': 'Invalid blockchain transaction hash format'
      })
  })
};

// IoT data validation schema
const iotSchemas = {
  sensorData: Joi.object({
    propertyId: Joi.string()
      .pattern(patterns.objectId)
      .required()
      .messages({
        'string.pattern.base': 'Invalid property ID format',
        'any.required': 'Property ID is required'
      }),
    
    sensorType: Joi.string()
      .valid('temperature', 'humidity', 'energy_consumption', 'air_quality')
      .required()
      .messages({
        'any.only': 'Sensor type must be one of: temperature, humidity, energy_consumption, air_quality',
        'any.required': 'Sensor type is required'
      }),
    
    value: Joi.number()
      .required()
      .messages({
        'any.required': 'Sensor value is required'
      }),
    
    unit: Joi.string()
      .valid('°C', '°F', '%', 'kWh', 'W', 'ppm', 'µg/m³')
      .required()
      .messages({
        'any.only': 'Unit must be one of: °C, °F, %, kWh, W, ppm, µg/m³',
        'any.required': 'Unit is required'
      }),
    
    timestamp: Joi.date()
      .max('now')
      .required()
      .messages({
        'date.max': 'Timestamp cannot be in the future',
        'any.required': 'Timestamp is required'
      }),
    
    location: Joi.string()
      .max(100)
      .optional()
      .messages({
        'string.max': 'Location must not exceed 100 characters'
      })
  })
};

// Validation middleware factory
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }
    
    req.body = value;
    next();
  };
};

// Parameter validation middleware
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params);
    
    if (error) {
      return res.status(400).json({
        error: 'Invalid parameters',
        details: error.details.map(detail => detail.message)
      });
    }
    
    req.params = value;
    next();
  };
};

// Common parameter schemas
const paramSchemas = {
  objectId: Joi.object({
    id: Joi.string().pattern(patterns.objectId).required()
  })
};

module.exports = {
  userSchemas,
  propertySchemas,
  retrofitSchemas,
  iotSchemas,
  paramSchemas,
  validate,
  validateParams,
  patterns
};
