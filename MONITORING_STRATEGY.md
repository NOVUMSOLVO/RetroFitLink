# Monitoring and Observability Stack for RetroFitLink

## Overview
This document outlines the comprehensive monitoring and observability strategy for RetroFitLink production deployment.

## Stack Components

### Application Performance Monitoring (APM)
- **Primary**: New Relic / DataDog
- **Backup**: Elastic APM
- **Custom Metrics**: Prometheus + Grafana

### Log Management
- **Stack**: ELK (Elasticsearch, Logstash, Kibana)
- **Alternative**: AWS CloudWatch / GCP Logging
- **Log Aggregation**: Fluentd / Fluent Bit

### Error Tracking
- **Primary**: Sentry
- **Integration**: Custom error handler with context

### Infrastructure Monitoring
- **Kubernetes**: Prometheus + Grafana
- **Cloud**: CloudWatch / Stackdriver
- **Custom Dashboards**: Grafana

### Uptime Monitoring
- **External**: Pingdom / StatusPage
- **Internal**: Kubernetes health checks
- **Synthetic Tests**: Datadog Synthetics

## Monitoring Configuration

### 1. Prometheus Configuration

```yaml
# prometheus-config.yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert-rules.yml"

scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
    - role: pod
    relabel_configs:
    - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
      action: keep
      regex: true

  - job_name: 'node-exporter'
    kubernetes_sd_configs:
    - role: endpoints
    relabel_configs:
    - source_labels: [__meta_kubernetes_service_name]
      action: keep
      regex: node-exporter

  - job_name: 'kube-state-metrics'
    static_configs:
    - targets: ['kube-state-metrics:8080']

alerting:
  alertmanagers:
  - static_configs:
    - targets:
      - alertmanager:9093
```

### 2. Grafana Dashboards

#### Application Dashboard
- API Response Times
- Error Rates
- Request Volume
- Database Performance
- Blockchain Transaction Status
- IoT Data Flow

#### Infrastructure Dashboard
- CPU/Memory Usage
- Disk I/O
- Network Traffic
- Pod Status
- Resource Utilization

#### Business Metrics Dashboard
- User Registrations
- Retrofit Projects Created
- Verification Completions
- Revenue Metrics

### 3. Alert Rules

```yaml
# alert-rules.yml
groups:
- name: retrofitlink.rules
  rules:
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "High error rate detected"
      description: "Error rate is {{ $value }} errors per second"

  - alert: HighResponseTime
    expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High response time detected"
      description: "95th percentile response time is {{ $value }}s"

  - alert: DatabaseConnectionFailure
    expr: mongodb_up == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Database connection failed"
      description: "MongoDB is down"

  - alert: BlockchainSyncIssue
    expr: increase(blockchain_sync_errors_total[5m]) > 0
    for: 2m
    labels:
      severity: warning
    annotations:
      summary: "Blockchain synchronization issues"
      description: "Blockchain sync errors detected"

  - alert: PodCrashLooping
    expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Pod crash looping"
      description: "Pod {{ $labels.pod }} is crash looping"

  - alert: HighMemoryUsage
    expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.85
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High memory usage"
      description: "Memory usage is {{ $value | humanizePercentage }}"

  - alert: DiskSpaceRunningOut
    expr: (node_filesystem_size_bytes - node_filesystem_free_bytes) / node_filesystem_size_bytes > 0.85
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Disk space running out"
      description: "Disk usage is {{ $value | humanizePercentage }}"
```

### 4. ELK Stack Configuration

#### Logstash Configuration
```yaml
# logstash.conf
input {
  beats {
    port => 5044
  }
}

filter {
  if [fields][service] == "retrofitlink-backend" {
    json {
      source => "message"
    }
    
    if [type] == "security" {
      mutate {
        add_tag => ["security_event"]
      }
    }
    
    if [type] == "performance" {
      mutate {
        add_tag => ["performance_metric"]
      }
    }
  }
  
  if [fields][service] == "retrofitlink-frontend" {
    grok {
      match => { "message" => "%{COMBINEDAPACHELOG}" }
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "retrofitlink-%{+YYYY.MM.dd}"
  }
}
```

#### Kibana Dashboards
1. **Error Dashboard**: Track errors across all services
2. **Security Dashboard**: Monitor authentication, authorization events
3. **Performance Dashboard**: Response times, throughput
4. **Business Dashboard**: User activities, retrofit progress

### 5. Sentry Configuration

```javascript
// backend/utils/sentry.js
const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new ProfilingIntegration(),
  ],
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: 1.0,
  beforeSend: (event) => {
    // Filter sensitive data
    if (event.request) {
      delete event.request.cookies;
      if (event.request.data) {
        delete event.request.data.password;
        delete event.request.data.token;
      }
    }
    return event;
  }
});

module.exports = Sentry;
```

### 6. Health Check Endpoints

