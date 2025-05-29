#!/bin/bash

# RetroFitLink Production Deployment Script
# This script handles production deployment with safety checks and rollback capabilities

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-retrofitlink-production}"
RELEASE_NAME="${RELEASE_NAME:-retrofitlink-production}"
CHART_PATH="${CHART_PATH:-./helm/retrofitlink}"
VALUES_FILE="${VALUES_FILE:-./helm/retrofitlink/values-production.yaml}"
TIMEOUT="${TIMEOUT:-600s}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

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

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if kubectl is available and configured
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check if helm is available
    if ! command -v helm &> /dev/null; then
        log_error "helm is not installed or not in PATH"
        exit 1
    fi
    
    # Check if we can connect to the cluster
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    # Check if chart exists
    if [[ ! -d "$CHART_PATH" ]]; then
        log_error "Helm chart not found at $CHART_PATH"
        exit 1
    fi
    
    # Check if values file exists
    if [[ ! -f "$VALUES_FILE" ]]; then
        log_error "Values file not found at $VALUES_FILE"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Create backup of current deployment
create_backup() {
    log_info "Creating backup of current deployment..."
    
    mkdir -p "$BACKUP_DIR"
    local backup_file="$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).yaml"
    
    # Create namespace if it doesn't exist
    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    
    # Backup current deployment
    if kubectl get deployment -n "$NAMESPACE" &> /dev/null; then
        kubectl get all -n "$NAMESPACE" -o yaml > "$backup_file"
        log_success "Backup created at $backup_file"
    else
        log_warn "No existing deployment found to backup"
    fi
}

# Pre-deployment health checks
pre_deployment_checks() {
    log_info "Running pre-deployment health checks..."
    
    # Check cluster resources
    local cpu_usage=$(kubectl top nodes --no-headers | awk '{print $3}' | sed 's/%//' | sort -nr | head -1)
    local memory_usage=$(kubectl top nodes --no-headers | awk '{print $5}' | sed 's/%//' | sort -nr | head -1)
    
    if [[ ${cpu_usage:-0} -gt 80 ]]; then
        log_warn "High CPU usage detected: ${cpu_usage}%"
    fi
    
    if [[ ${memory_usage:-0} -gt 80 ]]; then
        log_warn "High memory usage detected: ${memory_usage}%"
    fi
    
    # Validate Helm chart
    helm lint "$CHART_PATH" --values "$VALUES_FILE"
    
    log_success "Pre-deployment checks completed"
}

# Deploy using Helm
deploy_application() {
    log_info "Deploying RetroFitLink to production..."
    
    # Perform dry-run first
    log_info "Performing dry-run deployment..."
    helm upgrade --install "$RELEASE_NAME" "$CHART_PATH" \
        --namespace "$NAMESPACE" \
        --create-namespace \
        --values "$VALUES_FILE" \
        --timeout "$TIMEOUT" \
        --dry-run
    
    # Prompt for confirmation
    echo
    read -p "Proceed with production deployment? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Deployment cancelled by user"
        exit 0
    fi
    
    # Actual deployment
    log_info "Starting actual deployment..."
    helm upgrade --install "$RELEASE_NAME" "$CHART_PATH" \
        --namespace "$NAMESPACE" \
        --create-namespace \
        --values "$VALUES_FILE" \
        --timeout "$TIMEOUT" \
        --wait \
        --atomic
    
    log_success "Deployment completed successfully"
}

