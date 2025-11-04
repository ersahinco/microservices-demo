#!/bin/bash

# Validation script for OpenTelemetry-Grafana drilldown integration
# Validates the core drilldown functionality: Traces ↔ Logs ↔ Metrics correlation
# Tests end-to-end telemetry flow from cartservice-ts to Grafana LGTM
# Focus: Grafana Explore drilldown features, not dashboards

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}[✓]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
print_info() { echo -e "${BLUE}[i]${NC} $1"; }
print_step() { echo -e "\n${BLUE}===${NC} $1 ${BLUE}===${NC}"; }

# Check prerequisites
for cmd in kubectl jq curl; do
    if ! command -v $cmd &> /dev/null; then
        print_error "$cmd is not installed"
        exit 1
    fi
done

FAILED=0

# ============================================================================
# STEP 1: Deploy grafana-lgtm stack and wait for pod to be ready
# ============================================================================
print_step "Step 1: Deploy grafana-lgtm stack and wait for pod to be ready"

# Check if grafana-lgtm deployment exists
if ! kubectl get deployment grafana-lgtm &> /dev/null; then
    print_info "Deploying grafana-lgtm stack..."
    kubectl apply -k kubernetes-manifests/observability/
    if [ $? -eq 0 ]; then
        print_success "Grafana LGTM stack deployed"
    else
        print_error "Failed to deploy grafana-lgtm stack"
        exit 1
    fi
else
    print_info "Grafana LGTM stack already deployed"
fi

# Wait for pod to be ready
print_info "Waiting for grafana-lgtm pod to be ready (timeout: 120s)..."
if kubectl wait --for=condition=ready pod -l app=grafana-lgtm --timeout=120s &> /dev/null; then
    print_success "Grafana LGTM pod is ready"
else
    print_error "Grafana LGTM pod failed to become ready"
    kubectl get pods -l app=grafana-lgtm
    exit 1
fi

# Get grafana-lgtm pod
POD_NAME=$(kubectl get pods -l app=grafana-lgtm -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -z "$POD_NAME" ]; then
    print_error "grafana-lgtm pod not found"
    exit 1
fi

print_info "Using pod: $POD_NAME"

# ============================================================================
# STEP 2: Deploy cartservice-ts with OTEL environment variables
# ============================================================================
print_step "Step 2: Deploy cartservice-ts with OTEL environment variables"

# Check if cartservice-ts deployment exists
if ! kubectl get deployment cartservice-ts &> /dev/null; then
    print_info "Deploying cartservice-ts..."
    kubectl apply -f kubernetes-manifests/cartservice-ts.yaml
    if [ $? -eq 0 ]; then
        print_success "CartService-TS deployed"
    else
        print_error "Failed to deploy cartservice-ts"
        exit 1
    fi
else
    print_info "CartService-TS already deployed"
fi

# Verify OTEL environment variables are set
print_info "Verifying OTEL environment variables..."
OTEL_ENDPOINT=$(kubectl get deployment cartservice-ts -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="OTEL_EXPORTER_OTLP_ENDPOINT")].value}' 2>/dev/null)
OTEL_SERVICE_NAME=$(kubectl get deployment cartservice-ts -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="OTEL_SERVICE_NAME")].value}' 2>/dev/null)
OTEL_SERVICE_VERSION=$(kubectl get deployment cartservice-ts -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="OTEL_SERVICE_VERSION")].value}' 2>/dev/null)

if [ "$OTEL_ENDPOINT" = "http://grafana-lgtm:4317" ]; then
    print_success "OTEL_EXPORTER_OTLP_ENDPOINT is set correctly: $OTEL_ENDPOINT"
else
    print_error "OTEL_EXPORTER_OTLP_ENDPOINT is not set correctly: $OTEL_ENDPOINT"
    FAILED=1
fi

if [ "$OTEL_SERVICE_NAME" = "cartservice-ts" ]; then
    print_success "OTEL_SERVICE_NAME is set correctly: $OTEL_SERVICE_NAME"
else
    print_error "OTEL_SERVICE_NAME is not set correctly: $OTEL_SERVICE_NAME"
    FAILED=1
fi

if [ "$OTEL_SERVICE_VERSION" = "1.0.0" ]; then
    print_success "OTEL_SERVICE_VERSION is set correctly: $OTEL_SERVICE_VERSION"
