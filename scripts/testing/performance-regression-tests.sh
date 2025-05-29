#!/bin/bash

# RetroFitLink Automated Performance Regression Testing
# This script runs comprehensive performance tests and validates against benchmarks

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-retrofitlink}"
TARGET_URL="${TARGET_URL:-http://nginx-load-balancer.retrofitlink.svc.cluster.local}"
INFLUXDB_URL="${INFLUXDB_URL:-http://influxdb:8086/k6}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
PERFORMANCE_BUDGET="${PERFORMANCE_BUDGET:-true}"

# Performance thresholds
RESPONSE_TIME_P95_THRESHOLD=200  # milliseconds
RESPONSE_TIME_P99_THRESHOLD=500  # milliseconds
THROUGHPUT_THRESHOLD=1000        # requests per second
ERROR_RATE_THRESHOLD=1           # percentage
CACHE_HIT_RATE_THRESHOLD=85      # percentage

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Send notification
send_notification() {
    local message="$1"
    local status="$2"
    
    if [ -n "$SLACK_WEBHOOK" ]; then
        local color="good"
        [ "$status" = "failure" ] && color="danger"
        [ "$status" = "warning" ] && color="warning"
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"attachments\":[{\"color\":\"$color\",\"text\":\"$message\"}]}" \
            "$SLACK_WEBHOOK" || true
    fi
    
    echo "$message"
}

# K6 Test Scripts
create_k6_tests() {
    cat > /tmp/smoke-test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const failureRate = new Rate('failures');
const customTrend = new Trend('custom_metric');

export let options = {
  stages: [
    { duration: '1m', target: 10 }, // Ramp up
    { duration: '2m', target: 10 }, // Stay at 10 users
    { duration: '1m', target: 0 },  // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests must complete below 200ms
    failures: ['rate<0.01'],          // Error rate must be below 1%
  },
};

export default function() {
  const response = http.get(`${__ENV.TARGET_URL}/api/health`);
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });
  
  failureRate.add(response.status !== 200);
  customTrend.add(response.timings.duration);
  
  sleep(1);
}
EOF

    cat > /tmp/load-test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const data = new SharedArray('test data', function() {
  return [
    { endpoint: '/api/properties', method: 'GET' },
    { endpoint: '/api/users/profile', method: 'GET' },
    { endpoint: '/api/retrofits', method: 'GET' },
    { endpoint: '/api/applications', method: 'GET' },
  ];
});

export let options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 150 },  // Ramp up to 150
    { duration: '5m', target: 150 },  // Stay at 150
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function() {
  const testData = data[Math.floor(Math.random() * data.length)];
  const response = http.get(`${__ENV.TARGET_URL}${testData.endpoint}`);
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time acceptable': (r) => r.timings.duration < 500,
  });
  
  sleep(Math.random() * 2 + 1); // Random sleep between 1-3 seconds
}
EOF

    cat > /tmp/stress-test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up
    { duration: '5m', target: 200 },  // Increase load
    { duration: '2m', target: 300 },  // Peak load
    { duration: '5m', target: 300 },  // Stay at peak
    { duration: '2m', target: 400 },  // Beyond normal capacity
    { duration: '5m', target: 400 },  // Stress test
    { duration: '10m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],  // Relaxed threshold for stress test
    http_req_failed: ['rate<0.05'],     // Allow higher error rate
  },
};

export default function() {
  const endpoints = [
    '/api/properties',
    '/api/users/profile',
    '/api/retrofits',
    '/api/applications',
    '/api/iot/data',
  ];
  
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const response = http.get(`${__ENV.TARGET_URL}${endpoint}`);
  
  check(response, {
    'status is not 500': (r) => r.status !== 500,
    'response time under 1s': (r) => r.timings.duration < 1000,
  });
  
  sleep(0.5);
}
EOF

    cat > /tmp/spike-test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 10 },   // Normal load
    { duration: '30s', target: 500 }, // Sudden spike
    { duration: '1m', target: 500 },  // Stay at spike
    { duration: '30s', target: 10 },  // Return to normal
    { duration: '2m', target: 10 },   // Recovery period
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.02'],
  },
};

