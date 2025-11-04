# Grafana LGTM Observability Stack

This directory contains the Grafana LGTM (Loki, Grafana, Tempo, Mimir/Prometheus) observability stack for the Online Boutique application, providing unified metrics, logs, and traces collection with full correlation capabilities.

## Overview

The observability stack provides:
- **Metrics** - Prometheus for collecting and querying metrics
- **Logs** - Loki for log aggregation and querying
- **Traces** - Tempo for distributed tracing
- **Visualization** - Grafana for unified observability UI
- **Collection** - Built-in OpenTelemetry Collector for receiving telemetry

All components run in a single container using the `grafana/otel-lgtm` image, optimized for local development.

### OpenTelemetry Instrumentation Scope

| Telemetry Type | Application Level | Infrastructure Level |
|----------------|-------------------|---------------------|
| **Traces** | ✅ gRPC operations, request flow | ❌ Not applicable |
| **Metrics** | ✅ Request rate, latency, errors, storage ops | ❌ CPU, memory, network |
| **Logs** | ✅ Structured logs with trace context | ❌ Container logs (use kubectl logs) |
| **Runtime** | ❌ Requires @opentelemetry/host-metrics | ❌ Requires node-exporter |
| **Kubernetes** | ❌ Not applicable | ❌ Requires kube-state-metrics |

**Summary**: OpenTelemetry provides **application observability** (what your code does), not **infrastructure monitoring** (what the pod/container does).

### How OpenTelemetry-Grafana Integration Works Out of the Box

The integration works **automatically without dashboards** through:

1. **Automatic Trace Context Propagation**
   - OpenTelemetry SDK injects `trace_id` and `span_id` into all logs
   - Same IDs are attached to metrics and traces
   - Enables correlation across all telemetry signals

2. **Built-in Drilldown in Grafana Explore**
   - **Traces → Logs**: Click "Logs for this span" in Tempo
   - **Logs → Traces**: Click `trace_id` values in Loki logs
   - **Metrics → Traces**: Time-based correlation via Prometheus queries

3. **Pre-configured Datasources**
   - Tempo has `tracesToLogsV2` configured to query Loki
   - Loki has service labels for filtering
   - Prometheus has span metrics auto-generated from traces

**Key Point**: Dashboards are optional. The core drilldown functionality is built into Grafana Explore and datasource configuration.

## Quick Start

### Deploy the Stack

```bash
# Deploy observability stack
kubectl apply -k kubernetes-manifests/observability/

# Wait for pod to be ready
kubectl wait --for=condition=ready pod -l app=grafana-lgtm --timeout=120s

# Port-forward Grafana UI
kubectl port-forward svc/grafana-lgtm 3000:3000
```

Access Grafana at http://localhost:3000 (default credentials: admin/admin)

