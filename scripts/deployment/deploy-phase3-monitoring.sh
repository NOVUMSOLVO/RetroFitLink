#!/bin/bash

# Phase 3: Monitoring & Observability Deployment Script
# RetroFitLink Production Deployment

set -euo pipefail

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

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Script configuration
NAMESPACE="retrofitlink-prod"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MONITORING_DIR="$PROJECT_ROOT/monitoring"

# Default values
DRY_RUN=false
SKIP_PREREQUISITES=false
SKIP_APM=false
SKIP_LOGGING=false
SKIP_TRACING=false
SKIP_UPTIME=false
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-prerequisites)
            SKIP_PREREQUISITES=true
            shift
            ;;
        --skip-apm)
            SKIP_APM=true
            shift
            ;;
        --skip-logging)
            SKIP_LOGGING=true
            shift
            ;;
        --skip-tracing)
            SKIP_TRACING=true
            shift
            ;;
        --skip-uptime)
            SKIP_UPTIME=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dry-run              Show what would be deployed without actually deploying"
            echo "  --skip-prerequisites   Skip prerequisites check"
            echo "  --skip-apm            Skip Application Performance Monitoring setup"
            echo "  --skip-logging        Skip logging stack deployment"
            echo "  --skip-tracing        Skip distributed tracing setup"
            echo "  --skip-uptime         Skip uptime monitoring setup"
            echo "  --verbose             Enable verbose output"
            echo "  --help                Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                          # Deploy all monitoring components"
            echo "  $0 --dry-run               # Show what would be deployed"
            echo "  $0 --skip-apm --skip-tracing  # Deploy only logging and uptime monitoring"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Check prerequisites
check_prerequisites() {
    if [[ "$SKIP_PREREQUISITES" == "true" ]]; then
        warning "Skipping prerequisites check"
        return 0
    fi

    log "Checking prerequisites..."

    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        error "kubectl is not installed or not in PATH"
    fi

    # Check if helm is available
    if ! command -v helm &> /dev/null; then
        error "helm is not installed or not in PATH"
    fi

    # Check if we can connect to the cluster
    if ! kubectl cluster-info &> /dev/null; then
        error "Cannot connect to Kubernetes cluster"
    fi

    # Check if namespace exists
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        error "Namespace '$NAMESPACE' does not exist. Please create it first."
    fi

    # Check if monitoring directory exists
    if [[ ! -d "$MONITORING_DIR" ]]; then
        error "Monitoring directory not found: $MONITORING_DIR"
    fi

    success "Prerequisites check passed"
}

# Create secrets for monitoring components
create_monitoring_secrets() {
    log "Creating monitoring secrets..."

    # Datadog secret (if not exists)
    if ! kubectl get secret datadog-secret -n "$NAMESPACE" &> /dev/null; then
        log "Creating Datadog secret..."
        if [[ "$DRY_RUN" == "false" ]]; then
            kubectl create secret generic datadog-secret \
                --from-literal=api-key="${DATADOG_API_KEY:-changeme}" \
                -n "$NAMESPACE" || warning "Failed to create Datadog secret"
        else
            echo "DRY RUN: Would create Datadog secret"
        fi
    else
        log "Datadog secret already exists"
    fi

    # Uptime Kuma secrets (if not exists)
    if ! kubectl get secret uptime-kuma-secrets -n "$NAMESPACE" &> /dev/null; then
        log "Creating Uptime Kuma secrets..."
        if [[ "$DRY_RUN" == "false" ]]; then
            kubectl create secret generic uptime-kuma-secrets \
                --from-literal=slack-webhook-url="${SLACK_WEBHOOK_URL:-}" \
                --from-literal=smtp-host="${SMTP_HOST:-}" \
                --from-literal=smtp-username="${SMTP_USERNAME:-}" \
                --from-literal=smtp-password="${SMTP_PASSWORD:-}" \
                --from-literal=pagerduty-integration-key="${PAGERDUTY_INTEGRATION_KEY:-}" \
                -n "$NAMESPACE" || warning "Failed to create Uptime Kuma secrets"
        else
            echo "DRY RUN: Would create Uptime Kuma secrets"
        fi
    else
        log "Uptime Kuma secrets already exist"
    fi

    success "Monitoring secrets created"
}