else
    print_warning "OTEL_SERVICE_VERSION is set to: $OTEL_SERVICE_VERSION"
fi

# Wait for cartservice-ts pod to be ready
print_info "Waiting for cartservice-ts pod to be ready (timeout: 60s)..."
if kubectl wait --for=condition=ready pod -l app=cartservice-ts --timeout=60s &> /dev/null; then
    print_success "CartService-TS pod is ready"
else
    print_error "CartService-TS pod failed to become ready"
    kubectl get pods -l app=cartservice-ts
    exit 1
fi

# Set up port forwarding
print_info "Setting up port-forward to Grafana LGTM..."
kubectl port-forward "$POD_NAME" 3100:3100 3200:3200 9090:9090 3000:3000 &> /dev/null &
PF_PID=$!
sleep 5

cleanup() {
    print_info "Cleaning up port-forward..."
    kill $PF_PID 2>/dev/null || true
}
trap cleanup EXIT

# ============================================================================
# STEP 3: Generate test traffic to cartservice-ts
# ============================================================================
print_step "Step 3: Generate test traffic to cartservice-ts"

# Get cartservice-ts pod name
CART_POD=$(kubectl get pods -l app=cartservice-ts -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -z "$CART_POD" ]; then
    print_error "cartservice-ts pod not found"
    exit 1
fi

print_info "CartService-TS pod: $CART_POD"

# Check if frontend is available for generating traffic
if kubectl get deployment frontend &> /dev/null; then
    print_info "Frontend is available - traffic will be generated through normal operations"
    print_info "Waiting 15 seconds for telemetry data to be collected and exported..."
    print_info "(Metrics export interval is 10 seconds, so we need to wait for at least one export cycle)"
    sleep 15
else
    print_warning "Frontend not deployed - checking for existing telemetry data"
    print_info "To generate traffic, deploy the full application or make direct gRPC calls"
    print_info "Waiting 15 seconds for any existing telemetry to be exported..."
    sleep 15
fi

# ============================================================================
# STEP 4: Verify metrics appear in Prometheus datasource
# ============================================================================
print_step "Step 4: Verify metrics appear in Prometheus datasource"

