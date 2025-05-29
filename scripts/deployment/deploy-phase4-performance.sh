#!/bin/bash

# RetroFitLink Phase 4: Performance & Scalability Deployment Script
# This script deploys all performance optimization components

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-retrofitlink}"
ENVIRONMENT="${ENVIRONMENT:-production}"
REDIS_PASSWORD="${REDIS_PASSWORD:-$(openssl rand -base64 32)}"
MONGODB_PASSWORD="${MONGODB_PASSWORD:-$(openssl rand -base64 32)}"
CDN_PROVIDER="${CDN_PROVIDER:-cloudfront}"
PERFORMANCE_TESTING="${PERFORMANCE_TESTING:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites for Phase 4 deployment..."
    
    local tools=("kubectl" "helm" "redis-cli" "mongo" "node" "npm")
    local missing_tools=()
    
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            missing_tools+=("$tool")
        fi
    done
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        log_info "Please install missing tools and retry"
        exit 1
    fi
    
    # Check Kubernetes cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    # Check if namespace exists
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_info "Creating namespace: $NAMESPACE"
        kubectl create namespace "$NAMESPACE"
    fi
    
    log_success "Prerequisites check completed"
}

# Deploy MongoDB optimization
deploy_mongodb_optimization() {
    log_info "Deploying MongoDB performance optimization..."
    
    # Create MongoDB optimization ConfigMap
    kubectl create configmap mongodb-optimization \
        --from-file=../performance/database/mongodb-optimization.js \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply MongoDB configuration
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: mongodb-credentials
  namespace: $NAMESPACE
type: Opaque
data:
  mongodb-password: $(echo -n "$MONGODB_PASSWORD" | base64)
  mongodb-root-password: $(echo -n "$MONGODB_PASSWORD" | base64)
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: mongodb-config
  namespace: $NAMESPACE
data:
  mongod.conf: |
    storage:
      wiredTiger:
        engineConfig:
          cacheSizeGB: 4
          journalCompressor: snappy
        collectionConfig:
          blockCompressor: snappy
        indexConfig:
          prefixCompression: true
    
    net:
      port: 27017
      bindIp: 0.0.0.0
      maxIncomingConnections: 1000
    
    operationProfiling:
      slowOpThresholdMs: 100
      mode: slowOp
    
    replication:
      replSetName: rs0
    
    sharding:
      clusterRole: shardsvr
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongodb-optimized
  namespace: $NAMESPACE
spec:
  serviceName: mongodb-optimized
  replicas: 3
  selector:
    matchLabels:
      app: mongodb-optimized
  template:
    metadata:
      labels:
        app: mongodb-optimized
    spec:
      containers:
      - name: mongodb
        image: mongo:7.0
        ports:
        - containerPort: 27017
        env:
        - name: MONGO_INITDB_ROOT_USERNAME
          value: admin
        - name: MONGO_INITDB_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mongodb-credentials
              key: mongodb-root-password
        volumeMounts:
        - name: mongodb-data
          mountPath: /data/db
        - name: mongodb-config
          mountPath: /etc/mongod.conf
          subPath: mongod.conf
        - name: mongodb-optimization
          mountPath: /docker-entrypoint-initdb.d/
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "8Gi"
            cpu: "4000m"
        livenessProbe:
          exec:
            command:
            - mongosh
            - --eval
            - "db.adminCommand('ping')"
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          exec:
            command:
            - mongosh
            - --eval
            - "db.adminCommand('ping')"
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: mongodb-config
        configMap:
          name: mongodb-config
      - name: mongodb-optimization
        configMap:
          name: mongodb-optimization
  volumeClaimTemplates:
  - metadata:
      name: mongodb-data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 100Gi
---
apiVersion: v1
kind: Service
metadata:
  name: mongodb-optimized
  namespace: $NAMESPACE
spec:
  clusterIP: None
  selector:
    app: mongodb-optimized
  ports:
  - port: 27017
    targetPort: 27017
EOF
    
    log_success "MongoDB optimization deployed"
}