export default function() {
  const response = http.get(`${__ENV.TARGET_URL}/api/properties`);
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'spike handled': (r) => r.timings.duration < 1000,
  });
  
  sleep(0.1); // High frequency during spike
}
EOF
}

# Run K6 test
run_k6_test() {
    local test_file="$1"
    local test_name="$2"
    local output_file="/tmp/k6-${test_name}-results.json"
    
    log_info "Running $test_name test..."
    
    k6 run \
        --out json="$output_file" \
        --env TARGET_URL="$TARGET_URL" \
        "$test_file" || return 1
    
    echo "$output_file"
}

# Parse K6 results
parse_k6_results() {
    local results_file="$1"
    local test_name="$2"
    
    if [ ! -f "$results_file" ]; then
        log_error "Results file not found: $results_file"
        return 1
    fi
    
    # Extract key metrics
    local p95_response_time=$(jq -r '.metrics.http_req_duration.values.p95' "$results_file" 2>/dev/null || echo "0")
    local p99_response_time=$(jq -r '.metrics.http_req_duration.values.p99' "$results_file" 2>/dev/null || echo "0")
    local avg_response_time=$(jq -r '.metrics.http_req_duration.values.avg' "$results_file" 2>/dev/null || echo "0")
    local error_rate=$(jq -r '.metrics.http_req_failed.values.rate * 100' "$results_file" 2>/dev/null || echo "0")
    local throughput=$(jq -r '.metrics.http_reqs.values.rate' "$results_file" 2>/dev/null || echo "0")
    
    # Convert to integers for comparison
    p95_ms=$(echo "$p95_response_time * 1000" | bc -l | cut -d. -f1)
    p99_ms=$(echo "$p99_response_time * 1000" | bc -l | cut -d. -f1)
    error_rate_int=$(echo "$error_rate" | cut -d. -f1)
    throughput_int=$(echo "$throughput" | cut -d. -f1)
    
    echo "=== $test_name Test Results ==="
    echo "95th Percentile Response Time: ${p95_ms}ms"
    echo "99th Percentile Response Time: ${p99_ms}ms"
    echo "Average Response Time: $(echo "$avg_response_time * 1000" | bc -l | cut -d. -f1)ms"
    echo "Error Rate: ${error_rate}%"
    echo "Throughput: ${throughput} req/s"
    echo ""
    
    # Store results for performance budget check
    echo "$test_name,$p95_ms,$p99_ms,$error_rate,$throughput" >> /tmp/performance-results.csv
}

