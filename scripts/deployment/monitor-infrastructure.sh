#!/bin/bash

# RetroFitLink Infrastructure Monitoring Script
# Monitors application health, performance, and infrastructure metrics

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-retrofitlink-production}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3000}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
CHECK_INTERVAL="${CHECK_INTERVAL:-60}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] [INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] [SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] [WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR]${NC} $1"
}

# Check application health
check_application_health() {
    log_info "Checking application health..."
    
    local healthy=true
    
    # Check pod status
    local failed_pods=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase!=Running --no-headers 2>/dev/null | wc -l)
    if [[ $failed_pods -gt 0 ]]; then
        log_warn "$failed_pods pods are not in Running state"
        kubectl get pods -n "$NAMESPACE" --field-selector=status.phase!=Running
        healthy=false
    fi
    
    # Check deployment status
    local deployments=$(kubectl get deployments -n "$NAMESPACE" -o json 2>/dev/null)
    if [[ -n "$deployments" ]]; then
        local unavailable=$(echo "$deployments" | jq -r '.items[] | select(.status.unavailableReplicas > 0) | .metadata.name' 2>/dev/null || true)
        if [[ -n "$unavailable" ]]; then
            log_warn "Deployments with unavailable replicas: $unavailable"
            healthy=false
        fi
    fi
    
    if $healthy; then
        log_success "All application components are healthy"
    fi
    
    return $([ "$healthy" = true ] && echo 0 || echo 1)
}

# Check resource usage
check_resource_usage() {
    log_info "Checking resource usage..."
    
    # Check node resource usage
    if command -v kubectl &> /dev/null; then
        log_info "Node resource usage:"
        kubectl top nodes 2>/dev/null || log_warn "Cannot retrieve node metrics"
        
        log_info "Pod resource usage in $NAMESPACE:"
        kubectl top pods -n "$NAMESPACE" 2>/dev/null || log_warn "Cannot retrieve pod metrics"
    fi
}

# Check database connectivity
check_database_connectivity() {
    log_info "Checking database connectivity..."
    
    # Check MongoDB pods
    local mongo_pods=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=mongodb --no-headers 2>/dev/null | wc -l)
    if [[ $mongo_pods -gt 0 ]]; then
        local ready_mongo=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=mongodb --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
        log_info "MongoDB: $ready_mongo/$mongo_pods pods ready"
        
        if [[ $ready_mongo -lt $mongo_pods ]]; then
            log_warn "Some MongoDB pods are not ready"
        fi
    else
        log_warn "No MongoDB pods found"
    fi
    
    # Check Redis pods
    local redis_pods=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=redis --no-headers 2>/dev/null | wc -l)
    if [[ $redis_pods -gt 0 ]]; then
        local ready_redis=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=redis --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
        log_info "Redis: $ready_redis/$redis_pods pods ready"
        
        if [[ $ready_redis -lt $redis_pods ]]; then
            log_warn "Some Redis pods are not ready"
        fi
    else
        log_warn "No Redis pods found"
    fi
}

# Check external endpoints
check_external_endpoints() {
    log_info "Checking external endpoints..."
    
    local endpoints=(
        "https://retrofitlink.com"
        "https://retrofitlink.com/api/health"
    )
    
    for endpoint in "${endpoints[@]}"; do
        if curl -sf --max-time 10 "$endpoint" > /dev/null 2>&1; then
            log_success "$endpoint is accessible"
        else
            log_error "$endpoint is not accessible"
        fi
    done
}

# Query Prometheus metrics
query_prometheus_metrics() {
    if [[ -z "$PROMETHEUS_URL" ]]; then
        log_warn "Prometheus URL not configured, skipping metrics check"
        return
    fi
    
    log_info "Querying Prometheus metrics..."
    
    # Check if Prometheus is accessible
    if ! curl -sf --max-time 5 "$PROMETHEUS_URL/api/v1/query?query=up" > /dev/null 2>&1; then
        log_warn "Cannot connect to Prometheus at $PROMETHEUS_URL"
        return
    fi
    
    # Query key metrics
    local metrics=(
        "up"
        "node_memory_MemAvailable_bytes"
        "node_cpu_seconds_total"
        "http_requests_total"
        "mongodb_up"
        "redis_up"
    )
    
    for metric in "${metrics[@]}"; do
        local result=$(curl -sf "$PROMETHEUS_URL/api/v1/query?query=$metric" 2>/dev/null | jq -r '.data.result | length' 2>/dev/null || echo "0")
        log_info "$metric: $result time series"
    done
}

