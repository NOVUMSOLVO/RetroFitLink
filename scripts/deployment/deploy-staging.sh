#!/bin/bash

# RetroFitLink Staging Deployment Script
# Deploys to staging environment with reduced resources and monitoring

set -euo pipefail

# Configuration
NAMESPACE="retrofitlink-staging"
RELEASE_NAME="retrofitlink-staging"
HELM_CHART_PATH="./helm/retrofitlink"
VALUES_FILE="./helm/retrofitlink/values-staging.yaml"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-retrofitlink}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    log "Checking dependencies..."
    
    local deps=("kubectl" "helm" "docker")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            error "$dep is not installed or not in PATH"
            exit 1
        fi
    done
    
    success "All dependencies are available"
}

# Verify kubectl context
verify_kubectl_context() {
    log "Verifying kubectl context..."
    
    local current_context
    current_context=$(kubectl config current-context)
    
    if [[ ! "$current_context" =~ staging ]]; then
        warning "Current kubectl context: $current_context"
        warning "This doesn't appear to be a staging context"
        read -p "Continue with current context? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Deployment cancelled"
            exit 0
        fi
    fi
    
    success "kubectl context verified: $current_context"
}

# Create namespace if it doesn't exist
create_namespace() {
    log "Ensuring namespace exists..."
    
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        kubectl create namespace "$NAMESPACE"
        success "Created namespace: $NAMESPACE"
    else
        log "Namespace $NAMESPACE already exists"
    fi
    
    # Label namespace for monitoring
    kubectl label namespace "$NAMESPACE" monitoring=enabled --overwrite
}

# Build and push Docker images
build_and_push_images() {
    log "Building and pushing Docker images..."
    
    # Build backend image
    log "Building backend image..."
    docker build -t "${DOCKER_REGISTRY}/backend:${IMAGE_TAG}-staging" ./backend
    docker push "${DOCKER_REGISTRY}/backend:${IMAGE_TAG}-staging"
    
    # Build frontend image
    log "Building frontend image..."
    docker build -t "${DOCKER_REGISTRY}/frontend:${IMAGE_TAG}-staging" ./frontend
    docker push "${DOCKER_REGISTRY}/frontend:${IMAGE_TAG}-staging"
    
    # Build blockchain image
    log "Building blockchain image..."
    docker build -t "${DOCKER_REGISTRY}/blockchain:${IMAGE_TAG}-staging" ./blockchain
    docker push "${DOCKER_REGISTRY}/blockchain:${IMAGE_TAG}-staging"
    
    # Build IoT simulator image
    log "Building IoT simulator image..."
    docker build -t "${DOCKER_REGISTRY}/iot-simulator:${IMAGE_TAG}-staging" ./iot-simulator
    docker push "${DOCKER_REGISTRY}/iot-simulator:${IMAGE_TAG}-staging"
    
    success "All images built and pushed successfully"
}

# Check Helm chart syntax
validate_helm_chart() {
    log "Validating Helm chart..."
    
    helm lint "$HELM_CHART_PATH"
    
    # Dry run to check for issues
    helm upgrade "$RELEASE_NAME" "$HELM_CHART_PATH" \
        --namespace "$NAMESPACE" \
        --values "$VALUES_FILE" \
        --set global.environment="staging" \
        --set backend.image.tag="${IMAGE_TAG}-staging" \
        --set frontend.image.tag="${IMAGE_TAG}-staging" \
        --set blockchain.image.tag="${IMAGE_TAG}-staging" \
        --set iotSimulator.image.tag="${IMAGE_TAG}-staging" \
        --dry-run \
        --debug
    
    success "Helm chart validation passed"
}

# Deploy to staging
deploy_staging() {
    log "Deploying to staging environment..."
    
    helm upgrade --install "$RELEASE_NAME" "$HELM_CHART_PATH" \
        --namespace "$NAMESPACE" \
        --create-namespace \
        --values "$VALUES_FILE" \
        --set global.environment="staging" \
        --set backend.image.tag="${IMAGE_TAG}-staging" \
        --set frontend.image.tag="${IMAGE_TAG}-staging" \
        --set blockchain.image.tag="${IMAGE_TAG}-staging" \
        --set iotSimulator.image.tag="${IMAGE_TAG}-staging" \
        --wait \
        --timeout=10m
    
    success "Staging deployment completed"
}