# Check performance budget
check_performance_budget() {
    local violations=()
    
    if [ ! -f /tmp/performance-results.csv ]; then
        log_error "No performance results found"
        return 1
    fi
    
    log_info "Checking performance budget..."
    
    while IFS=',' read -r test_name p95_ms p99_ms error_rate throughput; do
        # Skip header
        [ "$test_name" = "test_name" ] && continue
        
        # Check P95 response time
        if (( p95_ms > RESPONSE_TIME_P95_THRESHOLD )); then
            violations+=("$test_name: P95 response time ${p95_ms}ms > ${RESPONSE_TIME_P95_THRESHOLD}ms")
        fi
        
        # Check P99 response time
        if (( p99_ms > RESPONSE_TIME_P99_THRESHOLD )); then
            violations+=("$test_name: P99 response time ${p99_ms}ms > ${RESPONSE_TIME_P99_THRESHOLD}ms")
        fi
        
        # Check error rate
        error_rate_int=$(echo "$error_rate" | cut -d. -f1)
        if (( error_rate_int > ERROR_RATE_THRESHOLD )); then
            violations+=("$test_name: Error rate ${error_rate}% > ${ERROR_RATE_THRESHOLD}%")
        fi
        
        # Check throughput (only for load tests)
        if [[ "$test_name" == *"load"* ]] && (( throughput_int < THROUGHPUT_THRESHOLD )); then
            violations+=("$test_name: Throughput ${throughput} req/s < ${THROUGHPUT_THRESHOLD} req/s")
        fi
        
    done < /tmp/performance-results.csv
    
    if [ ${#violations[@]} -eq 0 ]; then
        log_success "All performance budgets met!"
        return 0
    else
        log_error "Performance budget violations:"
        for violation in "${violations[@]}"; do
            log_error "  - $violation"
        done
        return 1
    fi
}

# Check cache performance
check_cache_performance() {
    log_info "Checking cache performance..."
    
    # Get Redis metrics
    local cache_hits=$(kubectl exec -n "$NAMESPACE" deployment/redis-cache -- redis-cli info stats | grep keyspace_hits | cut -d: -f2 | tr -d '\r')
    local cache_misses=$(kubectl exec -n "$NAMESPACE" deployment/redis-cache -- redis-cli info stats | grep keyspace_misses | cut -d: -f2 | tr -d '\r')
    
    if [ -n "$cache_hits" ] && [ -n "$cache_misses" ] && [ "$cache_hits" -gt 0 ] || [ "$cache_misses" -gt 0 ]; then
        local total_requests=$((cache_hits + cache_misses))
        local hit_rate=$((cache_hits * 100 / total_requests))
        
        echo "Cache Hit Rate: ${hit_rate}%"
        echo "Cache Hits: $cache_hits"
        echo "Cache Misses: $cache_misses"
        
        if (( hit_rate < CACHE_HIT_RATE_THRESHOLD )); then
            log_warning "Cache hit rate ${hit_rate}% below threshold ${CACHE_HIT_RATE_THRESHOLD}%"
            return 1
        else
            log_success "Cache performance is optimal"
            return 0
        fi
    else
        log_warning "Unable to retrieve cache metrics"
        return 1
    fi
}

# Generate performance report
generate_report() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local report_file="/tmp/performance-report-$(date +%Y%m%d-%H%M%S).html"
    
    cat > "$report_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>RetroFitLink Performance Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f4f4f4; padding: 20px; border-radius: 5px; }
        .metric { margin: 10px 0; padding: 10px; border-left: 4px solid #007cba; }
        .success { border-color: #28a745; }
        .warning { border-color: #ffc107; }
        .error { border-color: #dc3545; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>RetroFitLink Performance Report</h1>
        <p>Generated: $timestamp</p>
        <p>Environment: $NAMESPACE</p>
        <p>Target URL: $TARGET_URL</p>
    </div>
    
    <h2>Test Results Summary</h2>
    <table>
        <tr>
            <th>Test Name</th>
            <th>P95 Response Time (ms)</th>
            <th>P99 Response Time (ms)</th>
            <th>Error Rate (%)</th>
            <th>Throughput (req/s)</th>
            <th>Status</th>
        </tr>
EOF

    if [ -f /tmp/performance-results.csv ]; then
        while IFS=',' read -r test_name p95_ms p99_ms error_rate throughput; do
            [ "$test_name" = "test_name" ] && continue
            
            local status="✅ Pass"
            local class="success"
            
            if (( p95_ms > RESPONSE_TIME_P95_THRESHOLD )) || \
               (( p99_ms > RESPONSE_TIME_P99_THRESHOLD )) || \
               (( $(echo "$error_rate" | cut -d. -f1) > ERROR_RATE_THRESHOLD )); then
                status="❌ Fail"
                class="error"
            fi
            
            cat >> "$report_file" << EOF
        <tr class="$class">
            <td>$test_name</td>
            <td>$p95_ms</td>
            <td>$p99_ms</td>
            <td>$error_rate</td>
            <td>$throughput</td>
            <td>$status</td>
        </tr>
EOF
        done < /tmp/performance-results.csv
    fi
    
    cat >> "$report_file" << EOF
    </table>
    
    <h2>Performance Thresholds</h2>
    <div class="metric">
        <strong>Response Time P95:</strong> < ${RESPONSE_TIME_P95_THRESHOLD}ms
    </div>
    <div class="metric">
        <strong>Response Time P99:</strong> < ${RESPONSE_TIME_P99_THRESHOLD}ms
    </div>
    <div class="metric">
        <strong>Error Rate:</strong> < ${ERROR_RATE_THRESHOLD}%
    </div>
    <div class="metric">
        <strong>Throughput (Load Test):</strong> > ${THROUGHPUT_THRESHOLD} req/s
    </div>
    <div class="metric">
        <strong>Cache Hit Rate:</strong> > ${CACHE_HIT_RATE_THRESHOLD}%
    </div>
    
    <h2>Recommendations</h2>
    <ul>
        <li>Monitor response times during peak hours</li>
        <li>Optimize database queries for slow endpoints</li>
        <li>Review cache strategies for improved hit rates</li>
        <li>Consider auto-scaling adjustments based on load patterns</li>
    </ul>
</body>
</html>
EOF
    
    echo "$report_file"
}

# Main function
main() {
    log_info "Starting RetroFitLink Performance Regression Testing"
    
    # Cleanup previous results
    rm -f /tmp/performance-results.csv /tmp/k6-*.json
    echo "test_name,p95_ms,p99_ms,error_rate,throughput" > /tmp/performance-results.csv
    
    # Create test scripts
    create_k6_tests
    
    # Run tests
    local tests=(
        "/tmp/smoke-test.js:smoke"
        "/tmp/load-test.js:load"
        "/tmp/stress-test.js:stress"
        "/tmp/spike-test.js:spike"
    )
    
    local test_results=()
    local failed_tests=()
    
    for test_spec in "${tests[@]}"; do
        IFS=':' read -r test_file test_name <<< "$test_spec"
        
        if result_file=$(run_k6_test "$test_file" "$test_name"); then
            parse_k6_results "$result_file" "$test_name"
            test_results+=("$test_name:success")
        else
            log_error "$test_name test failed"
            test_results+=("$test_name:failed")
            failed_tests+=("$test_name")
        fi
    done
    
    # Check cache performance
    cache_status="success"
    if ! check_cache_performance; then
        cache_status="warning"
    fi
    
    # Check performance budget
    budget_status="success"
    if [ "$PERFORMANCE_BUDGET" = "true" ] && ! check_performance_budget; then
        budget_status="failed"
    fi
    
    # Generate report
    local report_file
    report_file=$(generate_report)
    log_info "Performance report generated: $report_file"
    
    # Summary
    local total_tests=${#tests[@]}
    local passed_tests=$((total_tests - ${#failed_tests[@]}))
    
    echo ""
    echo "=== Performance Testing Summary ==="
    echo "Total Tests: $total_tests"
    echo "Passed: $passed_tests"
    echo "Failed: ${#failed_tests[@]}"
    echo "Cache Performance: $cache_status"
    echo "Performance Budget: $budget_status"
    echo ""
    
    # Send notification
    local overall_status="success"
    local message="🚀 RetroFitLink Performance Tests Completed\n"
    message+="✅ Passed: $passed_tests/$total_tests\n"
    
    if [ ${#failed_tests[@]} -gt 0 ]; then
        overall_status="failure"
        message+="❌ Failed Tests: ${failed_tests[*]}\n"
    fi
    
    if [ "$cache_status" != "success" ]; then
        overall_status="warning"
        message+="⚠️ Cache performance below threshold\n"
    fi
    
    if [ "$budget_status" = "failed" ]; then
        overall_status="failure"
        message+="💰 Performance budget violations detected\n"
    fi
    
    message+="📊 Report: $report_file"
    
    send_notification "$message" "$overall_status"
    
    # Exit with appropriate code
    if [ "$overall_status" = "failure" ]; then
        exit 1
    elif [ "$overall_status" = "warning" ]; then
        exit 2
    else
        exit 0
    fi
}

# Check if K6 is installed
if ! command -v k6 &> /dev/null; then
    log_error "K6 is not installed. Please install K6 to run performance tests."
    log_info "Installation: https://k6.io/docs/getting-started/installation/"
    exit 1
fi

# Check if bc is installed (for calculations)
if ! command -v bc &> /dev/null; then
    log_error "bc calculator is not installed. Please install bc package."
    exit 1
fi

# Run main function
main "$@"