# Check certificate expiration
check_certificate_expiration() {
    log_info "Checking SSL certificate expiration..."
    
    local domains=("retrofitlink.com" "www.retrofitlink.com")
    
    for domain in "${domains[@]}"; do
        if command -v openssl &> /dev/null; then
            local expiry=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
            if [[ -n "$expiry" ]]; then
                local expiry_epoch=$(date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry" "+%s" 2>/dev/null || date -d "$expiry" "+%s" 2>/dev/null || echo "0")
                local current_epoch=$(date "+%s")
                local days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
                
                if [[ $days_until_expiry -lt 30 ]]; then
                    log_warn "$domain certificate expires in $days_until_expiry days"
                else
                    log_success "$domain certificate expires in $days_until_expiry days"
                fi
            else
                log_warn "Cannot check certificate for $domain"
            fi
        else
            log_warn "OpenSSL not available for certificate checking"
            break
        fi
    done
}

# Send alert notification
send_alert() {
    local message="$1"
    local severity="${2:-warning}"
    
    if [[ -n "$ALERT_WEBHOOK" ]]; then
        curl -X POST "$ALERT_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"🚨 RetroFitLink Alert [$severity]: $message\"}" \
            2>/dev/null || log_warn "Failed to send alert notification"
    fi
}

# Generate health report
generate_health_report() {
    log_info "Generating health report..."
    
    local report_file="/tmp/retrofitlink-health-$(date +%Y%m%d-%H%M%S).json"
    
    cat > "$report_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "namespace": "$NAMESPACE",
  "checks": {
    "application_health": $(check_application_health &>/dev/null && echo "true" || echo "false"),
    "database_connectivity": $(check_database_connectivity &>/dev/null && echo "true" || echo "false"),
    "external_endpoints": $(check_external_endpoints &>/dev/null && echo "true" || echo "false")
  },
  "cluster_info": {
    "nodes": $(kubectl get nodes --no-headers 2>/dev/null | wc -l || echo "0"),
    "pods": $(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l || echo "0"),
    "services": $(kubectl get services -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l || echo "0")
  }
}
EOF
    
    log_success "Health report generated: $report_file"
    cat "$report_file"
}

# Main monitoring function
run_monitoring_check() {
    log_info "Starting RetroFitLink infrastructure monitoring..."
    
    local overall_health=true
    
    # Run all checks
    if ! check_application_health; then
        overall_health=false
        send_alert "Application health check failed" "critical"
    fi
    
    check_resource_usage
    check_database_connectivity
    
    if ! check_external_endpoints; then
        overall_health=false
        send_alert "External endpoint check failed" "critical"
    fi
    
    query_prometheus_metrics
    check_certificate_expiration
    
    if $overall_health; then
        log_success "✅ All monitoring checks passed"
    else
        log_error "❌ Some monitoring checks failed"
        return 1
    fi
}

# Continuous monitoring mode
run_continuous_monitoring() {
    log_info "Starting continuous monitoring (interval: ${CHECK_INTERVAL}s)..."
    
    while true; do
        echo "----------------------------------------"
        run_monitoring_check
        echo "----------------------------------------"
        sleep "$CHECK_INTERVAL"
    done
}

# Show help
show_help() {
    echo "RetroFitLink Infrastructure Monitoring Script"
    echo
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -h, --help                 Show this help message"
    echo "  -n, --namespace NAME       Kubernetes namespace (default: retrofitlink-production)"
    echo "  -p, --prometheus URL       Prometheus URL (default: http://localhost:9090)"
    echo "  -g, --grafana URL          Grafana URL (default: http://localhost:3000)"
    echo "  -w, --webhook URL          Alert webhook URL"
    echo "  -i, --interval SECONDS     Check interval for continuous mode (default: 60)"
    echo "  -c, --continuous           Run in continuous monitoring mode"
    echo "  -r, --report              Generate health report"
    echo
    echo "Environment variables:"
    echo "  NAMESPACE                  Kubernetes namespace"
    echo "  PROMETHEUS_URL             Prometheus URL"
    echo "  GRAFANA_URL                Grafana URL"
    echo "  ALERT_WEBHOOK              Alert webhook URL"
    echo "  CHECK_INTERVAL             Check interval in seconds"
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
        -p|--prometheus)
            PROMETHEUS_URL="$2"
            shift 2
            ;;
        -g|--grafana)
            GRAFANA_URL="$2"
            shift 2
            ;;
        -w|--webhook)
            ALERT_WEBHOOK="$2"
            shift 2
            ;;
        -i|--interval)
            CHECK_INTERVAL="$2"
            shift 2
            ;;
        -c|--continuous)
            run_continuous_monitoring
            exit 0
            ;;
        -r|--report)
            generate_health_report
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Run single monitoring check by default
run_monitoring_check
