require('dotenv').config();

const config = {
  development: {
    port: process.env.PORT || 5000,
    apiUrl: process.env.API_URL || 'http://localhost:5000',
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/retrofitlink',
    jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    blockchainRpc: process.env.BLOCKCHAIN_RPC_URL || 'http://localhost:8545',
    nodeEnv: 'development',
    
    // Security settings
    bcryptSaltRounds: 10,
    rateLimitMax: 100,
    rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
    
    // Database encryption
    useFieldEncryption: process.env.USE_FIELD_ENCRYPTION === 'true' || false,
    
    // Logging
    logLevel: 'debug',
    logToFile: false
  },
  
  staging: {
    port: process.env.PORT || 5000,
    apiUrl: process.env.API_URL,
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    blockchainRpc: process.env.BLOCKCHAIN_RPC_URL,
    nodeEnv: 'staging',
    
    // Security settings
    bcryptSaltRounds: 12,
    rateLimitMax: 100,
    rateLimitWindowMs: 15 * 60 * 1000,
    
    // Database encryption
    useFieldEncryption: process.env.USE_FIELD_ENCRYPTION === 'true',
    
    // Logging
    logLevel: 'info',
    logToFile: true
  },
  
  production: {
    port: process.env.PORT || 5000,
    apiUrl: process.env.API_URL,
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
    blockchainRpc: process.env.BLOCKCHAIN_RPC_URL,
    nodeEnv: 'production',
    
    // Security settings
    bcryptSaltRounds: 14,
    rateLimitMax: 50,
    rateLimitWindowMs: 15 * 60 * 1000,
    
    // Database encryption
    useFieldEncryption: process.env.USE_FIELD_ENCRYPTION === 'true',
    
    // Logging
    logLevel: 'error',
    logToFile: true
  }
};

const environment = process.env.NODE_ENV || 'development';

if (!config[environment]) {
  throw new Error(`Configuration for environment "${environment}" not found`);
}

// Validate required environment variables for non-development environments
if (environment !== 'development') {
  const requiredVars = ['JWT_SECRET', 'MONGO_URI', 'BLOCKCHAIN_RPC_URL'];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Required environment variable ${varName} is not set`);
    }
  }
}

module.exports = config[environment];
