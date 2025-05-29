const CircuitBreaker = require('opossum');
const logger = require('./logger');

/**
 * Circuit breaker configuration and management
 */
class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
    this.setupDefaultBreakers();
  }

  /**
   * Setup default circuit breakers for core services
   */
  setupDefaultBreakers() {
    // Blockchain service circuit breaker
    const blockchainOptions = {
      timeout: 5000, // 5 seconds
      errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
      resetTimeout: 30000, // 30 seconds before attempting to close circuit
      rollingCountTimeout: 10000, // 10 second rolling window
      rollingCountBuckets: 10, // Number of buckets in rolling window
      name: 'blockchain-service',
      group: 'external-services'
    };

    // IoT service circuit breaker
    const iotOptions = {
      timeout: 3000, // 3 seconds
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      name: 'iot-service',
      group: 'external-services'
    };

    // Database circuit breaker
    const databaseOptions = {
      timeout: 10000, // 10 seconds for database operations
      errorThresholdPercentage: 30, // More sensitive for database
      resetTimeout: 60000, // 1 minute
      rollingCountTimeout: 20000, // 20 second rolling window
      rollingCountBuckets: 20,
      name: 'database-service',
      group: 'infrastructure'
    };

    // Email service circuit breaker
    const emailOptions = {
      timeout: 8000, // 8 seconds
      errorThresholdPercentage: 60, // Less sensitive for email
      resetTimeout: 120000, // 2 minutes
      rollingCountTimeout: 30000, // 30 second rolling window
      rollingCountBuckets: 10,
      name: 'email-service',
      group: 'notifications'
    };

    // Create circuit breakers
    this.createCircuitBreaker('blockchain', this.blockchainServiceCall, blockchainOptions);
    this.createCircuitBreaker('iot', this.iotServiceCall, iotOptions);
    this.createCircuitBreaker('database', this.databaseServiceCall, databaseOptions);
    this.createCircuitBreaker('email', this.emailServiceCall, emailOptions);
  }

  /**
   * Create a circuit breaker for a service
   */
  createCircuitBreaker(name, serviceFunction, options) {
    const breaker = new CircuitBreaker(serviceFunction, options);

    // Add event listeners for monitoring
    breaker.on('open', () => {
      logger.error(`Circuit breaker '${name}' opened`, {
        service: name,
        group: options.group,
        timestamp: new Date().toISOString()
      });
      this.notifyCircuitBreakerEvent(name, 'open', options.group);
    });

    breaker.on('halfOpen', () => {
      logger.warn(`Circuit breaker '${name}' half-open (attempting reset)`, {
        service: name,
        group: options.group,
        timestamp: new Date().toISOString()
      });
      this.notifyCircuitBreakerEvent(name, 'halfOpen', options.group);
    });

    breaker.on('close', () => {
      logger.info(`Circuit breaker '${name}' closed (service recovered)`, {
        service: name,
        group: options.group,
        timestamp: new Date().toISOString()
      });
      this.notifyCircuitBreakerEvent(name, 'close', options.group);
    });

    breaker.on('failure', (error) => {
      logger.warn(`Circuit breaker '${name}' recorded failure`, {
        service: name,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    });

    // Add fallback strategies
    this.addFallbackStrategy(breaker, name);

    // Store the breaker
    this.breakers.set(name, breaker);
    
    logger.info(`Circuit breaker '${name}' created and configured`, {
      service: name,
      timeout: options.timeout,
      errorThreshold: options.errorThresholdPercentage
    });

    return breaker;
  }

  /**
   * Add fallback strategies for different services
   */
  addFallbackStrategy(breaker, serviceName) {
    switch (serviceName) {
      case 'blockchain':
        breaker.fallback(() => ({
          status: 'pending_verification',
          txHash: null,
          message: 'Blockchain service temporarily unavailable - verification queued',
          fallback: true,
          timestamp: new Date().toISOString()
        }));
        break;

      case 'iot':
        breaker.fallback(() => ({
          data: null,
          readings: [],
          message: 'IoT service temporarily unavailable - using cached data',
          fallback: true,
          timestamp: new Date().toISOString()
        }));
        break;

      case 'database':
        breaker.fallback(() => {
          throw new Error('Database service unavailable - operation cannot be completed');
        });
        break;

      case 'email':
        breaker.fallback(() => ({
          sent: false,
          message: 'Email service temporarily unavailable - notification queued',
          fallback: true,
          timestamp: new Date().toISOString()
        }));
        break;

      default:
        breaker.fallback(() => ({
          error: 'Service temporarily unavailable',
          fallback: true,
          timestamp: new Date().toISOString()
        }));
    }
  }

  /**
   * Get circuit breaker instance
   */
  getBreaker(name) {
    return this.breakers.get(name);
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(serviceName, ...args) {
    const breaker = this.breakers.get(serviceName);
    if (!breaker) {
      throw new Error(`Circuit breaker '${serviceName}' not found`);
    }

    try {
      return await breaker.fire(...args);
    } catch (error) {
      logger.error(`Circuit breaker execution failed for '${serviceName}'`, {
        service: serviceName,
        error: error.message,
        isFallback: error.fallback || false
      });
      throw error;
    }
  }

  /**
   * Get health status of all circuit breakers
   */
  getHealthStatus() {
    const status = {};
    
    for (const [name, breaker] of this.breakers) {
      const stats = breaker.stats;
      status[name] = {
        state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
        requests: stats.fires,
        failures: stats.failures,
        successRate: stats.fires > 0 ? ((stats.fires - stats.failures) / stats.fires * 100).toFixed(2) : 100,
        lastFailure: stats.lastFailureTime,
        uptime: stats.uptimePercentage || 0
      };
    }

    return status;
  }

  /**
   * Notify about circuit breaker events (for alerting)
   */
  notifyCircuitBreakerEvent(serviceName, event, group) {
    // In a production environment, this would send alerts to:
    // - Slack/Teams channels
    // - PagerDuty/OpsGenie
    // - Email notifications
    // - Webhook endpoints

    const alertData = {
      service: serviceName,
      event,
      group,
      timestamp: new Date().toISOString(),
      severity: event === 'open' ? 'high' : event === 'halfOpen' ? 'medium' : 'low'
    };

    logger.info('Circuit breaker event notification', alertData);

    // Example webhook notification (implement based on your alerting system)
    if (process.env.CIRCUIT_BREAKER_WEBHOOK_URL) {
      this.sendWebhookAlert(alertData);
    }
  }

  /**
   * Send webhook alert for circuit breaker events
   */
  async sendWebhookAlert(alertData) {
    try {
      const fetch = require('node-fetch');
      await fetch(process.env.CIRCUIT_BREAKER_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...alertData,
          title: `Circuit Breaker ${alertData.event.toUpperCase()}: ${alertData.service}`,
          color: alertData.severity === 'high' ? 'danger' : 
                 alertData.severity === 'medium' ? 'warning' : 'good'
        })
      });
    } catch (error) {
      logger.error('Failed to send circuit breaker webhook alert', error);
    }
  }

  /**
   * Reset all circuit breakers (for maintenance)
   */
  resetAll() {
    for (const [name, breaker] of this.breakers) {
      breaker.close();
      logger.info(`Circuit breaker '${name}' manually reset`);
    }
  }

  /**
   * Shutdown all circuit breakers
   */
  shutdown() {
    for (const [name, breaker] of this.breakers) {
      breaker.shutdown();
      logger.info(`Circuit breaker '${name}' shutdown`);
    }
    this.breakers.clear();
  }

  // Service function stubs (to be replaced with actual service calls)
  async blockchainServiceCall(...args) {
    // This would be replaced with actual blockchain service calls
    throw new Error('Blockchain service call not implemented');
  }

  async iotServiceCall(...args) {
    // This would be replaced with actual IoT service calls
    throw new Error('IoT service call not implemented');
  }

  async databaseServiceCall(...args) {
    // This would be replaced with actual database calls
    throw new Error('Database service call not implemented');
  }

  async emailServiceCall(...args) {
    // This would be replaced with actual email service calls
    throw new Error('Email service call not implemented');
  }
}

// Singleton instance
let circuitBreakerManager = null;

/**
 * Get or create circuit breaker manager instance
 */
const getCircuitBreakerManager = () => {
  if (!circuitBreakerManager) {
    circuitBreakerManager = new CircuitBreakerManager();
  }
  return circuitBreakerManager;
};

module.exports = {
  CircuitBreakerManager,
  getCircuitBreakerManager
};