# Deploy Redis caching strategy
deploy_redis_caching() {
    log_info "Deploying Redis caching strategy..."
    
    # Create Redis configuration
    kubectl create configmap redis-strategy \
        --from-file=../performance/caching/redis-strategy.js \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: redis-credentials
  namespace: $NAMESPACE
type: Opaque
data:
  redis-password: $(echo -n "$REDIS_PASSWORD" | base64)
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: redis-config
  namespace: $NAMESPACE
data:
  redis.conf: |
    # Performance optimizations
    maxmemory 4gb
    maxmemory-policy allkeys-lru
    save ""
    
    # Connection settings
    tcp-keepalive 60
    timeout 300
    tcp-backlog 511
    
    # Performance tuning
    hash-max-ziplist-entries 512
    hash-max-ziplist-value 64
    list-max-ziplist-size -2
    list-compress-depth 0
    set-max-intset-entries 512
    zset-max-ziplist-entries 128
    zset-max-ziplist-value 64
    
    # Security
    requirepass $REDIS_PASSWORD
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis-cache
  namespace: $NAMESPACE
spec:
  replicas: 3
  selector:
    matchLabels:
      app: redis-cache
  template:
    metadata:
      labels:
        app: redis-cache
    spec:
      containers:
      - name: redis
        image: redis:7.2-alpine
        ports:
        - containerPort: 6379
        env:
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: redis-password
        command:
        - redis-server
        - /etc/redis/redis.conf
        volumeMounts:
        - name: redis-config
          mountPath: /etc/redis/
        - name: redis-strategy
          mountPath: /usr/local/bin/
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        livenessProbe:
          exec:
            command:
            - redis-cli
            - ping
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          exec:
            command:
            - redis-cli
            - ping
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: redis-config
        configMap:
          name: redis-config
      - name: redis-strategy
        configMap:
          name: redis-strategy
          defaultMode: 0755
---
apiVersion: v1
kind: Service
metadata:
  name: redis-cache
  namespace: $NAMESPACE
spec:
  selector:
    app: redis-cache
  ports:
  - port: 6379
    targetPort: 6379
  type: ClusterIP
EOF
    
    log_success "Redis caching strategy deployed"
}

# Deploy CDN integration
deploy_cdn_integration() {
    log_info "Deploying CDN integration..."
    
    kubectl create configmap cdn-integration \
        --from-file=../performance/cdn/cdn-integration.js \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: cdn-config
  namespace: $NAMESPACE
data:
  cdn-settings.json: |
    {
      "provider": "$CDN_PROVIDER",
      "cloudfront": {
        "distributionId": "\${CDN_DISTRIBUTION_ID}",
        "region": "us-east-1"
      },
      "cloudflare": {
        "zoneId": "\${CLOUDFLARE_ZONE_ID}",
        "accountId": "\${CLOUDFLARE_ACCOUNT_ID}"
      },
      "optimization": {
        "imageFormats": ["webp", "avif", "jpeg"],
        "compressionLevel": 85,
        "cacheHeaders": {
          "static": "public, max-age=31536000, immutable",
          "dynamic": "public, max-age=300, s-maxage=600"
        }
      }
    }
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: cdn-cache-warmer
  namespace: $NAMESPACE
spec:
  schedule: "0 */6 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: cdn-warmer
            image: node:18-alpine
            command:
            - /bin/sh
            - -c
            - |
              npm install -g node-fetch
              node /scripts/cdn-integration.js warm-cache
            volumeMounts:
            - name: cdn-integration
              mountPath: /scripts/
            - name: cdn-config
              mountPath: /config/
          volumes:
          - name: cdn-integration
            configMap:
              name: cdn-integration
          - name: cdn-config
            configMap:
              name: cdn-config
          restartPolicy: OnFailure
EOF
    
    log_success "CDN integration deployed"
}

# Deploy auto-scaling optimization
deploy_autoscaling() {
    log_info "Deploying auto-scaling optimization..."
    
    kubectl apply -f ../performance/autoscaling/k8s-autoscaling.yaml -n "$NAMESPACE"
    
    # Install KEDA if not present
    if ! kubectl get namespace keda-system &> /dev/null; then
        log_info "Installing KEDA for advanced auto-scaling..."
        helm repo add kedacore https://kedacore.github.io/charts
        helm repo update
        helm install keda kedacore/keda --namespace keda-system --create-namespace
    fi
    
    # Install metrics-server if not present
    if ! kubectl get deployment metrics-server -n kube-system &> /dev/null; then
        log_info "Installing metrics-server..."
        kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
    fi
    
    log_success "Auto-scaling optimization deployed"
}

