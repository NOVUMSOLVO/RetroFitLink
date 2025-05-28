const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 100
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  password: { 
    type: String, 
    required: true,
    select: false // Don't include in queries by default
  },
  role: {
    type: String,
    enum: ['Local Authority', 'Resident', 'Installer'],
    required: true,
    index: true
  },
  authorityId: { 
    type: String,
    sparse: true // For Local Authority users
  }, 
  address: { 
    type: String,
    maxlength: 500 // For Residents
  }, 
  certifications: {
    type: [String],
    default: [] // For Installers
  },
  
  // Security fields
  failedLoginAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  lockUntil: {
    type: Date,
    select: false
  },
  tokenVersion: {
    type: Number,
    default: 1
  },
  
  // Audit fields
  lastLogin: {
    type: Date
  },
  lastLoginIp: {
    type: String
  },
  registrationIp: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Profile fields
  phoneNumber: {
    type: String,
    sparse: true
  },
  profilePicture: {
    type: String
  },
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true }
    },
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de']
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  }
}, { 
  timestamps: true,
  collection: 'users'
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Method to increment failed login attempts
userSchema.methods.incFailedAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: {
        failedLoginAttempts: 1
      },
      $unset: {
        lockUntil: 1
      }
    });
  }
  
  const updates = { $inc: { failedLoginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.failedLoginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Method to reset failed attempts
userSchema.methods.resetFailedAttempts = function() {
  return this.updateOne({
    $unset: {
      failedLoginAttempts: 1,
      lockUntil: 1
    }
  });
};

// Static method to find active users
userSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

// Pre-save middleware to handle email normalization
userSchema.pre('save', function(next) {
  if (this.isModified('email')) {
    this.email = this.email.toLowerCase().trim();
  }
  next();
});

// Transform output to remove sensitive fields
userSchema.set('toJSON', {
  transform: function(doc, ret, options) {
    delete ret.password;
    delete ret.failedLoginAttempts;
    delete ret.lockUntil;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