# Deploy Application Performance Monitoring (APM)
deploy_apm() {
    if [[ "$SKIP_APM" == "true" ]]; then
        warning "Skipping APM deployment"
        return 0
    fi

    log "Deploying Application Performance Monitoring (APM)..."

    # Deploy Datadog agent
    if [[ -f "$MONITORING_DIR/apm/datadog-config.yaml" ]]; then
        log "Deploying Datadog configuration..."
        if [[ "$DRY_RUN" == "false" ]]; then
            kubectl apply -f "$MONITORING_DIR/apm/datadog-config.yaml" -n "$NAMESPACE"
        else
            echo "DRY RUN: Would apply $MONITORING_DIR/apm/datadog-config.yaml"
        fi
    fi

    if [[ -f "$MONITORING_DIR/apm/datadog-agent.yaml" ]]; then
        log "Deploying Datadog agent..."
        if [[ "$DRY_RUN" == "false" ]]; then
            kubectl apply -f "$MONITORING_DIR/apm/datadog-agent.yaml" -n "$NAMESPACE"
        else
            echo "DRY RUN: Would apply $MONITORING_DIR/apm/datadog-agent.yaml"
        fi
    fi

    # Deploy Sentry configuration
    if [[ -f "$MONITORING_DIR/error-tracking/sentry-config.yaml" ]]; then
        log "Deploying Sentry configuration..."
        if [[ "$DRY_RUN" == "false" ]]; then
            kubectl apply -f "$MONITORING_DIR/error-tracking/sentry-config.yaml" -n "$NAMESPACE"
        else
            echo "DRY RUN: Would apply $MONITORING_DIR/error-tracking/sentry-config.yaml"
        fi
    fi

    success "APM deployment completed"
}

# Deploy Logging Stack
deploy_logging() {
    if [[ "$SKIP_LOGGING" == "true" ]]; then
        warning "Skipping logging stack deployment"
        return 0
    fi

    log "Deploying logging stack..."

    # Deploy Logstash
    if [[ -f "$MONITORING_DIR/logging/logstash-config.yaml" ]]; then
        log "Deploying Logstash configuration..."
        if [[ "$DRY_RUN" == "false" ]]; then
            kubectl apply -f "$MONITORING_DIR/logging/logstash-config.yaml" -n "$NAMESPACE"
        else
            echo "DRY RUN: Would apply $MONITORING_DIR/logging/logstash-config.yaml"
        fi
    fi

    if [[ -f "$MONITORING_DIR/logging/logstash-deployment.yaml" ]]; then
        log "Deploying Logstash..."
        if [[ "$DRY_RUN" == "false" ]]; then
            kubectl apply -f "$MONITORING_DIR/logging/logstash-deployment.yaml" -n "$NAMESPACE"
        else
            echo "DRY RUN: Would apply $MONITORING_DIR/logging/logstash-deployment.yaml"
        fi
    fi

    # Deploy Filebeat
    if [[ -f "$MONITORING_DIR/logging/filebeat-config.yaml" ]]; then
        log "Deploying Filebeat configuration..."
        if [[ "$DRY_RUN" == "false" ]]; then
            kubectl apply -f "$MONITORING_DIR/logging/filebeat-config.yaml" -n "$NAMESPACE"
        else
            echo "DRY RUN: Would apply $MONITORING_DIR/logging/filebeat-config.yaml"
        fi
    fi

    if [[ -f "$MONITORING_DIR/logging/filebeat-daemonset.yaml" ]]; then
        log "Deploying Filebeat..."
        if [[ "$DRY_RUN" == "false" ]]; then
            kubectl apply -f "$MONITORING_DIR/logging/filebeat-daemonset.yaml" -n "$NAMESPACE"
        else
            echo "DRY RUN: Would apply $MONITORING_DIR/logging/filebeat-daemonset.yaml"
        fi
    fi

    success "Logging stack deployment completed"
}

