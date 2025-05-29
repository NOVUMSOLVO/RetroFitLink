// Frontend monitoring instrumentation
// Add this to frontend/src/utils/monitoring.js

import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

// Initialize Sentry
Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production',
  release: process.env.REACT_APP_VERSION || '1.0.0',
  
  integrations: [
    new BrowserTracing({
      // Capture interactions like clicks, navigations
      routingInstrumentation: Sentry.reactRouterV6Instrumentation(
        React.useEffect,
        // useLocation,
        // useNavigationType,
        // createRoutesFromChildren,
        // matchRoutes
      ),
    }),
  ],
  
  // Performance
  tracesSampleRate: parseFloat(process.env.REACT_APP_SENTRY_TRACES_SAMPLE_RATE) || 0.1,
  profilesSampleRate: parseFloat(process.env.REACT_APP_SENTRY_PROFILES_SAMPLE_RATE) || 0.1,
  
  // Error Filtering
  beforeSend(event, hint) {
    // Filter out known non-critical errors
    if (event.exception) {
      const error = event.exception.values[0];
      if (error.type === 'ChunkLoadError') {
        return null; // Don't send chunk load errors
      }
      if (error.value && error.value.includes('Network Error')) {
        return null; // Don't send network errors
      }
    }
    return event;
  },
  
  // User Context
  initialScope: {
    tags: {
      component: 'frontend',
      service: 'retrofitlink-frontend',
    },
    contexts: {
      app: {
        name: 'RetroFitLink Frontend',
        version: process.env.REACT_APP_VERSION || '1.0.0',
      },
    },
  },
});

// Initialize OpenTelemetry
const provider = new WebTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'retrofitlink-frontend',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.REACT_APP_VERSION || '1.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'production',
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'retrofitlink',
  }),
});

const jaegerExporter = new JaegerExporter({
  endpoint: process.env.REACT_APP_JAEGER_ENDPOINT || 'http://jaeger-collector:14268/api/traces',
});

provider.addSpanProcessor(new BatchSpanProcessor(jaegerExporter));
provider.register();

registerInstrumentations({
  instrumentations: [
    getWebAutoInstrumentations({
      '@opentelemetry/instrumentation-fetch': {
        enabled: true,
        ignoreUrls: [
          /\/health$/,
          /\.(css|js|png|jpg|gif|svg|ico|woff|woff2|ttf|eot)$/,
        ],
        propagateTraceHeaderCorsUrls: [
          new RegExp(process.env.REACT_APP_API_URL || 'http://localhost:5000'),
        ],
      },
      '@opentelemetry/instrumentation-user-interaction': {
        enabled: true,
        eventNames: ['click', 'submit', 'change'],
      },
      '@opentelemetry/instrumentation-document-load': {
        enabled: true,
      },
    }),
  ],
});

// Custom metrics tracking for frontend
class FrontendMetrics {
  constructor() {
    this.pageViews = 0;
    this.userActions = 0;
    this.errors = 0;
    this.apiCalls = 0;
    this.startTime = Date.now();
  }

  // Track page views
  trackPageView(page, userId = null) {
    this.pageViews++;
    
    // Send to Sentry as breadcrumb
    Sentry.addBreadcrumb({
      message: 'Page View',
      category: 'navigation',
      data: {
        page,
        userId,
        timestamp: new Date().toISOString(),
      },
      level: 'info',
    });

    // Send custom event
    this.sendCustomEvent('page_view', {
      page,
      userId,
      sessionId: this.getSessionId(),
    });
  }

  // Track user interactions
  trackUserAction(action, element, metadata = {}) {
    this.userActions++;
    
    Sentry.addBreadcrumb({
      message: 'User Action',
      category: 'user',
      data: {
        action,
        element,
        ...metadata,
        timestamp: new Date().toISOString(),
      },
      level: 'info',
    });

    this.sendCustomEvent('user_action', {
      action,
      element,
      ...metadata,
      sessionId: this.getSessionId(),
    });
  }

  // Track API calls
  trackApiCall(endpoint, method, status, responseTime, userId = null) {
    this.apiCalls++;
    
    const isError = status >= 400;
    if (isError) {
      this.errors++;
    }

    Sentry.addBreadcrumb({
      message: 'API Call',
      category: 'http',
      data: {
        endpoint,
        method,
        status,
        responseTime,
        userId,
        timestamp: new Date().toISOString(),
      },
      level: isError ? 'error' : 'info',
    });

    this.sendCustomEvent('api_call', {
      endpoint,
      method,
      status,
      responseTime,
      userId,
      sessionId: this.getSessionId(),
      success: !isError,
    });
  }

