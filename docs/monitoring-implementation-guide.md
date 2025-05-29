# Monitoring & Observability Implementation Guide

## Overview

This document provides a comprehensive guide for implementing monitoring and observability in the RetroFitLink application. The implementation includes Application Performance Monitoring (APM), Error Tracking, Distributed Tracing, Logging, and Uptime Monitoring.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   Blockchain    │
│                 │    │                 │    │   Service       │
│ • Sentry        │    │ • Sentry        │    │ • OpenTelemetry │
│ • OpenTelemetry │    │ • OpenTelemetry │    │ • Custom Logs   │
│ • Custom Events │    │ • StatsD        │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         └──────────────▶│  Datadog Agent  │◀─────────────┘
                        │   (DaemonSet)   │
                        └─────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Jaeger       │    │    Logstash     │    │  Uptime Kuma    │
│   (Tracing)     │    │   (Logging)     │    │  (Monitoring)   │
│                 │    │                 │    │                 │
│ • Collector     │    │ • Log Pipeline  │    │ • Status Page   │
│ • Query UI      │    │ • Filebeat      │    │ • Alerts        │
│ • Agent         │    │ • Elasticsearch │    │ • Notifications │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Components

### 1. Application Performance Monitoring (APM)

#### Datadog Agent
- **Purpose**: Collect metrics, traces, and logs from all services
- **Deployment**: DaemonSet running on all nodes
- **Features**:
  - Real-time metrics collection
  - APM trace collection
  - Log aggregation
  - Process monitoring
  - Network monitoring

#### Sentry
- **Purpose**: Error tracking and performance monitoring
- **Integration**: Frontend (React) and Backend (Node.js)
- **Features**:
  - Real-time error tracking
  - Performance monitoring
  - Release tracking
  - User context
  - Custom breadcrumbs

### 2. Logging Stack

#### Filebeat
- **Purpose**: Log collection from containers and hosts
- **Deployment**: DaemonSet running on all nodes
- **Features**:
  - Container log autodiscovery
  - Multiline log parsing
  - Log enrichment with Kubernetes metadata
  - Multiple output destinations

#### Logstash
- **Purpose**: Log processing and enrichment
- **Deployment**: Clustered deployment with 2 replicas
- **Features**:
  - Log parsing and transformation
  - Data enrichment
  - Multiple input sources
  - Alert integration

### 3. Distributed Tracing

#### Jaeger
- **Purpose**: Distributed tracing across microservices
- **Components**:
  - **Collector**: Receives traces from applications
  - **Query**: Web UI for trace visualization
  - **Agent**: Collects traces from applications (DaemonSet)
- **Storage**: Elasticsearch backend

#### OpenTelemetry
- **Purpose**: Instrumentation SDK for applications
- **Languages**: JavaScript (Frontend & Backend)
- **Features**:
  - Automatic instrumentation
  - Custom span creation
  - Context propagation
  - Sampling strategies

### 4. Uptime Monitoring

#### Uptime Kuma
- **Purpose**: Service availability monitoring
- **Features**:
  - HTTP/HTTPS monitoring
  - Port monitoring
  - Status page
  - Multi-channel notifications
  - Incident management

## Deployment Instructions

### Prerequisites
1. Kubernetes cluster with monitoring namespace
2. Helm 3.x installed
3. kubectl configured for target cluster
4. External secrets (Datadog API key, Slack webhook, etc.)

### Quick Deployment
```bash
# Deploy all monitoring components
cd /Users/valentinechideme/Documents/RetroFitLink
./scripts/deployment/deploy-phase3-monitoring.sh

# Deploy with dry-run first
./scripts/deployment/deploy-phase3-monitoring.sh --dry-run

# Deploy specific components only
./scripts/deployment/deploy-phase3-monitoring.sh --skip-apm --skip-tracing
```

### Manual Deployment

#### 1. Create Secrets
```bash
# Datadog API key
kubectl create secret generic datadog-secret \
  --from-literal=api-key="your-datadog-api-key" \
  -n retrofitlink-prod

# Notification secrets
kubectl create secret generic uptime-kuma-secrets \
  --from-literal=slack-webhook-url="your-slack-webhook" \
  --from-literal=smtp-host="your-smtp-host" \
  --from-literal=smtp-username="your-smtp-username" \
  --from-literal=smtp-password="your-smtp-password" \
  --from-literal=pagerduty-integration-key="your-pagerduty-key" \
  -n retrofitlink-prod
```