# Wait for deployment to be ready
wait_for_deployment() {
    log "Waiting for deployment to be ready..."
    
    local components=("backend" "frontend" "blockchain")
    
    for component in "${components[@]}"; do
        log "Waiting for $component deployment..."
        kubectl rollout status deployment/"$RELEASE_NAME-$component" \
            --namespace="$NAMESPACE" \
            --timeout=300s
    done
    
    success "All deployments are ready"
}

# Run health checks
health_check() {
    log "Running health checks..."
    
    # Get service endpoints
    local backend_service
    backend_service=$(kubectl get service "$RELEASE_NAME-backend" \
        --namespace="$NAMESPACE" \
        -o jsonpath='{.spec.clusterIP}:{.spec.ports[0].port}')
    
    # Port forward for testing
    kubectl port-forward service/"$RELEASE_NAME-backend" 8080:5000 \
        --namespace="$NAMESPACE" &
    local port_forward_pid=$!
    
    sleep 5
    
    # Test health endpoint
    if curl -f http://localhost:8080/health &> /dev/null; then
        success "Backend health check passed"
    else
        error "Backend health check failed"
        kill $port_forward_pid 2>/dev/null || true
        exit 1
    fi
    
    kill $port_forward_pid 2>/dev/null || true
    
    success "Health checks completed successfully"
}

# Display deployment information
show_deployment_info() {
    log "Deployment Information:"
    echo
    echo "Namespace: $NAMESPACE"
    echo "Release: $RELEASE_NAME"
    echo "Environment: staging"
    echo "Image Tag: ${IMAGE_TAG}-staging"
    echo
    
    log "Application Components:"
    kubectl get pods --namespace="$NAMESPACE" -l app.kubernetes.io/instance="$RELEASE_NAME"
    echo
    
    log "Services:"
    kubectl get services --namespace="$NAMESPACE" -l app.kubernetes.io/instance="$RELEASE_NAME"
    echo
    
    log "Ingress:"
    kubectl get ingress --namespace="$NAMESPACE" -l app.kubernetes.io/instance="$RELEASE_NAME"
    echo
    
    log "Access URLs:"
    local ingress_ip
    ingress_ip=$(kubectl get ingress "$RELEASE_NAME-ingress" \
        --namespace="$NAMESPACE" \
        -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")
    
    if [[ "$ingress_ip" != "pending" && -n "$ingress_ip" ]]; then
        echo "Frontend: http://$ingress_ip"
        echo "Backend API: http://$ingress_ip/api"
        echo "Health Check: http://$ingress_ip/health"
    else
        echo "Ingress IP is still pending. Check again in a few minutes."
    fi
}

# Cleanup function
cleanup() {
    log "Cleaning up..."
    # Kill any remaining port-forward processes
    pkill -f "kubectl port-forward" 2>/dev/null || true
}

# Main deployment flow
main() {
    log "Starting RetroFitLink staging deployment..."
    
    # Set up cleanup trap
    trap cleanup EXIT
    
    # Run deployment steps
    check_dependencies
    verify_kubectl_context
    create_namespace
    build_and_push_images
    validate_helm_chart
    deploy_staging
    wait_for_deployment
    health_check
    show_deployment_info
    
    success "🎉 RetroFitLink staging deployment completed successfully!"
    
    log "Next steps:"
    echo "1. Run integration tests against the staging environment"
    echo "2. Verify all features are working correctly"
    echo "3. Monitor logs and metrics for any issues"
    echo "4. If everything looks good, proceed with production deployment"
    echo
    echo "To monitor the deployment:"
    echo "kubectl logs -f deployment/$RELEASE_NAME-backend --namespace=$NAMESPACE"
    echo "kubectl get events --namespace=$NAMESPACE --sort-by='.lastTimestamp'"
}

# Error handling
set -E
trap 'error "Deployment failed on line $LINENO. Exit code: $?"' ERR

# Run if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