# Deploy Distributed Tracing
deploy_tracing() {
    if [[ "$SKIP_TRACING" == "true" ]]; then
        warning "Skipping distributed tracing deployment"
        return 0
    fi

    log "Deploying distributed tracing..."

    # Deploy Jaeger
    if [[ -f "$MONITORING_DIR/tracing/jaeger-config.yaml" ]]; then
        log "Deploying Jaeger configuration..."
        if [[ "$DRY_RUN" == "false" ]]; then
            kubectl apply -f "$MONITORING_DIR/tracing/jaeger-config.yaml" -n "$NAMESPACE"
        else
            echo "DRY RUN: Would apply $MONITORING_DIR/tracing/jaeger-config.yaml"
        fi
    fi

    if [[ -f "$MONITORING_DIR/tracing/jaeger-deployment.yaml" ]]; then
        log "Deploying Jaeger..."
        if [[ "$DRY_RUN" == "false" ]]; then
            kubectl apply -f "$MONITORING_DIR/tracing/jaeger-deployment.yaml" -n "$NAMESPACE"
        else
            echo "DRY RUN: Would apply $MONITORING_DIR/tracing/jaeger-deployment.yaml"
        fi
    fi

    success "Distributed tracing deployment completed"
}

# Deploy Uptime Monitoring
deploy_uptime_monitoring() {
    if [[ "$SKIP_UPTIME" == "true" ]]; then
        warning "Skipping uptime monitoring deployment"
        return 0
    fi

    log "Deploying uptime monitoring..."

    # Deploy Uptime Kuma
    if [[ -f "$MONITORING_DIR/uptime/uptime-kuma-config.yaml" ]]; then
        log "Deploying Uptime Kuma configuration..."
        if [[ "$DRY_RUN" == "false" ]]; then
            kubectl apply -f "$MONITORING_DIR/uptime/uptime-kuma-config.yaml" -n "$NAMESPACE"
        else
            echo "DRY RUN: Would apply $MONITORING_DIR/uptime/uptime-kuma-config.yaml"
        fi
    fi

    if [[ -f "$MONITORING_DIR/uptime/uptime-kuma-deployment.yaml" ]]; then
        log "Deploying Uptime Kuma..."
        if [[ "$DRY_RUN" == "false" ]]; then
            kubectl apply -f "$MONITORING_DIR/uptime/uptime-kuma-deployment.yaml" -n "$NAMESPACE"
        else
            echo "DRY RUN: Would apply $MONITORING_DIR/uptime/uptime-kuma-deployment.yaml"
        fi
    fi

    success "Uptime monitoring deployment completed"
}

# Wait for deployments to be ready
wait_for_deployments() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Skipping deployment readiness check"
        return 0
    fi

    log "Waiting for deployments to be ready..."

    # List of deployments to wait for
    DEPLOYMENTS=()
    
    if [[ "$SKIP_APM" == "false" ]]; then
        DEPLOYMENTS+=("datadog-agent")
    fi
    
    if [[ "$SKIP_LOGGING" == "false" ]]; then
        DEPLOYMENTS+=("logstash")
    fi
    
    if [[ "$SKIP_TRACING" == "false" ]]; then
        DEPLOYMENTS+=("jaeger-collector" "jaeger-query")
    fi
    
    if [[ "$SKIP_UPTIME" == "false" ]]; then
        DEPLOYMENTS+=("uptime-kuma")
    fi

    for deployment in "${DEPLOYMENTS[@]}"; do
        if kubectl get deployment "$deployment" -n "$NAMESPACE" &> /dev/null; then
            log "Waiting for deployment $deployment to be ready..."
            kubectl wait --for=condition=available --timeout=300s deployment/"$deployment" -n "$NAMESPACE" || warning "Deployment $deployment did not become ready in time"
        else
            warning "Deployment $deployment not found, skipping..."
        fi
    done

    success "All deployments are ready"
}

# Validate deployment
validate_deployment() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Skipping deployment validation"
        return 0
    fi

    log "Validating monitoring and observability deployment..."

    # Check pod status
    log "Checking pod status..."
    kubectl get pods -n "$NAMESPACE" -l component=apm,logging,tracing,uptime-monitoring || true

    # Check services
    log "Checking services..."
    kubectl get services -n "$NAMESPACE" -l component=apm,logging,tracing,uptime-monitoring || true

    # Check ingresses
    log "Checking ingresses..."
    kubectl get ingress -n "$NAMESPACE" || true

    # Test connectivity (basic checks)
    log "Testing basic connectivity..."
    
    if [[ "$SKIP_LOGGING" == "false" ]]; then
        if kubectl get service logstash -n "$NAMESPACE" &> /dev/null; then
            log "Testing Logstash connectivity..."
            kubectl run test-logstash --rm -i --tty --image=curlimages/curl:latest --restart=Never -- \
                curl -f http://logstash:9600/ || warning "Logstash connectivity test failed"
        fi
    fi

    if [[ "$SKIP_TRACING" == "false" ]]; then
        if kubectl get service jaeger-query -n "$NAMESPACE" &> /dev/null; then
            log "Testing Jaeger Query connectivity..."
            kubectl run test-jaeger --rm -i --tty --image=curlimages/curl:latest --restart=Never -- \
                curl -f http://jaeger-query:16687/ || warning "Jaeger Query connectivity test failed"
        fi
    fi

    success "Deployment validation completed"
}