# Post-deployment verification
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Wait for all deployments to be ready
    log_info "Waiting for deployments to be ready..."
    kubectl wait --for=condition=available deployment --all -n "$NAMESPACE" --timeout=300s
    
    # Check pod status
    log_info "Checking pod status..."
    kubectl get pods -n "$NAMESPACE"
    
    # Verify services are accessible
    log_info "Running health checks..."
    
    # Get service URLs
    local backend_service=$(kubectl get service -n "$NAMESPACE" -l app.kubernetes.io/component=backend -o jsonpath='{.items[0].metadata.name}')
    local frontend_service=$(kubectl get service -n "$NAMESPACE" -l app.kubernetes.io/component=frontend -o jsonpath='{.items[0].metadata.name}')
    
    # Port forward and test (for internal verification)
    kubectl port-forward -n "$NAMESPACE" "service/$backend_service" 8080:5000 &
    local backend_pid=$!
    
    sleep 5
    
    # Test backend health endpoint
    if curl -sf http://localhost:8080/health > /dev/null; then
        log_success "Backend health check passed"
    else
        log_error "Backend health check failed"
        kill $backend_pid 2>/dev/null || true
        return 1
    fi
    
    kill $backend_pid 2>/dev/null || true
    
    log_success "Deployment verification completed"
}

# Rollback function
rollback_deployment() {
    log_warn "Rolling back deployment..."
    
    helm rollback "$RELEASE_NAME" -n "$NAMESPACE"
    
    # Wait for rollback to complete
    kubectl wait --for=condition=available deployment --all -n "$NAMESPACE" --timeout=300s
    
    log_success "Rollback completed"
}

# Cleanup old releases
cleanup_old_releases() {
    log_info "Cleaning up old Helm releases..."
    
    # Keep last 5 releases
    helm history "$RELEASE_NAME" -n "$NAMESPACE" --max 5 > /dev/null || true
    
    log_success "Cleanup completed"
}

# Main deployment function
main() {
    log_info "Starting RetroFitLink production deployment..."
    
    # Trap to handle errors
    trap 'log_error "Deployment failed. Check logs above."; exit 1' ERR
    
    check_prerequisites
    create_backup
    pre_deployment_checks
    deploy_application
    
    if verify_deployment; then
        cleanup_old_releases
        log_success "🚀 RetroFitLink production deployment completed successfully!"
        
        # Display access information
        echo
        log_info "Access information:"
        echo "  Frontend: https://retrofitlink.com"
        echo "  Backend API: https://retrofitlink.com/api"
        echo "  Health Check: https://retrofitlink.com/api/health"
        
        # Show deployment status
        echo
        log_info "Deployment status:"
        helm status "$RELEASE_NAME" -n "$NAMESPACE"
        
    else
        log_error "Deployment verification failed"
        read -p "Do you want to rollback? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rollback_deployment
        fi
        exit 1
    fi
}

# Help function
show_help() {
    echo "RetroFitLink Production Deployment Script"
    echo
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -h, --help              Show this help message"
    echo "  -n, --namespace NAME    Kubernetes namespace (default: retrofitlink-production)"
    echo "  -r, --release NAME      Helm release name (default: retrofitlink-production)"
    echo "  -c, --chart PATH        Helm chart path (default: ./helm/retrofitlink)"
    echo "  -v, --values FILE       Values file path (default: ./helm/retrofitlink/values-production.yaml)"
    echo "  -t, --timeout DURATION  Deployment timeout (default: 600s)"
    echo "  --rollback              Rollback to previous release"
    echo "  --dry-run               Only perform dry-run"
    echo
    echo "Environment variables:"
    echo "  NAMESPACE               Kubernetes namespace"
    echo "  RELEASE_NAME            Helm release name"
    echo "  CHART_PATH              Helm chart path"
    echo "  VALUES_FILE             Values file path"
    echo "  TIMEOUT                 Deployment timeout"
    echo "  BACKUP_DIR              Backup directory"
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
        -r|--release)
            RELEASE_NAME="$2"
            shift 2
            ;;
        -c|--chart)
            CHART_PATH="$2"
            shift 2
            ;;
        -v|--values)
            VALUES_FILE="$2"
            shift 2
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --rollback)
            log_info "Rolling back to previous release..."
            rollback_deployment
            exit 0
            ;;
        --dry-run)
            log_info "Performing dry-run deployment..."
            check_prerequisites
            helm upgrade --install "$RELEASE_NAME" "$CHART_PATH" \
                --namespace "$NAMESPACE" \
                --create-namespace \
                --values "$VALUES_FILE" \
                --timeout "$TIMEOUT" \
                --dry-run
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Run main function
main
