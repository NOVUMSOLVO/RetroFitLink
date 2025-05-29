#!/bin/bash

# RetroFitLink Master Deployment Script
# Complete deployment pipeline for all phases

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-retrofitlink}"
ENVIRONMENT="${ENVIRONMENT:-production}"
DEPLOY_PHASES="${DEPLOY_PHASES:-1,2,3,4}"
SKIP_VALIDATION="${SKIP_VALIDATION:-false}"
MONITORING_ENABLED="${MONITORING_ENABLED:-true}"
PERFORMANCE_TESTING="${PERFORMANCE_TESTING:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

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

log_phase() {
    echo -e "${PURPLE}[PHASE]${NC} $1"
}

log_deploy() {
    echo -e "${CYAN}[DEPLOY]${NC} $1"
}

# Display banner
show_banner() {
    cat << 'EOF'
                                                                                
    ____       __            _____ _ __   __    _       __  
   / __ \___  / /__________  / __(_) /_  / /   (_)___  / /__
  / /_/ / _ \/ __/ ___/ __ \/ /_/ / __/ / /   / / __ \/ //_/
 / _, _/  __/ /_/ /  / /_/ / __/ / /_  / /___/ / / / / ,<   
/_/ |_|\___/\__/_/   \____/_/ /_/\__/ /_____/_/_/ /_/_/|_|  
                                                            
    🚀 COMPLETE DEPLOYMENT PIPELINE 🚀
    
EOF
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking deployment prerequisites..."
    
    local tools=("kubectl" "helm" "docker" "git" "curl" "jq")
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
        log_info "Please configure kubectl to connect to your cluster"
        exit 1
    fi
    
    # Check cluster resources
    local nodes=$(kubectl get nodes --no-headers | wc -l)
    if [ "$nodes" -lt 1 ]; then
        log_error "No Kubernetes nodes available"
        exit 1
    fi
    
    log_success "Prerequisites check completed"
    log_info "Kubernetes cluster: $(kubectl config current-context)"
    log_info "Available nodes: $nodes"
}

