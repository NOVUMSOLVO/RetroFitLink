// Backend monitoring instrumentation
// Add this to backend/src/middleware/monitoring.js

const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const StatsD = require('node-statsd');

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production',
  release: process.env.APP_VERSION || '1.0.0',
  
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app: require('../app') }),
    new Sentry.Integrations.Mongo(),
    new ProfilingIntegration(),
  ],
  
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.3,
  profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE) || 0.3,
  
  beforeSend(event, hint) {
    // Filter out health check errors
    if (event.request && event.request.url && event.request.url.includes('/health')) {
      return null;
    }
    return event;
  },
});

// Initialize OpenTelemetry
const jaegerExporter = new JaegerExporter({
  endpoint: process.env.JAEGER_ENDPOINT || 'http://jaeger-collector:14268/api/traces',
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'retrofitlink-backend',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'production',
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'retrofitlink',
  }),
  traceExporter: jaegerExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// Initialize StatsD for custom metrics
const statsD = new StatsD({
  host: process.env.STATSD_HOST || 'datadog-agent',
  port: parseInt(process.env.STATSD_PORT) || 8125,
  prefix: 'retrofitlink.backend.',
  tags: {
    service: 'retrofitlink-backend',
    environment: process.env.NODE_ENV || 'production',
  },
});

// Custom metrics tracking
class MetricsTracker {
  constructor() {
    this.requestCount = 0;
    this.errorCount = 0;
    this.responseTimeHistogram = [];
  }

  // Track API request
  trackRequest(req, res, responseTime) {
    this.requestCount++;
    
    // Send to StatsD
    statsD.increment('api.requests', 1, {
      method: req.method,
      route: req.route?.path || 'unknown',
      status_code: res.statusCode,
    });
    
    statsD.timing('api.response_time', responseTime, {
      method: req.method,
      route: req.route?.path || 'unknown',
    });
    
    // Track error rates
    if (res.statusCode >= 400) {
      this.errorCount++;
      statsD.increment('api.errors', 1, {
        method: req.method,
        route: req.route?.path || 'unknown',
        status_code: res.statusCode,
      });
    }
  }

  // Track database operations
  trackDatabaseOperation(operation, collection, duration, success = true) {
    statsD.increment('database.operations', 1, {
      operation,
      collection,
      success: success.toString(),
    });
    
    statsD.timing('database.operation_time', duration, {
      operation,
      collection,
    });
  }

  // Track blockchain operations
  trackBlockchainOperation(operation, transactionHash, gasUsed, success = true) {
    statsD.increment('blockchain.operations', 1, {
      operation,
      success: success.toString(),
    });
    
    if (gasUsed) {
      statsD.gauge('blockchain.gas_used', gasUsed, {
        operation,
      });
    }
  }

  // Track user activities
  trackUserActivity(userId, activity, metadata = {}) {
    statsD.increment('user.activities', 1, {
      activity,
      ...metadata,
    });
  }

  // Track business metrics
  trackBusinessMetric(metric, value, tags = {}) {
    statsD.gauge(`business.${metric}`, value, tags);
  }
}

const metricsTracker = new MetricsTracker();

// Middleware for request tracking
const requestTrackingMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Add request ID for tracing
  req.id = require('crypto').randomUUID();
  
  // Add user context to Sentry
  if (req.user) {
    Sentry.setUser({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    });
  }
  
  // Track request
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    metricsTracker.trackRequest(req, res, responseTime);
  });
  
  next();
};

// Error tracking middleware
const errorTrackingMiddleware = (err, req, res, next) => {
  // Send error to Sentry
  Sentry.captureException(err, {
    contexts: {
      request: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
      },
      user: req.user ? {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
      } : undefined,
    },
    tags: {
      endpoint: req.route?.path || 'unknown',
      method: req.method,
    },
  });
  
  // Track error metrics
  statsD.increment('api.errors', 1, {
    error_type: err.name || 'UnknownError',
    endpoint: req.route?.path || 'unknown',
    method: req.method,
  });
  
  next(err);
};

// Health check endpoint with metrics
const healthCheckHandler = (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'production',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    metrics: {
      totalRequests: metricsTracker.requestCount,
      totalErrors: metricsTracker.errorCount,
      errorRate: metricsTracker.requestCount > 0 ? 
        (metricsTracker.errorCount / metricsTracker.requestCount) * 100 : 0,
    },
  };
  
  // Send health metrics
  statsD.gauge('health.uptime', process.uptime());
  statsD.gauge('health.memory.used', process.memoryUsage().heapUsed);
  statsD.gauge('health.memory.total', process.memoryUsage().heapTotal);
  
  res.json(healthStatus);
};

// Custom logger with structured logging
const logger = require('winston').createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: require('winston').format.combine(
    require('winston').format.timestamp(),
    require('winston').format.errors({ stack: true }),
    require('winston').format.json()
  ),
  defaultMeta: {
    service: 'retrofitlink-backend',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'production',
  },
  transports: [
    new require('winston').transports.Console(),
    new require('winston').transports.File({ filename: '/var/log/app/error.log', level: 'error' }),
    new require('winston').transports.File({ filename: '/var/log/app/combined.log' }),
  ],
});

module.exports = {
  Sentry,
  metricsTracker,
  requestTrackingMiddleware,
  errorTrackingMiddleware,
  healthCheckHandler,
  logger,
  statsD,
};