```javascript
// backend/routes/monitoring.js
const express = require('express');
const router = express.Router();

// Prometheus metrics endpoint
router.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(register.metrics());
});

// Application metrics
router.get('/app-metrics', async (req, res) => {
  const metrics = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    activeConnections: await getActiveConnections(),
    databaseConnections: await getDatabaseConnections(),
    queueLength: await getQueueLength(),
    responseTime: await getAverageResponseTime(),
    errorRate: await getErrorRate()
  };
  
  res.json(metrics);
});

module.exports = router;
```

## Custom Metrics Collection

### Backend Metrics
```javascript
// backend/middleware/metrics.js
const promClient = require('prom-client');

// Create custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const retrofitProjectsTotal = new promClient.Counter({
  name: 'retrofit_projects_total',
  help: 'Total number of retrofit projects created',
  labelNames: ['status', 'work_type']
});

const blockchainTransactionsTotal = new promClient.Counter({
  name: 'blockchain_transactions_total',
  help: 'Total number of blockchain transactions',
  labelNames: ['status', 'type']
});

const iotDataPointsTotal = new promClient.Counter({
  name: 'iot_data_points_total',
  help: 'Total number of IoT data points received',
  labelNames: ['sensor_type', 'property_id']
});

module.exports = {
  httpRequestDuration,
  httpRequestsTotal,
  retrofitProjectsTotal,
  blockchainTransactionsTotal,
  iotDataPointsTotal
};
```

### Frontend Metrics
```javascript
// frontend/src/utils/analytics.js
class Analytics {
  constructor() {
    this.metrics = {};
  }

  // Track user interactions
  trackUserAction(action, category, label, value) {
    const metric = {
      action,
      category,
      label,
      value,
      timestamp: new Date().toISOString(),
      userId: this.getCurrentUserId(),
      sessionId: this.getSessionId()
    };
    
    this.sendMetric(metric);
  }

  // Track performance metrics
  trackPerformance(metric, value) {
    const performanceMetric = {
      type: 'performance',
      metric,
      value,
      timestamp: new Date().toISOString(),
      url: window.location.pathname,
      userAgent: navigator.userAgent
    };
    
    this.sendMetric(performanceMetric);
  }

  // Track errors
  trackError(error, context) {
    const errorMetric = {
      type: 'error',
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
      userId: this.getCurrentUserId(),
      url: window.location.pathname
    };
    
    this.sendMetric(errorMetric);
  }

  sendMetric(metric) {
    // Send to analytics endpoint
    fetch('/api/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metric)
    }).catch(err => console.warn('Analytics error:', err));
  }
}

export default new Analytics();
```

## Deployment Instructions

### 1. Deploy Monitoring Stack
```bash
# Deploy Prometheus
kubectl apply -f monitoring/prometheus/

# Deploy Grafana
kubectl apply -f monitoring/grafana/

# Deploy ELK Stack
kubectl apply -f monitoring/elk/

# Deploy Alert Manager
kubectl apply -f monitoring/alertmanager/
```

### 2. Configure Dashboards
```bash
# Import Grafana dashboards
kubectl create configmap grafana-dashboards --from-file=monitoring/dashboards/

# Configure Kibana dashboards
kubectl apply -f monitoring/kibana-dashboards.yaml
```

### 3. Set up External Monitoring
```bash
# Configure Pingdom checks
curl -X POST "https://api.pingdom.com/api/3.1/checks" \
  -H "Authorization: Bearer $PINGDOM_API_TOKEN" \
  -d "name=RetroFitLink&url=https://retrofitlink.com&type=http"

# Configure StatusPage
# (Manual setup through StatusPage dashboard)
```

## Monitoring Checklist

### Pre-deployment
- [ ] Prometheus configuration tested
- [ ] Grafana dashboards imported
- [ ] Alert rules configured
- [ ] ELK stack deployed
- [ ] Sentry project created
- [ ] External monitoring configured

### Post-deployment
- [ ] All metrics collecting properly
- [ ] Dashboards showing data
- [ ] Alerts firing correctly
- [ ] Log aggregation working
- [ ] Error tracking active
- [ ] Performance baselines established

### Ongoing Maintenance
- [ ] Weekly dashboard reviews
- [ ] Monthly alert rule optimization
- [ ] Quarterly monitoring stack updates
- [ ] Annual monitoring strategy review

## Key Metrics to Monitor

### Application Metrics
- Response time (95th percentile < 2s)
- Error rate (< 1%)
- Throughput (requests/second)
- Availability (> 99.9%)

### Infrastructure Metrics
- CPU usage (< 70%)
- Memory usage (< 80%)
- Disk usage (< 85%)
- Network latency (< 100ms)

### Business Metrics
- User registrations
- Retrofit project completions
- Verification success rate
- Revenue per user

### Security Metrics
- Failed login attempts
- Suspicious API calls
- Security alerts
- Compliance violations