#### 2. Deploy APM
```bash
kubectl apply -f monitoring/apm/ -n retrofitlink-prod
```

#### 3. Deploy Logging
```bash
kubectl apply -f monitoring/logging/ -n retrofitlink-prod
```

#### 4. Deploy Tracing
```bash
kubectl apply -f monitoring/tracing/ -n retrofitlink-prod
```

#### 5. Deploy Uptime Monitoring
```bash
kubectl apply -f monitoring/uptime/ -n retrofitlink-prod
```

## Application Integration

### Backend Integration

1. **Install Dependencies**:
```bash
npm install @sentry/node @sentry/profiling-node @opentelemetry/sdk-node @opentelemetry/exporter-jaeger @opentelemetry/auto-instrumentations-node node-statsd winston
```

2. **Initialize Monitoring** (add to app.js):
```javascript
// Add this before any other imports
require('./monitoring/instrumentation/backend-monitoring');

const express = require('express');
const { requestTrackingMiddleware, errorTrackingMiddleware, healthCheckHandler } = require('./monitoring/instrumentation/backend-monitoring');

const app = express();

// Add monitoring middleware
app.use(requestTrackingMiddleware);

// Your existing routes
// ...

// Health check endpoint
app.get('/health', healthCheckHandler);

// Error tracking (add at the end)
app.use(errorTrackingMiddleware);
```

### Frontend Integration

1. **Install Dependencies**:
```bash
npm install @sentry/react @sentry/tracing @opentelemetry/sdk-trace-web @opentelemetry/exporter-jaeger @opentelemetry/auto-instrumentations-web
```

2. **Initialize Monitoring** (add to index.js):
```javascript
// Add this before React imports
import './utils/monitoring';

import React from 'react';
import ReactDOM from 'react-dom';
import { withErrorBoundary } from './utils/monitoring';
import App from './App';

const AppWithErrorBoundary = withErrorBoundary(App);

ReactDOM.render(<AppWithErrorBoundary />, document.getElementById('root'));
```

3. **Add Page Tracking**:
```javascript
import { withPageTracking, useActionTracking } from './utils/monitoring';

const Dashboard = ({ user }) => {
  const trackAction = useActionTracking();
  
  const handleButtonClick = () => {
    trackAction('button_click', 'dashboard_button', { section: 'main' });
    // Your button logic
  };
  
  return (
    <div>
      {/* Your component */}
      <button onClick={handleButtonClick}>Click me</button>
    </div>
  );
};

export default withPageTracking(Dashboard, 'dashboard');
```

## Configuration

### Environment Variables

#### Backend (.env)
```bash
# Sentry
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_TRACES_SAMPLE_RATE=0.3
SENTRY_PROFILES_SAMPLE_RATE=0.3

# OpenTelemetry
JAEGER_ENDPOINT=http://jaeger-collector:14268/api/traces

# StatsD
STATSD_HOST=datadog-agent
STATSD_PORT=8125

# Logging
LOG_LEVEL=info
```

#### Frontend (.env)
```bash
# Sentry
REACT_APP_SENTRY_DSN=https://your-frontend-sentry-dsn@sentry.io/project-id
REACT_APP_SENTRY_TRACES_SAMPLE_RATE=0.1
REACT_APP_SENTRY_PROFILES_SAMPLE_RATE=0.1

# OpenTelemetry
REACT_APP_JAEGER_ENDPOINT=http://jaeger-collector:14268/api/traces

# API
REACT_APP_API_URL=https://api.retrofitlink.example.com
REACT_APP_VERSION=1.0.0
```

## Accessing Monitoring Tools

### Port Forwarding for Local Access
```bash
# Jaeger UI
kubectl port-forward svc/jaeger-query 16686:16686 -n retrofitlink-prod
# Access: http://localhost:16686

# Uptime Kuma
kubectl port-forward svc/uptime-kuma 3001:3001 -n retrofitlink-prod
# Access: http://localhost:3001

# Grafana (from previous phase)
kubectl port-forward svc/grafana 3000:3000 -n retrofitlink-prod
# Access: http://localhost:3000
```

### Ingress Access (Production)
- Jaeger UI: https://jaeger.retrofitlink.example.com
- Uptime Kuma: https://status.retrofitlink.example.com
- Grafana: https://grafana.retrofitlink.example.com