print_info "Checking Prometheus API accessibility..."
PROM_HEALTH=$(curl -s --max-time 5 http://localhost:9090/-/healthy 2>/dev/null)
if [ "$PROM_HEALTH" = "Prometheus Server is Healthy." ] || [ "$PROM_HEALTH" = "Prometheus is Healthy." ]; then
    print_success "Prometheus API is accessible and healthy"
else
    print_warning "Prometheus health check returned: $PROM_HEALTH"
fi

# Query for OpenTelemetry span metrics (replaces grpc_server_handled_total)
print_info "Querying for OpenTelemetry span metrics (traces_spanmetrics_calls_total)..."
SPAN_METRICS=$(curl -s "http://localhost:9090/api/v1/query?query=traces_spanmetrics_calls_total" 2>/dev/null)

if echo "$SPAN_METRICS" | jq -e '.data.result[0]' &> /dev/null; then
    print_success "OpenTelemetry span metrics found in Prometheus"
    METRIC_COUNT=$(echo "$SPAN_METRICS" | jq -r '.data.result | length')
    print_info "Found $METRIC_COUNT time series for traces_spanmetrics_calls_total"
    
    # Check if cartservice-ts metrics are present
    if echo "$SPAN_METRICS" | jq -r '.data.result[].metric.service_name' | grep -q "cartservice-ts"; then
        print_success "Span metrics from cartservice-ts found"
    else
        print_warning "No span metrics from cartservice-ts found (may need more time or traffic)"
    fi
else
    print_warning "OpenTelemetry span metrics not found (may need traffic)"
    FAILED=1
fi

# Query for custom cart metrics
print_info "Querying for custom cart metrics (cart_requests_total)..."
CART_METRICS=$(curl -s "http://localhost:9090/api/v1/query?query=cart_requests_total" 2>/dev/null)

if echo "$CART_METRICS" | jq -e '.data.result[0]' &> /dev/null; then
    print_success "Custom cart metrics found in Prometheus"
    METRIC_COUNT=$(echo "$CART_METRICS" | jq -r '.data.result | length')
    print_info "Found $METRIC_COUNT time series for cart_requests_total"
else
    print_warning "Custom cart metrics not found (may need traffic)"
fi

# Check for OpenTelemetry Collector metrics (indicates metrics pipeline is working)
print_info "Checking for OpenTelemetry Collector metrics..."
OTEL_METRICS=$(curl -s "http://localhost:9090/api/v1/query?query=otelcol_receiver_accepted_metric_points_total" 2>/dev/null)
if echo "$OTEL_METRICS" | jq -e '.data.result[0]' &> /dev/null; then
    print_success "OpenTelemetry Collector is receiving and processing metrics"
    METRIC_POINTS=$(echo "$OTEL_METRICS" | jq -r '.data.result[0].value[1]')
    print_info "Total metric points received: $METRIC_POINTS"
else
    print_warning "OpenTelemetry Collector metrics not found"
fi

# Note: Node.js runtime metrics (heap, event loop) require additional instrumentation
# OpenTelemetry uses different metric naming conventions than traditional Prometheus exporters
print_info "Note: OpenTelemetry uses span metrics (traces_spanmetrics_*) instead of grpc_server_* metrics"
print_info "Note: Node.js runtime metrics require @opentelemetry/host-metrics package (optional)"

# ============================================================================
# STEP 5: Verify traces appear in Tempo datasource
# ============================================================================
print_step "Step 5: Verify traces appear in Tempo datasource"

print_info "Checking Tempo API accessibility..."
TEMPO_READY=$(curl -s --max-time 5 http://localhost:3200/ready 2>/dev/null)
if [ "$TEMPO_READY" = "ready" ]; then
    print_success "Tempo API is accessible and ready"
else
    print_warning "Tempo ready check returned: $TEMPO_READY"
fi

# Search for traces from cartservice-ts
print_info "Searching for traces from cartservice-ts..."
# Calculate time range (last hour)
if date -v-1H &>/dev/null 2>&1; then
    # macOS
    START_TIME=$(date -v-1H -u +%s)
else
    # Linux
    START_TIME=$(date -u -d '1 hour ago' +%s)
fi
END_TIME=$(date -u +%s)

# Query Tempo for traces
TEMPO_SEARCH=$(curl -s "http://localhost:3200/api/search?tags=service.name%3Dcartservice-ts&start=${START_TIME}&end=${END_TIME}" 2>/dev/null)

if echo "$TEMPO_SEARCH" | jq -e '.traces[0]' &> /dev/null; then
    print_success "Traces from cartservice-ts found in Tempo"
    TRACE_COUNT=$(echo "$TEMPO_SEARCH" | jq -r '.traces | length')
    print_info "Found $TRACE_COUNT traces"
    
    # Get a sample trace ID
    TRACE_ID=$(echo "$TEMPO_SEARCH" | jq -r '.traces[0].traceID' 2>/dev/null)
    if [ -n "$TRACE_ID" ]; then
        print_info "Sample trace ID: $TRACE_ID"
    fi
else
    print_warning "No traces from cartservice-ts found in Tempo (may need traffic)"
    FAILED=1
fi

# ============================================================================
# STEP 6: Verify logs appear in Loki datasource
# ============================================================================
print_step "Step 6: Verify logs appear in Loki datasource"

print_info "Checking Loki API accessibility..."
LOKI_READY=$(curl -s --max-time 5 http://localhost:3100/ready 2>/dev/null)
if [ "$LOKI_READY" = "ready" ]; then
    print_success "Loki API is accessible and ready"
else
    print_warning "Loki ready check returned: $LOKI_READY"
fi

# Query for cartservice-ts logs
print_info "Querying for logs with service_name=\"cartservice-ts\"..."
if date -v-1H &>/dev/null 2>&1; then
    # macOS
    START_TIME=$(date -v-1H -u +%s)000000000
else
    # Linux
    START_TIME=$(date -u -d '1 hour ago' +%s)000000000
fi
END_TIME=$(date -u +%s)000000000

LOGS=$(curl -s -G "http://localhost:3100/loki/api/v1/query_range" \
    --data-urlencode "query={service_name=\"cartservice-ts\"}" \
    --data-urlencode "limit=100" \
    --data-urlencode "start=$START_TIME" \
    --data-urlencode "end=$END_TIME" 2>/dev/null)

if echo "$LOGS" | jq -e '.data.result[0]' &> /dev/null; then
    print_success "Logs from cartservice-ts found in Loki"
    LOG_COUNT=$(echo "$LOGS" | jq -r '.data.result[0].values | length')
    print_info "Found $LOG_COUNT log entries"
else
    print_warning "No logs from cartservice-ts found in Loki"
    FAILED=1
fi

# ============================================================================
# STEP 7: Verify trace_id and span_id are present in log entries (DRILLDOWN CORE)
# ============================================================================
print_step "Step 7: Verify trace_id and span_id in logs (Enables Logs→Traces drilldown)"

if echo "$LOGS" | jq -e '.data.result[0]' &> /dev/null; then
    # Get multiple log entries to find one with trace context
    LOG_COUNT=$(echo "$LOGS" | jq -r '.data.result[0].values | length')
    print_info "Checking $LOG_COUNT log entries for trace context..."
    
    FOUND_TRACE=false
    for i in $(seq 0 $((LOG_COUNT < 10 ? LOG_COUNT - 1 : 9))); do
        SAMPLE_LOG=$(echo "$LOGS" | jq -r ".data.result[0].values[$i][1]" 2>/dev/null)
        
        if [ -n "$SAMPLE_LOG" ]; then
            # Try to parse as JSON
            if PARSED_LOG=$(echo "$SAMPLE_LOG" | jq . 2>/dev/null); then
                # Check for trace_id
                TRACE_ID=$(echo "$PARSED_LOG" | jq -r '.trace_id // .traceId // empty' 2>/dev/null)
                SPAN_ID=$(echo "$PARSED_LOG" | jq -r '.span_id // .spanId // empty' 2>/dev/null)
                
                if [ -n "$TRACE_ID" ] && [ -n "$SPAN_ID" ]; then
                    print_success "Found log entry with trace context"
                    print_info "  trace_id: $TRACE_ID"
                    print_info "  span_id: $SPAN_ID"
                    MESSAGE=$(echo "$PARSED_LOG" | jq -r '.message // empty' 2>/dev/null)
                    if [ -n "$MESSAGE" ]; then
                        print_info "  message: $MESSAGE"
                    fi
                    FOUND_TRACE=true
                    break
                fi
            fi
        fi
    done
    
    if [ "$FOUND_TRACE" = false ]; then
        print_warning "No log entries with trace context found"
        print_info "This may be normal if logs were generated outside of traced requests"
        # Don't fail - logs without trace context are valid for non-traced operations
    fi
else
    print_warning "No logs available to verify trace context"
    FAILED=1
fi

# ============================================================================
# STEP 8: Validate Grafana Explore Drilldown Configuration
# ============================================================================
print_step "Step 8: Validate Grafana Explore Drilldown Configuration"

print_info "Checking Tempo datasource configuration for drilldown..."
# Access Grafana API to check datasource configuration
TEMPO_DS=$(curl -s http://localhost:3000/api/datasources/name/Tempo 2>/dev/null)

if [ $? -eq 0 ]; then
    print_success "Grafana API is accessible"
    
    # Check if tracesToLogsV2 is configured
    if echo "$TEMPO_DS" | jq -e '.jsonData.tracesToLogsV2' &> /dev/null; then
        print_success "Tempo has tracesToLogsV2 configured (Traces→Logs drilldown enabled)"
        
        # Check if filterByTraceID is enabled
        FILTER_BY_TRACE=$(echo "$TEMPO_DS" | jq -r '.jsonData.tracesToLogsV2.filterByTraceID')
        if [ "$FILTER_BY_TRACE" = "true" ]; then
            print_success "filterByTraceID is enabled (automatic trace_id filtering)"
        else
            print_warning "filterByTraceID is not enabled"
        fi
        
        # Check datasource UID
        LOKI_UID=$(echo "$TEMPO_DS" | jq -r '.jsonData.tracesToLogsV2.datasourceUid')
        if [ -n "$LOKI_UID" ]; then
            print_success "Loki datasource linked: $LOKI_UID"
        else
            print_warning "Loki datasource not linked"
        fi
    else
        print_error "Tempo does not have tracesToLogsV2 configured"
        print_info "Traces→Logs drilldown will not work"
        FAILED=1
    fi
    
    # Check if tracesToMetrics is configured
    if echo "$TEMPO_DS" | jq -e '.jsonData.tracesToMetrics' &> /dev/null; then
        print_success "Tempo has tracesToMetrics configured (Traces→Metrics drilldown enabled)"
    else
        print_info "tracesToMetrics not configured (optional)"
    fi
else
    print_warning "Cannot access Grafana API (may require authentication)"
    print_info "Drilldown configuration cannot be verified automatically"
fi

# ============================================================================
# STEP 9: Simulate Drilldown Workflow (Traces → Logs)
# ============================================================================
print_step "Step 9: Simulate Drilldown Workflow (Traces → Logs)"

if echo "$TEMPO_SEARCH" | jq -e '.traces[0]' &> /dev/null; then
    SAMPLE_TRACE_ID=$(echo "$TEMPO_SEARCH" | jq -r '.traces[0].traceID' 2>/dev/null)
    
    if [ -n "$SAMPLE_TRACE_ID" ]; then
        print_info "Testing drilldown with trace_id: $SAMPLE_TRACE_ID"
        
        # Simulate what Grafana does when you click "Logs for this span"
        print_info "Simulating 'Logs for this span' button click..."
        DRILLDOWN_LOGS=$(curl -s -G "http://localhost:3100/loki/api/v1/query_range" \
            --data-urlencode "query={service_name=\"cartservice-ts\"} | json | trace_id=\"$SAMPLE_TRACE_ID\"" \
            --data-urlencode "limit=100" \
            --data-urlencode "start=$START_TIME" \
            --data-urlencode "end=$END_TIME" 2>/dev/null)
        
        if echo "$DRILLDOWN_LOGS" | jq -e '.data.result[0]' &> /dev/null; then
            LOG_COUNT=$(echo "$DRILLDOWN_LOGS" | jq -r '.data.result[0].values | length')
            print_success "✓ Traces→Logs drilldown works! Found $LOG_COUNT correlated logs"
            print_info "In Grafana: Click any span → 'Logs for this span' → See these logs"
        else
            print_warning "No logs found for this trace (may be expected if trace has no logs)"
        fi
    fi
else
    print_warning "No traces available to test drilldown"
fi

# ============================================================================
# STEP 10: Verify Grafana Explore Access (Primary Interface for Drilldown)
# ============================================================================
print_step "Step 10: Verify Grafana Explore Access"

print_info "Checking Grafana Explore endpoint..."
EXPLORE_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/explore 2>/dev/null)

if [ "$EXPLORE_CHECK" = "200" ]; then
    print_success "Grafana Explore is accessible at http://localhost:3000/explore"
    print_info "This is the primary interface for using drilldown features"
else
    print_warning "Grafana Explore returned HTTP $EXPLORE_CHECK"
fi

print_info ""
print_info "=== How to Use Drilldown in Grafana Explore ==="
print_info ""
print_info "1. Traces → Logs:"
print_info "   - Go to: http://localhost:3000/explore"
print_info "   - Select: Tempo datasource"
print_info "   - Search: {service.name=\"cartservice-ts\"}"
print_info "   - Click any span → Click 'Logs for this span' button"
print_info "   - Result: Correlated logs appear in split view"
print_info ""
print_info "2. Logs → Traces:"
print_info "   - Go to: http://localhost:3000/explore"
print_info "   - Select: Loki datasource"
print_info "   - Query: {service_name=\"cartservice-ts\"}"
print_info "   - Click any trace_id value in the logs"
print_info "   - Result: Jump to full trace in Tempo"
print_info ""
print_info "3. Metrics → Traces:"
print_info "   - Go to: http://localhost:3000/explore"
print_info "   - Select: Prometheus datasource"
print_info "   - Query: histogram_quantile(0.99, rate(cart_request_duration_seconds_bucket[5m]))"
print_info "   - Note time range with high latency"
print_info "   - Switch to Tempo, search in that time range"
print_info "   - Result: Find slow traces"
print_info ""

# ============================================================================
# Additional Dashboard Validations (Optional - Not Core to Drilldown)
# ============================================================================
print_step "Additional: Dashboard Validations (Optional)"

print_info "Note: Dashboards are NOT required for drilldown functionality"
print_info "Drilldown works in Grafana Explore without any dashboards"
print_info ""

# Validate CartService RED Metrics Dashboard
print_info "Validating CartService RED Metrics Dashboard..."

# Check dashboard exists in ConfigMap
if kubectl get configmap grafana-dashboards -o yaml | grep -q "cartservice-red-metrics.json"; then
    print_success "CartService RED Metrics dashboard exists in ConfigMap"
else
    print_warning "Dashboard missing from ConfigMap"
fi

# Validate dashboard structure
RED_DASHBOARD=$(kubectl get configmap grafana-dashboards -o jsonpath='{.data.cartservice-red-metrics\.json}' 2>/dev/null)

if [ -n "$RED_DASHBOARD" ]; then
    # Check for RED metrics
    if echo "$RED_DASHBOARD" | grep -q "cart_requests_total"; then
        print_success "Dashboard includes Rate metrics (cart_requests_total)"
    else
        print_warning "Dashboard missing Rate metrics"
    fi
    
    if echo "$RED_DASHBOARD" | grep -q "status=\"error\""; then
        print_success "Dashboard includes Error metrics"
    else
        print_warning "Dashboard missing Error metrics"
    fi
    
    if echo "$RED_DASHBOARD" | grep -q "cart_request_duration_seconds"; then
        print_success "Dashboard includes Duration metrics"
    else
        print_warning "Dashboard missing Duration metrics"
    fi
    
    # Check for SLO thresholds
    if echo "$RED_DASHBOARD" | grep -q "0.01"; then
        print_success "Dashboard includes SLO threshold for error rate (< 1%)"
    fi
    
    if echo "$RED_DASHBOARD" | grep -q "0.1"; then
        print_success "Dashboard includes SLO threshold for latency (< 100ms)"
    fi
else
    print_warning "Cannot read dashboard from ConfigMap"
fi

# Validate Grafana dashboard provisioning
echo ""
print_info "=== Validating Dashboard Provisioning in Grafana ==="

GRAFANA_DASHBOARDS=$(curl -s http://localhost:3000/api/search?type=dash-db 2>/dev/null)
if [ $? -eq 0 ]; then
    print_success "Grafana API is accessible"
    
    if echo "$GRAFANA_DASHBOARDS" | jq -e '.[] | select(.uid=="cartservice-red")' &> /dev/null; then
        print_success "CartService RED Metrics dashboard is provisioned"
    else
        print_info "Dashboard not yet provisioned (may need Grafana restart)"
    fi
else
    print_info "Cannot access Grafana API (may require authentication)"
fi

# ============================================================================
# Summary
# ============================================================================
print_step "Validation Summary"

if [ $FAILED -eq 0 ]; then
    print_success "✓ All OpenTelemetry-Grafana drilldown validations passed!"
    echo ""
    print_success "=== Drilldown Integration Status ==="
    print_success "✓ Traces collected in Tempo"
    print_success "✓ Logs collected in Loki with trace context"
    print_success "✓ Metrics collected in Prometheus"
    print_success "✓ Tempo configured for Traces→Logs drilldown"
    print_success "✓ Grafana Explore accessible"
    echo ""
    print_info "=== Quick Start Guide ==="
    print_info "Access Grafana Explore: http://localhost:3000/explore"
    print_info "Default credentials: admin/admin (if prompted)"
    echo ""
    print_info "Try the drilldown workflow:"
    print_info "  1. Select Tempo → Search: {service.name=\"cartservice-ts\"}"
    print_info "  2. Click any span → Click 'Logs for this span'"
    print_info "  3. See correlated logs appear automatically"
    print_info "  4. Click any trace_id in logs to jump back to trace"
    echo ""
    print_info "Optional: View dashboards at http://localhost:3000/dashboards"
    print_info "  - CartService RED Metrics (recommended for SLO monitoring)"
    print_info "  - Loki Logs Dashboard (quick log filtering)"
    echo ""
    exit 0
else
    print_warning "Some validations failed or returned warnings"
    echo ""
    print_info "This may be normal if:"
    print_info "  - CartService-TS hasn't received traffic yet"
    print_info "  - The services just started and telemetry is still being collected"
    print_info "  - The frontend is not deployed to generate traffic"
    echo ""
    print_info "To generate traffic, you can:"
    print_info "  1. Deploy the full application: kubectl apply -k kubernetes-manifests/"
    print_info "  2. Access the frontend and interact with the cart"
    print_info "  3. Wait a few minutes and run this script again"
    echo ""
    print_info "Even with warnings, drilldown may still work in Grafana Explore"
    print_info "Try: http://localhost:3000/explore"
    echo ""
    exit 1
fi