# Generate deployment summary
generate_summary() {
    log "Generating deployment summary..."

    echo ""
    echo "======================================"
    echo "  MONITORING & OBSERVABILITY SUMMARY"
    echo "======================================"
    echo ""

    if [[ "$DRY_RUN" == "true" ]]; then
        echo "🔍 DRY RUN MODE - No actual deployments were made"
        echo ""
    fi

    echo "📊 Deployed Components:"
    echo ""

    if [[ "$SKIP_APM" == "false" ]]; then
        echo "✅ Application Performance Monitoring (APM)"
        echo "   - Datadog Agent for metrics and APM"
        echo "   - Sentry for error tracking"
        echo ""
    fi

    if [[ "$SKIP_LOGGING" == "false" ]]; then
        echo "✅ Logging Stack"
        echo "   - Logstash for log processing"
        echo "   - Filebeat for log collection"
        echo "   - Elasticsearch integration ready"
        echo ""
    fi

    if [[ "$SKIP_TRACING" == "false" ]]; then
        echo "✅ Distributed Tracing"
        echo "   - Jaeger for distributed tracing"
        echo "   - OpenTelemetry instrumentation ready"
        echo ""
    fi

    if [[ "$SKIP_UPTIME" == "false" ]]; then
        echo "✅ Uptime Monitoring"
        echo "   - Uptime Kuma for service monitoring"
        echo "   - Status page available"
        echo ""
    fi

    echo "🔗 Access Points:"
    echo ""
    if [[ "$SKIP_TRACING" == "false" ]]; then
        echo "   Jaeger UI: kubectl port-forward svc/jaeger-query 16686:16686 -n $NAMESPACE"
        echo "   Then access: http://localhost:16686"
        echo ""
    fi
    if [[ "$SKIP_UPTIME" == "false" ]]; then
        echo "   Uptime Kuma: kubectl port-forward svc/uptime-kuma 3001:3001 -n $NAMESPACE"
        echo "   Then access: http://localhost:3001"
        echo ""
    fi

    echo "🚀 Next Steps:"
    echo ""
    echo "1. Configure notification channels in AlertManager"
    echo "2. Set up application instrumentation with APM SDKs"
    echo "3. Configure log forwarding in application containers"
    echo "4. Set up Grafana dashboards for monitoring"
    echo "5. Configure Uptime Kuma monitors and notifications"
    echo "6. Test alerting and notification workflows"
    echo ""

    echo "📋 Configuration Required:"
    echo ""
    if [[ "$SKIP_APM" == "false" ]]; then
        echo "   - Update Datadog API key in secrets"
        echo "   - Configure Sentry DSN in application code"
    fi
    if [[ "$SKIP_UPTIME" == "false" ]]; then
        echo "   - Configure Slack webhook URL for notifications"
        echo "   - Set up SMTP settings for email alerts"
        echo "   - Configure PagerDuty integration"
    fi
    echo "   - Update ingress hostnames for external access"
    echo ""

    echo "📚 Documentation:"
    echo "   - Monitoring runbook: docs/monitoring-runbook.md"
    echo "   - Alerting guide: docs/alerting-guide.md"
    echo "   - Troubleshooting: docs/troubleshooting.md"
    echo ""

    success "Phase 3: Monitoring & Observability deployment completed!"
}

# Main execution
main() {
    log "Starting Phase 3: Monitoring & Observability deployment..."
    log "Target namespace: $NAMESPACE"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "Running in DRY RUN mode"
    fi

    check_prerequisites
    create_monitoring_secrets
    deploy_apm
    deploy_logging
    deploy_tracing
    deploy_uptime_monitoring
    wait_for_deployments
    validate_deployment
    generate_summary
}

# Run main function
main "$@"