# Create namespace and RBAC
setup_namespace() {
    log_info "Setting up namespace and RBAC..."
    
    # Create namespace if it doesn't exist
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        kubectl create namespace "$NAMESPACE"
        log_success "Created namespace: $NAMESPACE"
    else
        log_info "Namespace already exists: $NAMESPACE"
    fi
    
    # Apply RBAC configuration
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: retrofitlink-deployer
  namespace: $NAMESPACE
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: retrofitlink-deployer
rules:
- apiGroups: [""]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: ["apps"]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: ["extensions"]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: ["networking.k8s.io"]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: ["autoscaling"]
  resources: ["*"]
  verbs: ["*"]
- apiGroups: ["batch"]
  resources: ["*"]
  verbs: ["*"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: retrofitlink-deployer
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: retrofitlink-deployer
subjects:
- kind: ServiceAccount
  name: retrofitlink-deployer
  namespace: $NAMESPACE
EOF
    
    log_success "RBAC configuration applied"
}

# Deploy Phase 1: Core Infrastructure
deploy_phase1() {
    log_phase "🏗️  Phase 1: Core Infrastructure & Application Deployment"
    
    if [[ "$DEPLOY_PHASES" == *"1"* ]]; then
        log_deploy "Deploying core application components..."
        
        # Check if Phase 1 script exists
        if [ -f "./scripts/deployment/deploy-phase1-core.sh" ]; then
            chmod +x "./scripts/deployment/deploy-phase1-core.sh"
            NAMESPACE="$NAMESPACE" ENVIRONMENT="$ENVIRONMENT" \
                "./scripts/deployment/deploy-phase1-core.sh"
        else
            log_warning "Phase 1 deployment script not found, deploying basic components..."
            
            # Deploy basic application components
            cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: retrofitlink-backend
  namespace: $NAMESPACE
spec:
  replicas: 3
  selector:
    matchLabels:
      app: retrofitlink-backend
  template:
    metadata:
      labels:
        app: retrofitlink-backend
    spec:
      containers:
      - name: backend
        image: node:18-alpine
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: PORT
          value: "3000"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: backend-service
  namespace: $NAMESPACE
spec:
  selector:
    app: retrofitlink-backend
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP
EOF
        fi
        
        log_success "Phase 1 deployment completed"
    else
        log_info "Skipping Phase 1 deployment"
    fi
}

# Deploy Phase 2: Security & Compliance
deploy_phase2() {
    log_phase "🔒 Phase 2: Security & Compliance"
    
    if [[ "$DEPLOY_PHASES" == *"2"* ]]; then
        log_deploy "Deploying security and compliance components..."
        
        if [ -f "./scripts/deployment/deploy-phase2-security.sh" ]; then
            chmod +x "./scripts/deployment/deploy-phase2-security.sh"
            NAMESPACE="$NAMESPACE" ENVIRONMENT="$ENVIRONMENT" \
                "./scripts/deployment/deploy-phase2-security.sh"
        else
            log_warning "Phase 2 deployment script not found, applying basic security..."
            
            # Apply basic security policies
            cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: $NAMESPACE
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-backend-traffic
  namespace: $NAMESPACE
spec:
  podSelector:
    matchLabels:
      app: retrofitlink-backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: nginx-load-balancer
    ports:
    - protocol: TCP
      port: 3000
EOF
        fi
        
        log_success "Phase 2 deployment completed"
    else
        log_info "Skipping Phase 2 deployment"
    fi
}

# Deploy Phase 3: Monitoring & Observability
deploy_phase3() {
    log_phase "📊 Phase 3: Monitoring & Observability"
    
    if [[ "$DEPLOY_PHASES" == *"3"* ]] && [ "$MONITORING_ENABLED" = "true" ]; then
        log_deploy "Deploying monitoring and observability stack..."
        
        if [ -f "./scripts/deployment/deploy-phase3-monitoring.sh" ]; then
            chmod +x "./scripts/deployment/deploy-phase3-monitoring.sh"
            NAMESPACE="$NAMESPACE" ENVIRONMENT="$ENVIRONMENT" \
                "./scripts/deployment/deploy-phase3-monitoring.sh"
        else
            log_warning "Phase 3 deployment script not found, deploying basic monitoring..."
            
            # Install basic Prometheus monitoring
            if ! helm repo list | grep -q prometheus-community; then
                helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
                helm repo update
            fi
            
            helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
                --namespace monitoring --create-namespace \
                --set grafana.adminPassword=admin123 \
                --wait
        fi
        
        log_success "Phase 3 deployment completed"
    else
        log_info "Skipping Phase 3 deployment"
    fi
}

# Deploy Phase 4: Performance & Scalability
deploy_phase4() {
    log_phase "🚀 Phase 4: Performance & Scalability"
    
    if [[ "$DEPLOY_PHASES" == *"4"* ]]; then
        log_deploy "Deploying performance and scalability optimizations..."
        
        if [ -f "./scripts/deployment/deploy-phase4-performance.sh" ]; then
            chmod +x "./scripts/deployment/deploy-phase4-performance.sh"
            NAMESPACE="$NAMESPACE" ENVIRONMENT="$ENVIRONMENT" \
                PERFORMANCE_TESTING="$PERFORMANCE_TESTING" \
                "./scripts/deployment/deploy-phase4-performance.sh"
        else
            log_warning "Phase 4 deployment script not found, applying basic optimizations..."
            
            # Apply basic HPA
            cat <<EOF | kubectl apply -f -
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: retrofitlink-backend-hpa
  namespace: $NAMESPACE
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: retrofitlink-backend
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
EOF
        fi
        
        log_success "Phase 4 deployment completed"
    else
        log_info "Skipping Phase 4 deployment"
    fi
}

# Validate deployment
validate_deployment() {
    if [ "$SKIP_VALIDATION" = "true" ]; then
        log_info "Skipping deployment validation"
        return 0
    fi
    
    log_info "Validating deployment..."
    
    local components=()
    
    # Check Phase 1 components
    if [[ "$DEPLOY_PHASES" == *"1"* ]]; then
        components+=("deployment/retrofitlink-backend")
    fi
    
    # Check Phase 4 components
    if [[ "$DEPLOY_PHASES" == *"4"* ]]; then
        components+=(
            "deployment/redis-cache"
            "statefulset/mongodb-optimized"
            "deployment/nginx-load-balancer"
        )
    fi
    
    local failed_components=()
    
    for component in "${components[@]}"; do
        log_info "Validating $component..."
        if kubectl wait --for=condition=available "$component" \
           --timeout=300s -n "$NAMESPACE" 2>/dev/null; then
            log_success "✓ $component is ready"
        else
            log_error "✗ $component failed validation"
            failed_components+=("$component")
        fi
    done
    
    # Check services
    local services=(
        "backend-service"
    )
    
    if [[ "$DEPLOY_PHASES" == *"4"* ]]; then
        services+=(
            "redis-cache"
            "mongodb-optimized"
            "nginx-load-balancer"
        )
    fi
    
    for service in "${services[@]}"; do
        if kubectl get service "$service" -n "$NAMESPACE" &> /dev/null; then
            log_success "✓ Service $service exists"
        else
            log_warning "✗ Service $service not found"
        fi
    done
    
    if [ ${#failed_components[@]} -ne 0 ]; then
        log_error "Validation failed for: ${failed_components[*]}"
        return 1
    fi
    
    log_success "Deployment validation completed successfully"
}

# Run performance tests
run_performance_tests() {
    if [ "$PERFORMANCE_TESTING" = "true" ] && [[ "$DEPLOY_PHASES" == *"4"* ]]; then
        log_info "Running performance regression tests..."
        
        if [ -f "./scripts/testing/performance-regression-tests.sh" ]; then
            chmod +x "./scripts/testing/performance-regression-tests.sh"
            
            # Get the load balancer URL
            local lb_ip
            lb_ip=$(kubectl get service nginx-load-balancer -n "$NAMESPACE" \
                -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
            
            if [ -z "$lb_ip" ]; then
                lb_ip=$(kubectl get service nginx-load-balancer -n "$NAMESPACE" \
                    -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
            fi
            
            if [ -n "$lb_ip" ]; then
                TARGET_URL="http://$lb_ip" \
                    "./scripts/testing/performance-regression-tests.sh" || true
            else
                log_warning "Could not determine load balancer IP for performance testing"
            fi
        else
            log_warning "Performance testing script not found"
        fi
    else
        log_info "Skipping performance tests"
    fi
}

# Generate deployment report
generate_report() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local report_file="/tmp/retrofitlink-deployment-report-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$report_file" << EOF
# RetroFitLink Deployment Report

**Generated:** $timestamp  
**Environment:** $ENVIRONMENT  
**Namespace:** $NAMESPACE  
**Deployed Phases:** $DEPLOY_PHASES  

## Deployment Summary

### Infrastructure Components
EOF

    # Add component status
    if [[ "$DEPLOY_PHASES" == *"1"* ]]; then
        echo "- ✅ **Phase 1**: Core Infrastructure & Application" >> "$report_file"
    fi
    
    if [[ "$DEPLOY_PHASES" == *"2"* ]]; then
        echo "- ✅ **Phase 2**: Security & Compliance" >> "$report_file"
    fi
    
    if [[ "$DEPLOY_PHASES" == *"3"* ]] && [ "$MONITORING_ENABLED" = "true" ]; then
        echo "- ✅ **Phase 3**: Monitoring & Observability" >> "$report_file"
    fi
    
    if [[ "$DEPLOY_PHASES" == *"4"* ]]; then
        echo "- ✅ **Phase 4**: Performance & Scalability" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

### Deployed Resources

#### Kubernetes Resources
\`\`\`bash
# View all resources
kubectl get all -n $NAMESPACE

# Check pod status
kubectl get pods -n $NAMESPACE -o wide

# View services
kubectl get services -n $NAMESPACE
\`\`\`

#### Access Information
EOF

    # Add access information
    if [[ "$DEPLOY_PHASES" == *"3"* ]] && [ "$MONITORING_ENABLED" = "true" ]; then
        cat >> "$report_file" << EOF

**Monitoring Access:**
- Grafana: \`kubectl port-forward -n monitoring service/prometheus-grafana 3000:80\`
- Prometheus: \`kubectl port-forward -n monitoring service/prometheus-kube-prometheus-prometheus 9090:9090\`
EOF
    fi
    
    if [[ "$DEPLOY_PHASES" == *"4"* ]]; then
        cat >> "$report_file" << EOF

**Application Access:**
- Load Balancer: \`kubectl get service nginx-load-balancer -n $NAMESPACE\`
- Backend API: Available through load balancer at \`/api\`
EOF
    fi
    
    cat >> "$report_file" << EOF

### Next Steps

1. **Verify Application**: Test application functionality
2. **Configure DNS**: Point domain to load balancer IP
3. **SSL Certificates**: Configure TLS certificates
4. **Monitoring**: Set up alerting and dashboards
5. **Backup**: Configure backup strategies
6. **Documentation**: Update deployment documentation

### Troubleshooting

\`\`\`bash
# Check pod logs
kubectl logs -n $NAMESPACE -l app=retrofitlink-backend --tail=100

# Check events
kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp'

# Check resource usage
kubectl top pods -n $NAMESPACE

# Restart deployment if needed
kubectl rollout restart deployment/retrofitlink-backend -n $NAMESPACE
\`\`\`

### Support

For issues or questions:
- Check deployment logs: \`kubectl logs -n $NAMESPACE deployment/retrofitlink-backend\`
- Review Kubernetes events: \`kubectl get events -n $NAMESPACE\`
- Contact support team with this report

---
**Report generated by RetroFitLink Master Deployment Script**
EOF
    
    echo "$report_file"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f /tmp/k6-*.json /tmp/performance-*.csv
}

# Signal handler
handle_signal() {
    log_warning "Deployment interrupted by user"
    cleanup
    exit 130
}

# Main deployment function
main() {
    # Set signal handlers
    trap handle_signal INT TERM
    
    show_banner
    
    log_info "🚀 Starting RetroFitLink Complete Deployment"
    log_info "Environment: $ENVIRONMENT"
    log_info "Namespace: $NAMESPACE"
    log_info "Phases: $DEPLOY_PHASES"
    log_info "Monitoring: $MONITORING_ENABLED"
    log_info "Performance Testing: $PERFORMANCE_TESTING"
    echo ""
    
    local start_time=$(date +%s)
    
    # Deployment steps
    check_prerequisites
    setup_namespace
    deploy_phase1
    deploy_phase2
    deploy_phase3
    deploy_phase4
    validate_deployment
    run_performance_tests
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Generate deployment report
    local report_file
    report_file=$(generate_report)
    
    cleanup
    
    log_success "🎉 RetroFitLink deployment completed successfully!"
    log_info "⏱️  Total deployment time: ${duration} seconds"
    log_info "📊 Deployment report: $report_file"
    
    echo ""
    cat << EOF
┌─────────────────────────────────────────────────────────────┐
│                    🎯 DEPLOYMENT COMPLETE                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✅ RetroFitLink is now running in production!             │
│                                                             │
│  📊 Access your application:                               │
│     kubectl get service -n $NAMESPACE                      │
│                                                             │
│  📈 Monitor performance:                                   │
│     kubectl port-forward -n monitoring svc/grafana 3000    │
│                                                             │
│  🔧 Manage deployment:                                     │
│     kubectl get all -n $NAMESPACE                          │
│                                                             │
│  📋 View report: $report_file                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
EOF
}

# Display help
show_help() {
    cat << EOF
RetroFitLink Master Deployment Script

USAGE:
    $0 [OPTIONS]

OPTIONS:
    -h, --help                 Show this help message
    -n, --namespace NAMESPACE  Kubernetes namespace (default: retrofitlink)
    -e, --environment ENV      Environment (default: production)
    -p, --phases PHASES        Phases to deploy (default: 1,2,3,4)
    -m, --monitoring           Enable monitoring (default: true)
    -t, --testing              Enable performance testing (default: false)
    -s, --skip-validation      Skip deployment validation (default: false)

EXAMPLES:
    # Deploy all phases
    $0

    # Deploy only core infrastructure
    $0 --phases 1

    # Deploy with performance testing
    $0 --testing true

    # Deploy to development environment
    $0 --environment development --namespace dev

ENVIRONMENT VARIABLES:
    NAMESPACE               Kubernetes namespace
    ENVIRONMENT             Deployment environment
    DEPLOY_PHASES           Comma-separated list of phases (1,2,3,4)
    MONITORING_ENABLED      Enable monitoring stack (true/false)
    PERFORMANCE_TESTING     Enable performance testing (true/false)
    SKIP_VALIDATION         Skip deployment validation (true/false)

PHASES:
    1. Core Infrastructure & Application Deployment
    2. Security & Compliance
    3. Monitoring & Observability  
    4. Performance & Scalability

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -p|--phases)
            DEPLOY_PHASES="$2"
            shift 2
            ;;
        -m|--monitoring)
            MONITORING_ENABLED="$2"
            shift 2
            ;;
        -t|--testing)
            PERFORMANCE_TESTING="$2"
            shift 2
            ;;
        -s|--skip-validation)
            SKIP_VALIDATION="$2"
            shift 2
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Run main function
main "$@"