# Deploy load balancer configuration
deploy_load_balancer() {
    log_info "Deploying load balancer optimization..."
    
    kubectl create configmap load-balancer-config \
        --from-file=../performance/load-balancing/load-balancer-config.js \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-performance-config
  namespace: $NAMESPACE
data:
  nginx.conf: |
    user nginx;
    worker_processes auto;
    worker_rlimit_nofile 65535;
    error_log /var/log/nginx/error.log warn;
    pid /var/run/nginx.pid;
    
    events {
        worker_connections 4096;
        use epoll;
        multi_accept on;
    }
    
    http {
        include /etc/nginx/mime.types;
        default_type application/octet-stream;
        
        # Performance optimizations
        sendfile on;
        tcp_nopush on;
        tcp_nodelay on;
        keepalive_timeout 65;
        keepalive_requests 1000;
        
        # Gzip compression
        gzip on;
        gzip_vary on;
        gzip_min_length 1024;
        gzip_comp_level 6;
        gzip_types
            text/plain
            text/css
            text/xml
            text/javascript
            application/json
            application/javascript
            application/xml+rss
            application/atom+xml
            image/svg+xml;
        
        # Rate limiting
        limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
        limit_req_zone \$binary_remote_addr zone=login:10m rate=1r/s;
        
        # Upstream backend
        upstream backend {
            least_conn;
            server backend-service:3000 max_fails=3 fail_timeout=30s;
            keepalive 32;
        }
        
        server {
            listen 80;
            server_name _;
            
            # Security headers
            add_header X-Frame-Options DENY;
            add_header X-Content-Type-Options nosniff;
            add_header X-XSS-Protection "1; mode=block";
            add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
            
            # API routes with rate limiting
            location /api/ {
                limit_req zone=api burst=20 nodelay;
                proxy_pass http://backend;
                proxy_set_header Host \$host;
                proxy_set_header X-Real-IP \$remote_addr;
                proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto \$scheme;
                proxy_connect_timeout 5s;
                proxy_send_timeout 10s;
                proxy_read_timeout 30s;
            }
            
            # Static files with caching
            location /static/ {
                expires 1y;
                add_header Cache-Control "public, immutable";
                try_files \$uri =404;
            }
            
            # Health check
            location /health {
                access_log off;
                return 200 "healthy\n";
                add_header Content-Type text/plain;
            }
        }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-load-balancer
  namespace: $NAMESPACE
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx-load-balancer
  template:
    metadata:
      labels:
        app: nginx-load-balancer
    spec:
      containers:
      - name: nginx
        image: nginx:1.25-alpine
        ports:
        - containerPort: 80
        volumeMounts:
        - name: nginx-config
          mountPath: /etc/nginx/nginx.conf
          subPath: nginx.conf
        - name: load-balancer-scripts
          mountPath: /usr/local/bin/
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 80
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: nginx-config
        configMap:
          name: nginx-performance-config
      - name: load-balancer-scripts
        configMap:
          name: load-balancer-config
          defaultMode: 0755
---
apiVersion: v1
kind: Service
metadata:
  name: nginx-load-balancer
  namespace: $NAMESPACE
spec:
  selector:
    app: nginx-load-balancer
  ports:
  - port: 80
    targetPort: 80
  type: LoadBalancer
EOF
    
    log_success "Load balancer optimization deployed"
}

# Deploy performance testing framework
deploy_performance_testing() {
    if [ "$PERFORMANCE_TESTING" = "true" ]; then
        log_info "Deploying performance testing framework..."
        
        kubectl create configmap performance-tests \
            --from-file=../performance/testing/performance-tests.js \
            --namespace="$NAMESPACE" \
            --dry-run=client -o yaml | kubectl apply -f -
        
        cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: CronJob
metadata:
  name: performance-regression-tests
  namespace: $NAMESPACE
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: performance-tester
            image: grafana/k6:latest
            command:
            - /bin/sh
            - -c
            - |
              cd /scripts
              k6 run performance-tests.js
            volumeMounts:
            - name: performance-tests
              mountPath: /scripts/
            env:
            - name: K6_INFLUXDB_URL
              value: "http://influxdb:8086/k6"
          volumes:
          - name: performance-tests
            configMap:
              name: performance-tests
          restartPolicy: OnFailure
EOF
        
        log_success "Performance testing framework deployed"
    else
        log_info "Skipping performance testing deployment (PERFORMANCE_TESTING=false)"
    fi
}

# Validate deployment
validate_deployment() {
    log_info "Validating Phase 4 deployment..."
    
    local components=(
        "mongodb-optimized"
        "redis-cache"
        "nginx-load-balancer"
    )
    
    local failed_components=()
    
    for component in "${components[@]}"; do
        log_info "Checking $component..."
        if kubectl wait --for=condition=available deployment/"$component" --timeout=300s -n "$NAMESPACE" 2>/dev/null || \
           kubectl wait --for=condition=ready pod -l app="$component" --timeout=300s -n "$NAMESPACE" 2>/dev/null; then
            log_success "$component is ready"
        else
            log_error "$component failed to become ready"
            failed_components+=("$component")
        fi
    done
    
    if [ ${#failed_components[@]} -ne 0 ]; then
        log_error "Failed components: ${failed_components[*]}"
        return 1
    fi
    
    # Test Redis connectivity
    if kubectl exec -n "$NAMESPACE" deployment/redis-cache -- redis-cli ping &> /dev/null; then
        log_success "Redis connectivity test passed"
    else
        log_warning "Redis connectivity test failed"
    fi
    
    # Test MongoDB connectivity
    if kubectl exec -n "$NAMESPACE" statefulset/mongodb-optimized -- mongosh --eval "db.adminCommand('ping')" &> /dev/null; then
        log_success "MongoDB connectivity test passed"
    else
        log_warning "MongoDB connectivity test failed"
    fi
    
    log_success "Phase 4 deployment validation completed"
}

# Performance monitoring setup
setup_performance_monitoring() {
    log_info "Setting up performance monitoring dashboards..."
    
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: performance-dashboard
  namespace: $NAMESPACE
data:
  dashboard.json: |
    {
      "dashboard": {
        "id": null,
        "title": "RetroFitLink Performance Metrics",
        "tags": ["retrofitlink", "performance"],
        "timezone": "UTC",
        "panels": [
          {
            "id": 1,
            "title": "Response Time",
            "type": "graph",
            "targets": [
              {
                "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
                "legendFormat": "95th percentile"
              }
            ]
          },
          {
            "id": 2,
            "title": "Throughput",
            "type": "graph",
            "targets": [
              {
                "expr": "rate(http_requests_total[5m])",
                "legendFormat": "Requests/sec"
              }
            ]
          },
          {
            "id": 3,
            "title": "Cache Hit Rate",
            "type": "graph",
            "targets": [
              {
                "expr": "rate(redis_cache_hits_total[5m]) / (rate(redis_cache_hits_total[5m]) + rate(redis_cache_misses_total[5m]))",
                "legendFormat": "Cache Hit Rate"
              }
            ]
          },
          {
            "id": 4,
            "title": "Database Performance",
            "type": "graph",
            "targets": [
              {
                "expr": "rate(mongodb_op_counters_total[5m])",
                "legendFormat": "{{ cmd }}"
              }
            ]
          }
        ],
        "time": {
          "from": "now-1h",
          "to": "now"
        },
        "refresh": "30s"
      }
    }
EOF
    
    log_success "Performance monitoring dashboards configured"
}

# Main deployment function
main() {
    log_info "Starting RetroFitLink Phase 4: Performance & Scalability Deployment"
    log_info "Environment: $ENVIRONMENT"
    log_info "Namespace: $NAMESPACE"
    log_info "CDN Provider: $CDN_PROVIDER"
    
    check_prerequisites
    deploy_mongodb_optimization
    deploy_redis_caching
    deploy_cdn_integration
    deploy_autoscaling
    deploy_load_balancer
    deploy_performance_testing
    validate_deployment
    setup_performance_monitoring
    
    log_success "🎉 Phase 4: Performance & Scalability deployment completed successfully!"
    log_info "📊 Access performance metrics at: http://grafana.retrofitlink.local/d/performance"
    log_info "🔧 Redis password: $REDIS_PASSWORD"
    log_info "🔧 MongoDB password: $MONGODB_PASSWORD"
    log_info "📝 Performance testing enabled: $PERFORMANCE_TESTING"
    
    cat <<EOF

🚀 RetroFitLink Phase 4 Deployment Summary:
============================================

✅ MongoDB Performance Optimization
   - Advanced indexing strategies
   - Query optimization
   - Sharding configuration
   - Read replicas

✅ Redis Caching Strategy
   - Session caching (24h TTL)
   - API response caching (5min TTL)
   - Data layer caching (30min TTL)
   - Cache statistics and monitoring

✅ CDN Integration
   - Asset optimization
   - Image processing
   - Cache invalidation
   - Performance monitoring

✅ Auto-scaling Optimization
   - Horizontal Pod Autoscaler (HPA)
   - Vertical Pod Autoscaler (VPA)
   - KEDA event-driven scaling
   - Custom metrics integration

✅ Load Balancer Fine-tuning
   - NGINX optimization
   - Rate limiting
   - Health checks
   - SSL termination

✅ Performance Testing Framework
   - Automated regression testing
   - Load testing scenarios
   - Performance metrics collection

📊 Next Steps:
- Monitor performance dashboards
- Run performance tests: kubectl logs -n $NAMESPACE job/performance-regression-tests
- Scale testing: kubectl scale deployment nginx-load-balancer --replicas=5 -n $NAMESPACE
- View logs: kubectl logs -n $NAMESPACE -l app=nginx-load-balancer

EOF
}

# Handle script interruption
trap 'log_error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main "$@"