**Recommended:** Start with [Grafana Explore](http://localhost:3000/explore) to use drilldown features.

### Deploy Instrumented Services

Ensure your services are configured to send telemetry to the LGTM stack:

```yaml
env:
  - name: OTEL_EXPORTER_OTLP_ENDPOINT
    value: "http://grafana-lgtm:4317"
  - name: OTEL_SERVICE_NAME
    value: "your-service-name"
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Grafana LGTM Container                     │
│                                                         │
│  ┌──────────────────────────────────────────────┐     │
│  │   Built-in OpenTelemetry Collector           │     │
│  │   Ports: 4317 (gRPC), 4318 (HTTP)            │     │
│  └────┬──────────┬──────────┬───────────────────┘     │
│       │          │          │                          │
│  ┌────▼───┐  ┌──▼───┐  ┌───▼────────┐                │
│  │ Loki   │  │Tempo │  │ Prometheus │                │
│  │ :3100  │  │:3200 │  │   :9090    │                │
│  └────┬───┘  └──┬───┘  └───┬────────┘                │
│       │         │          │                          │
│       └─────────┼──────────┘                          │
│                 │                                      │
│          ┌──────▼──────┐                              │
│          │   Grafana   │                              │
│          │     :3000   │                              │
│          └─────────────┘                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Files

- `grafana-lgtm.yaml` - Main deployment with Grafana LGTM stack and built-in OpenTelemetry Collector
- `grafana-dashboards-data.yaml` - ConfigMap containing dashboard JSON files (auto-generated)
- `add-dashboard.sh` - Script to generate the dashboards ConfigMap from JSON files
- `dashboards/` - Directory containing individual dashboard JSON files
- `kustomization.yaml` - Kustomize configuration
- `validation.sh` - Script to verify stack deployment and data flow

## Exposed Ports

- **3000** - Grafana UI
- **4317** - OTLP gRPC receiver (for application telemetry)
- **4318** - OTLP HTTP receiver (alternative endpoint)

## Datasources

Pre-configured datasources (all use localhost within the container):
- **Prometheus** - `http://localhost:9090` (default)
- **Loki** - `http://localhost:3100`
- **Tempo** - `http://localhost:3200`

Tempo is configured with trace-to-logs correlation to Loki.

## Exploring Telemetry Data

### What Metrics Are Available?

OpenTelemetry provides **application-level metrics only**:

#### ✅ Available Metrics

**Custom Cart Metrics**:
```promql
# Total cart requests by method
cart_requests_total

# Request rate (requests per second)
rate(cart_requests_total[5m])

# Average request duration
rate(cart_request_duration_seconds_sum[5m]) / rate(cart_request_duration_seconds_count[5m])

# 95th percentile request duration
histogram_quantile(0.95, rate(cart_request_duration_seconds_bucket[5m]))

# Storage operations
cart_storage_operations_total
cart_storage_duration_seconds
```

**OpenTelemetry Span Metrics** (auto-generated from traces):
```promql
# Total span calls
traces_spanmetrics_calls_total

# Span call rate
rate(traces_spanmetrics_calls_total[5m])

# Average span latency
rate(traces_spanmetrics_latency_sum[5m]) / rate(traces_spanmetrics_latency_count[5m])

# 99th percentile span latency
histogram_quantile(0.99, rate(traces_spanmetrics_latency_bucket[5m]))
```

**OpenTelemetry Collector Health**:
```promql
# Metric points received
rate(otelcol_receiver_accepted_metric_points_total[5m])

# Spans received
rate(otelcol_receiver_accepted_spans_total[5m])

# Logs received
rate(otelcol_receiver_accepted_log_records_total[5m])
```

#### ❌ NOT Available (Infrastructure Metrics)

OpenTelemetry does **not** provide pod/container infrastructure metrics:
- CPU usage: `container_cpu_usage_seconds_total` ❌
- Memory usage: `container_memory_working_set_bytes` ❌
- Network I/O: `container_network_*` ❌
- Pod info: `kube_pod_info` ❌
- Node.js runtime: `nodejs_heap_size_*`, `nodejs_eventloop_lag_seconds` ❌

**To get infrastructure metrics, you need:**
- **Kubernetes metrics**: Deploy kube-state-metrics + node-exporter
- **Node.js runtime**: Add `@opentelemetry/host-metrics` package to cartservice-ts

### Metrics (Prometheus)

**Access**: Explore → Prometheus

### Traces (Tempo)

**Access**: Explore → Tempo

**Search Methods**:
1. Service Name Search: Select "cartservice-ts" from dropdown
2. TraceQL Query: `{service.name="cartservice-ts"}`

**Trace Details Include**:
- Span hierarchy (tree view of operations)
- Span duration and timing
- Span attributes (gRPC method, status code)
- Service and operation names

**Common Operations**:
- `/hipstershop.CartService/GetCart` - Duration: ~5-50ms
- `/hipstershop.CartService/AddItem` - Duration: ~10-100ms
- `/hipstershop.CartService/EmptyCart` - Duration: ~5-50ms

**Trace-to-Logs Correlation**:
1. Click on any span in the trace view
2. Click "Logs for this span" button
3. Logs with matching trace_id appear in split view

### Logs (Loki)

**Access**: Explore → Loki

**Basic Queries**:
```logql
# All cartservice-ts logs
{service_name="cartservice-ts"}

# Filter by log level
{service_name="cartservice-ts"} | json | level="info"
{service_name="cartservice-ts"} | json | level="error"

# Filter by trace ID
{service_name="cartservice-ts"} | json | trace_id="<your-trace-id>"

# Filter by message content
{service_name="cartservice-ts"} | json | message =~ "Cart retrieved"

# Custom format
{service_name="cartservice-ts"} | json | line_format "{{.timestamp}} [{{.level}}] {{.message}} (trace: {{.trace_id}})"
```

**Log Entry Structure**:
```json
{
  "timestamp": "2025-10-28T10:56:26.270Z",
  "level": "info",
  "message": "Cart retrieved",
  "service": "cartservice-ts",
  "context": {
    "userId": "334433d7-342c-43a8-b8f9-e6263b6808c5",
    "itemCount": 0
  },
  "trace_id": "a8f6376bdd84d6b8e324af2c678652b2",
  "span_id": "3471610429068bf4"
}
```

## Dashboards

### Why Dashboards?

While drilldown works perfectly in Grafana Explore without dashboards, dashboards provide:
- **At-a-glance monitoring** - See multiple metrics simultaneously
- **Alerting** - Set up alerts based on thresholds
- **Team sharing** - Share standardized views with your team
- **Historical analysis** - Compare metrics over time periods
- **Custom visualizations** - Tailored charts for specific use cases

### Available Dashboard

Access via: Dashboards → Online Boutique folder

**CartService RED Metrics** (`cartservice-red-metrics.json`) ⭐
- **Rate**: Request rate per method (AddItem, GetCart, EmptyCart)
- **Errors**: Error rate and error count by method with SLO threshold (< 1%)
- **Duration**: P50, P95, P99 latency percentiles with SLO threshold (< 100ms)
- **Storage Performance**: Redis/Memory operation rates and latencies
- **Use case**: Real-time service health monitoring and SLO tracking

This is the **only dashboard** because:
- ✅ Works with OpenTelemetry metrics out of the box
- ✅ Provides actionable SLO monitoring
- ✅ Complements Grafana Explore drilldown workflow
- ❌ Other dashboards require additional infrastructure (kube-state-metrics, prom-client)
- ❌ Log filtering is better done in Grafana Explore

### The CartService RED Metrics Dashboard

This is the **only dashboard** included, and it's the most useful for day-to-day monitoring:

**What it shows:**
- **Service Health Overview**: Error rate, P95 latency, request rate, error count
- **Rate**: Requests per second by method (AddItem, GetCart, EmptyCart)
- **Errors**: Error rate and count by method with SLO threshold (< 1%)
- **Duration**: P50, P95, P99 latency percentiles with SLO threshold (< 100ms)
- **Storage Performance**: Redis/Memory operation rates and latencies

**When to use it:**
- Monitoring service health in real-time
- Tracking SLO compliance (error rate < 1%, P95 latency < 100ms)
- Identifying performance degradation
- Comparing method performance (which operations are slow?)
- Debugging storage backend issues

**How it complements drilldown:**
1. See high error rate on dashboard → Note the time range
2. Go to Explore → Tempo → Search for traces in that time range
3. Click slow trace → Click "Logs for this span"
4. Investigate root cause in correlated logs

### Dashboard Management

Dashboards are managed as separate JSON files in the `dashboards/` directory.

**Adding New Dashboards**:
```bash
# Download from Grafana.com
curl -s "https://grafana.com/api/dashboards/{ID}/revisions/latest/download" \
  -o kubernetes-manifests/observability/dashboards/my-dashboard.json

# Regenerate ConfigMap
bash kubernetes-manifests/observability/add-dashboard.sh

# Apply changes
kubectl apply -k kubernetes-manifests/observability/
```

**Custom Dashboards**:
1. Create dashboard in Grafana UI
2. Export as JSON (Share → Export → Save to file)
3. Save to `kubernetes-manifests/observability/dashboards/`
4. Regenerate ConfigMap and apply

## Validation Status

The observability stack has been validated with cartservice-ts:

### ✅ Traces (Tempo)
- Traces successfully collected with proper span hierarchy
- Trace IDs properly formatted and searchable
- OTLP gRPC export to grafana-lgtm:4317 working
- Drilldown to logs working via "Logs for this span" button

### ✅ Logs (Loki)
- Structured JSON logs with trace context
- Logs include trace_id and span_id for correlation
- Queryable by service_name="cartservice-ts"
- OTLP gRPC export working
- Drilldown to traces working via trace_id click

### ✅ Metrics (Prometheus)
- Custom application metrics (cart_requests_total, cart_request_duration_seconds_*, cart_storage_*)
- OpenTelemetry span metrics (traces_spanmetrics_calls_total, traces_spanmetrics_latency_*)
- OpenTelemetry Collector metrics showing data flow
- CartService RED Metrics dashboard working

**Note**: OpenTelemetry provides **application-level metrics only**. Infrastructure metrics (CPU, memory, network) require additional exporters.

### ✅ Drilldown Integration
- Tempo → Loki correlation configured (tracesToLogsV2)
- Grafana Explore accessible and functional
- Trace context propagation working
- No additional infrastructure required

## Drilldown Workflow Examples

### Example 1: Investigating a Slow Request (Using Explore)

**Start in Grafana Explore** (http://localhost:3000/explore):

1. **Find Slow Traces** (Tempo):
   - Select datasource: Tempo
   - Search: `{service.name="cartservice-ts"}`
   - Sort by: Duration (longest first)
   - Click on a slow trace (e.g., > 100ms)

2. **Drilldown to Logs**:
   - In the trace view, click "Logs for this span" button
   - Grafana automatically queries: `{service_name="cartservice-ts"} | json | trace_id="<trace-id>"`
   - Logs appear in split view showing what happened during that request

3. **Analyze Root Cause**:
   - Review log messages for errors or warnings
   - Check context fields (userId, productId, etc.)
   - Identify bottleneck (e.g., slow Redis operation)

### Example 2: Investigating Errors (Dashboard → Explore)

**Start in CartService RED Metrics Dashboard**:

1. **Spot the Issue**:
   - Notice error rate spike on dashboard
   - Note the time range (e.g., 10:30-10:35)
   - See which method has errors (e.g., AddItem)

2. **Switch to Explore → Tempo**:
   - Search: `{service.name="cartservice-ts" && status=error}`
   - Filter time range: 10:30-10:35
   - Click on error trace

3. **Drilldown to Logs**:
   - Click "Logs for this span"
   - See error logs with full context
   - Identify error message and stack trace

4. **Verify Fix**:
   - Return to dashboard
   - Confirm error rate returns to normal

### Example 3: Logs-First Investigation

**Start in Grafana Explore → Loki**:

1. **Find Error Logs**:
   - Query: `{service_name="cartservice-ts"} | json | level="error"`
   - See error: "Redis connection timeout"

2. **Drilldown to Trace**:
   - Click the `trace_id` value in the log entry
   - Grafana jumps to the full trace in Tempo
   - See the complete request flow

3. **Analyze Timing**:
   - Examine span durations
   - Identify which operation timed out
   - Check if it's a pattern or one-off issue

### Common Issues

**No Traces Found**:
- Check time range (default is last 1 hour)
- Verify cartservice-ts is receiving traffic
- Query: `{service.name="cartservice-ts"}` (note: service.name, not service_name)
- Check Tempo datasource connection

**No Logs Found**:
- Check time range
- Verify label syntax: `{service_name="cartservice-ts"}` (with quotes)
- Check Loki datasource connection
- Try broader query: `{service_name=~".*"}`

**Trace-to-Logs Not Working**:
- Verify Tempo datasource has tracesToLogsV2 configured
- Check that logs have trace_id field
- Ensure Loki datasource is selected in Tempo config
- Try manual correlation with trace_id

**Metrics Not Showing**:
- Check Prometheus datasource connection
- Verify metric names (use metrics browser)
- Check time range and step interval
- Query collector metrics: `otelcol_receiver_accepted_metric_points_total`

**Dashboards Not Loading**:
```bash
# Check ConfigMap
kubectl get configmap grafana-dashboards -o yaml

# Verify dashboard provisioning
kubectl logs -l app=grafana-lgtm | grep -i dashboard

# Restart Grafana pod
kubectl delete pod -l app=grafana-lgtm
```

**Pod Not Starting**:
```bash
# Check pod events
kubectl describe pod -l app=grafana-lgtm

# Check logs
kubectl logs -l app=grafana-lgtm
```

## Frequently Asked Questions

### Q: Why don't I see CPU/memory metrics for cartservice-ts?

**A:** OpenTelemetry provides **application-level metrics only** (request rate, latency, errors). For infrastructure metrics (CPU, memory, network), you need:
- **Kubernetes metrics**: Deploy kube-state-metrics + node-exporter
- **Node.js runtime**: Add `@opentelemetry/host-metrics` package

### Q: Can I monitor pod resource usage?

**A:** Not with OpenTelemetry alone. Use:
```bash
# Quick check
kubectl top pods -l app=cartservice-ts

# For Grafana dashboards
# Deploy kube-state-metrics and configure Prometheus to scrape it
```

### Q: What about Node.js heap and event loop metrics?

**A:** Not included by default. To add:
```bash
cd src/cartservice-ts
npm install @opentelemetry/host-metrics

# Update instrumentation.ts to include HostMetrics
```

### Q: Do I need dashboards for drilldown to work?

**A:** No! Drilldown works in Grafana Explore without any dashboards. Dashboards are only for visualization and monitoring.

### Q: What's the difference between application and infrastructure observability?

**A:**
- **Application**: What your code does (requests, errors, latency, business logic)
- **Infrastructure**: What the container/pod does (CPU, memory, network, disk)

OpenTelemetry focuses on application observability.

## Tips and Best Practices

### Tempo
- Use time range selector to narrow down search
- Click on span attributes to filter by specific values
- Use "Compare" feature to compare multiple traces
- Export trace data for offline analysis

### Prometheus
- Use "Metrics browser" to discover available metrics
- Add multiple queries to compare metrics
- Use "Table" view for detailed metric values
- Set up recording rules for frequently used queries

### Loki
- Use `| json` to parse JSON logs
- Use `| line_format` to customize log display
- Use `| label_format` to create new labels
- Combine multiple filters with `|` operator

### General
- Use "Split" view to compare multiple datasources
- Pin frequently used queries for quick access
- Use variables in dashboards for dynamic filtering
- Set up alerts based on metrics or log patterns

## Resource Requirements

**Minimum**:
- Memory: 1Gi
- CPU: 500m
- Storage: EmptyDir (ephemeral)

**Recommended for production-like testing**:
- Memory: 2Gi
- CPU: 1000m
- Storage: Persistent volume

## Data Retention

By default, data is stored in-memory and lost on pod restart. For persistent storage, mount volumes to:
- `/data/loki` - Logs
- `/data/tempo` - Traces
- `/data/prometheus` - Metrics

## References

- [Grafana LGTM Stack](https://github.com/grafana/docker-otel-lgtm)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Grafana Explore Documentation](https://grafana.com/docs/grafana/latest/explore/) - **Primary interface for drilldown**
- [Tempo Trace to Logs](https://grafana.com/docs/tempo/latest/operations/traceql/#trace-to-logs)
- [PromQL Query Examples](https://prometheus.io/docs/prometheus/latest/querying/examples/)
- [LogQL Query Examples](https://grafana.com/docs/loki/latest/logql/)
