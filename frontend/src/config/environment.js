// Environment configuration for RetroFitLink Frontend
const config = {
  development: {
    apiUrl: process.env.REACT_APP_API_URL || 'http://localhost:5000',
    blockchainRpc: process.env.REACT_APP_BLOCKCHAIN_RPC_URL || 'http://localhost:8545',
    environment: 'development',
    enableDebugLogs: true,
    apiTimeout: 30000,
    retryAttempts: 3
  },
  
  staging: {
    apiUrl: process.env.REACT_APP_API_URL || 'https://staging-api.retrofitlink.com',
    blockchainRpc: process.env.REACT_APP_BLOCKCHAIN_RPC_URL || 'https://staging-blockchain.retrofitlink.com',
    environment: 'staging',
    enableDebugLogs: true,
    apiTimeout: 30000,
    retryAttempts: 3
  },
  
  production: {
    apiUrl: process.env.REACT_APP_API_URL || 'https://api.retrofitlink.com',
    blockchainRpc: process.env.REACT_APP_BLOCKCHAIN_RPC_URL || 'https://blockchain.retrofitlink.com',
    environment: 'production',
    enableDebugLogs: false,
    apiTimeout: 15000,
    retryAttempts: 2
  }
};

const environment = process.env.NODE_ENV || 'development';
const currentConfig = config[environment] || config.development;

// Validate required configuration
if (!currentConfig.apiUrl) {
  throw new Error('API URL is not configured');
}

if (!currentConfig.blockchainRpc) {
  throw new Error('Blockchain RPC URL is not configured');
}

export default currentConfig;