  // Track form submissions
  trackFormSubmission(formName, success, errors = []) {
    Sentry.addBreadcrumb({
      message: 'Form Submission',
      category: 'user',
      data: {
        formName,
        success,
        errors,
        timestamp: new Date().toISOString(),
      },
      level: success ? 'info' : 'warning',
    });

    this.sendCustomEvent('form_submission', {
      formName,
      success,
      errorCount: errors.length,
      sessionId: this.getSessionId(),
    });
  }

  // Track errors
  trackError(error, context = {}) {
    this.errors++;
    
    Sentry.captureException(error, {
      contexts: {
        error_context: context,
      },
      tags: {
        error_boundary: context.errorBoundary || false,
      },
    });

    this.sendCustomEvent('frontend_error', {
      errorType: error.name,
      errorMessage: error.message,
      stack: error.stack,
      ...context,
      sessionId: this.getSessionId(),
    });
  }

  // Track performance metrics
  trackPerformance() {
    if (typeof window !== 'undefined' && window.performance) {
      const navigation = window.performance.getEntriesByType('navigation')[0];
      const paint = window.performance.getEntriesByType('paint');
      
      const metrics = {
        loadTime: navigation.loadEventEnd - navigation.loadEventStart,
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0,
        sessionDuration: Date.now() - this.startTime,
      };

      this.sendCustomEvent('performance_metrics', {
        ...metrics,
        sessionId: this.getSessionId(),
      });

      return metrics;
    }
    return null;
  }

  // Track business events
  trackBusinessEvent(event, data = {}) {
    Sentry.addBreadcrumb({
      message: 'Business Event',
      category: 'business',
      data: {
        event,
        ...data,
        timestamp: new Date().toISOString(),
      },
      level: 'info',
    });

    this.sendCustomEvent('business_event', {
      event,
      ...data,
      sessionId: this.getSessionId(),
    });
  }

  // Get or create session ID
  getSessionId() {
    if (typeof window !== 'undefined') {
      let sessionId = sessionStorage.getItem('analytics_session_id');
      if (!sessionId) {
        sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('analytics_session_id', sessionId);
      }
      return sessionId;
    }
    return 'unknown_session';
  }

  // Send custom event (could be to multiple analytics providers)
  sendCustomEvent(eventName, data) {
    // Send to our backend analytics endpoint
    if (typeof window !== 'undefined') {
      fetch(`${process.env.REACT_APP_API_URL}/api/analytics/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event: eventName,
          data,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      }).catch(err => {
        console.warn('Failed to send analytics event:', err);
      });
    }
  }

  // Get session summary
  getSessionSummary() {
    return {
      sessionId: this.getSessionId(),
      startTime: this.startTime,
      duration: Date.now() - this.startTime,
      pageViews: this.pageViews,
      userActions: this.userActions,
      apiCalls: this.apiCalls,
      errors: this.errors,
    };
  }
}

const frontendMetrics = new FrontendMetrics();

// React Error Boundary integration
export const withErrorBoundary = (Component, fallback = null) => {
  return Sentry.withErrorBoundary(Component, {
    fallback: fallback || (({ error, resetError }) => (
      <div className="error-boundary">
        <h2>Something went wrong</h2>
        <p>{error.message}</p>
        <button onClick={resetError}>Try again</button>
      </div>
    )),
    beforeCapture: (scope, error, errorInfo) => {
      scope.setTag('errorBoundary', true);
      scope.setContext('errorInfo', errorInfo);
      frontendMetrics.trackError(error, { errorBoundary: true, ...errorInfo });
    },
  });
};

// HOC for page tracking
export const withPageTracking = (Component, pageName) => {
  return (props) => {
    React.useEffect(() => {
      frontendMetrics.trackPageView(pageName, props.user?.id);
    }, [props.user?.id]);

    return <Component {...props} />;
  };
};

// Hook for user action tracking
export const useActionTracking = () => {
  return React.useCallback((action, element, metadata = {}) => {
    frontendMetrics.trackUserAction(action, element, metadata);
  }, []);
};

// Hook for API call tracking
export const useApiTracking = () => {
  return React.useCallback((endpoint, method, status, responseTime, userId = null) => {
    frontendMetrics.trackApiCall(endpoint, method, status, responseTime, userId);
  }, []);
};

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const summary = frontendMetrics.getSessionSummary();
    frontendMetrics.sendCustomEvent('session_end', summary);
  });
}

export {
  Sentry,
  frontendMetrics,
  withErrorBoundary,
  withPageTracking,
  useActionTracking,
  useApiTracking,
};

export default frontendMetrics;
