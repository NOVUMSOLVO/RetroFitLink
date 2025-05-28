const Web3 = require('web3');

const blockchainMiddleware = (req, res, next) => {
  // Initialize Web3 connection
  if (!req.web3) {
    const web3 = new Web3(process.env.BLOCKCHAIN_RPC_URL || 'http://localhost:8545');
    req.web3 = web3;
  }
  next();
};

module.exports = { blockchainMiddleware };