## Alerting Configuration

### AlertManager Integration
The monitoring stack integrates with the existing AlertManager configuration from Phase 2. Critical errors from applications are automatically sent to AlertManager.

### Uptime Kuma Alerts
Configure notifications in Uptime Kuma:
1. Access Uptime Kuma UI
2. Go to Settings > Notifications
3. Add notification channels (Slack, Email, PagerDuty)
4. Configure monitors with appropriate notification settings

### Sentry Alerts
Configure Sentry alerts:
1. Go to Sentry project settings
2. Configure alert rules for error rates and performance issues
3. Set up notification channels

## Metrics and KPIs

### Application Metrics
- **Response Time**: API endpoint response times
- **Error Rate**: Percentage of failed requests
- **Throughput**: Requests per second
- **Availability**: Service uptime percentage

### Business Metrics
- **User Registrations**: New user sign-ups
- **Retrofit Applications**: Number of applications submitted
- **Blockchain Transactions**: Smart contract interactions
- **IoT Data Points**: Sensor data ingestion rate

### Infrastructure Metrics
- **CPU Usage**: Container and node CPU utilization
- **Memory Usage**: Application memory consumption
- **Disk Usage**: Storage utilization
- **Network Traffic**: Ingress/egress network traffic

## Troubleshooting

### Common Issues

#### 1. Jaeger Traces Not Appearing
- Check if applications have OpenTelemetry instrumentation
- Verify Jaeger collector is receiving traces
- Check sampling configuration

#### 2. Logs Not Appearing in Logstash
- Check Filebeat configuration and pod status
- Verify log file paths and permissions
- Check Logstash pipeline configuration

#### 3. Sentry Errors Not Reporting
- Verify Sentry DSN configuration
- Check network connectivity to Sentry
- Review error filtering configuration

#### 4. Datadog Agent Not Collecting Metrics
- Check Datadog API key secret
- Verify agent has proper RBAC permissions
- Check node labels and selectors

### Debugging Commands
```bash
# Check pod status
kubectl get pods -n retrofitlink-prod -l component=monitoring

# Check logs
kubectl logs -f deployment/jaeger-collector -n retrofitlink-prod
kubectl logs -f daemonset/filebeat -n retrofitlink-prod
kubectl logs -f daemonset/datadog-agent -n retrofitlink-prod

# Check services
kubectl get svc -n retrofitlink-prod

# Test connectivity
kubectl exec -it deployment/logstash -n retrofitlink-prod -- curl http://elasticsearch:9200/_cluster/health
```

## Best Practices

### 1. Monitoring Strategy
- **Start with the essentials**: Focus on core application metrics first
- **Layer monitoring**: Combine different monitoring approaches (APM, logs, traces)
- **Set up alerting early**: Don't wait for issues to discover monitoring gaps

### 2. Performance Impact
- **Use sampling**: Don't trace every request in production
- **Filter noise**: Exclude health checks and static assets from monitoring
- **Monitor the monitors**: Ensure monitoring tools don't impact application performance

### 3. Alert Fatigue Prevention
- **Use proper thresholds**: Avoid alerts for minor fluctuations
- **Implement alert grouping**: Group related alerts to reduce noise
- **Regular review**: Periodically review and adjust alert rules

### 4. Security
- **Sanitize logs**: Remove sensitive information from logs and traces
- **Secure dashboards**: Use proper authentication for monitoring UIs
- **Rotate secrets**: Regularly rotate API keys and credentials

## Next Steps

1. **Configure Dashboards**: Set up custom Grafana dashboards for business metrics
2. **Implement SLOs**: Define and monitor Service Level Objectives
3. **Chaos Engineering**: Implement chaos testing to validate monitoring
4. **Capacity Planning**: Use metrics for infrastructure capacity planning
5. **Team Training**: Train development team on monitoring tools and practices

## Support and Maintenance

### Regular Tasks
- Review and update alert thresholds monthly
- Analyze monitoring data for optimization opportunities
- Update instrumentation as application evolves
- Monitor storage usage for logs and traces

### Contact Information
- **Monitoring Team**: monitoring@retrofitlink.example.com
- **On-Call Rotation**: Use PagerDuty for escalation
- **Documentation**: Update this guide as configuration changes
