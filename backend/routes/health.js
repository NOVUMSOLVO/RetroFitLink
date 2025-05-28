const express = require('express');
const mongoose = require('mongoose');
const Web3 = require('web3');
const router = express.Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {}
  };

  try {
    // Check database connection
    if (mongoose.connection.readyState === 1) {
      healthStatus.services.database = {
        status: 'healthy',
        connection: 'connected'
      };
    } else {
      healthStatus.services.database = {
        status: 'unhealthy',
        connection: 'disconnected'
      };
      healthStatus.status = 'degraded';
    }

    // Check blockchain connection
    try {
      const web3 = new Web3(process.env.BLOCKCHAIN_RPC_URL);
      const isListening = await web3.eth.net.isListening();
      
      if (isListening) {
        const blockNumber = await web3.eth.getBlockNumber();
        healthStatus.services.blockchain = {
          status: 'healthy',
          connection: 'connected',
          latestBlock: blockNumber
        };
      } else {
        healthStatus.services.blockchain = {
          status: 'unhealthy',
          connection: 'not_listening'
        };
        healthStatus.status = 'degraded';
      }
    } catch (blockchainError) {
      healthStatus.services.blockchain = {
        status: 'unhealthy',
        error: 'connection_failed'
      };
      healthStatus.status = 'degraded';
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    healthStatus.resources = {
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)} MB`
      },
      uptime: `${Math.round(process.uptime())} seconds`
    };

    // Determine overall status code
    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);

  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Readiness check (for Kubernetes)
router.get('/ready', async (req, res) => {
  try {
    // Check if all critical services are ready
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        status: 'not_ready',
        reason: 'database_not_connected'
      });
    }

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error.message
    });
  }
});

// Liveness check (for Kubernetes)
router.get('/alive', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;
