# Design Document: Grafana Observability Stack

## Overview

This design implements a local-first Grafana observability stack for the Online Boutique microservices application using the grafana/docker-otel-lgtm Docker image. The solution bundles all LGTM components (Loki, Grafana, Tempo, Prometheus) with a built-in OpenTelemetry Collector in a single container, following pragmatic and maintainable patterns without over-engineering.

The implementation focuses on:
- **Single-container LGTM deployment** using grafana/otel-lgtm
- **CartService-TS instrumentation** with OpenTelemetry for logs, metrics, and traces
- **Standard Grafana dashboards** for infrastructure and application observability
- **Minimal abstractions** in instrumentation code
- **Clean separation** between telemetry and business logic

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Local Kubernetes Cluster                     │
│                                                                   │
│  ┌──────────────┐                                                │
│  │ CartService  │                                                │
│  │     -TS      │                                                │
│  │              │                                                │
│  │OTel SDK (JS) │                                                │
│  └──────┬───────┘                                                │
│         │                                                         │
│         │  OTLP/gRPC (4317)                                      │
│         │  Logs, Metrics, Traces                                 │
│         │                                                         │
│  ┌──────▼──────────────────────────────────────────────────┐    │
│  │         Grafana LGTM Stack (Single Container)           │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────────────┐    │    │
│  │  │      Built-in OpenTelemetry Collector          │    │    │
│  │  │      OTLP: 4317 (gRPC), 4318 (HTTP)            │    │    │
│  │  └────┬──────────┬──────────┬──────────────────────┘    │    │
│  │       │          │          │                            │    │
│  │  ┌────▼───┐  ┌──▼───┐  ┌───▼────────┐                  │    │
│  │  │ Loki   │  │Tempo │  │ Prometheus │                  │    │
│  │  │ :3100  │  │:3200 │  │   :9090    │                  │    │
│  │  └────┬───┘  └──┬───┘  └───┬────────┘                  │    │
│  │       │         │          │                            │    │
│  │       └─────────┼──────────┘                            │    │
│  │                 │                                        │    │
│  │          ┌──────▼──────┐                                │    │
│  │          │   Grafana   │◄──── http://localhost:3000    │    │
│  │          │     :3000   │                                │    │
│  │          │             │                                │    │
│  │          │ - Dashboards│                                │    │
│  │          │ - Explore   │                                │    │
│  │          └─────────────┘                                │    │
│  │                                                          │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**Grafana LGTM Container (grafana/otel-lgtm)**
- Single container running all observability components
- Built-in OpenTelemetry Collector receives telemetry via OTLP (gRPC 4317, HTTP 4318)
- **Loki** (port 3100): Stores and queries logs with label-based indexing
- **Tempo** (port 3200): Stores and queries distributed traces
- **Prometheus** (port 9090): Stores and queries metrics
- **Grafana** (port 3000): Unified UI for visualization and exploration
- All components communicate internally via localhost

**CartService-TS**
- TypeScript service with OpenTelemetry Node.js SDK
- Exports logs, metrics, and traces via OTLP gRPC to grafana-lgtm:4317
- Includes trace context (trace_id, span_id) in structured logs
- Instruments gRPC operations automatically

## Components and Interfaces

### 1. Grafana LGTM Stack Deployment

**Kubernetes Manifests Structure:**
```
kubernetes-manifests/
├── observability/
│   ├── grafana-lgtm.yaml              # Main LGTM deployment with built-in collector
│   ├── grafana-dashboards-data.yaml   # ConfigMap with dashboard JSON files
│   ├── kustomization.yaml             # Kustomize configuration
│   └── README.md                      # Documentation
```

**Deployment Strategy:**
- Single Deployment for the grafana-lgtm container (all components in one)
- NodePort Service exposing:
  - Port 3000: Grafana UI
  - Port 4317: OTLP gRPC receiver
  - Port 4318: OTLP HTTP receiver
- ConfigMaps for:
  - Datasource provisioning (Loki, Tempo, Prometheus)
  - Dashboard provisioning configuration
  - Dashboard JSON files
- EmptyDir volume for ephemeral storage (local dev)

**Resource Allocation (Local Development):**
- grafana-lgtm container: 1Gi memory, 500m CPU (all components combined)

### 2. Built-in OpenTelemetry Collector

**Configuration Approach:**
- The grafana/otel-lgtm image includes a pre-configured OpenTelemetry Collector
- No separate collector deployment or configuration needed
- Collector is built into the LGTM container and configured to export to localhost services

**Collector Pipeline (Built-in):**
The grafana/otel-lgtm image comes with a collector configured to:
- Receive OTLP data on ports 4317 (gRPC) and 4318 (HTTP)
- Export traces to Tempo at localhost:4317
- Export metrics to Prometheus at localhost:9090
- Export logs to Loki at localhost:3100

**Key Benefits:**
- Zero collector configuration required
- Simplified deployment (single container)
- Optimized for local development
- All components communicate via localhost (fast)

### 3. CartService-TS Instrumentation

**Current Implementation:**
The cartservice-ts already has comprehensive OpenTelemetry instrumentation:

**telemetry/instrumentation.ts:**
- Configures NodeSDK with OTLP exporters for traces, metrics, and logs
- Uses gRPC exporters pointing to OTEL_EXPORTER_OTLP_ENDPOINT
- Includes GrpcInstrumentation for automatic gRPC method tracing
- Sets service name and version via semantic conventions
- Gracefully handles initialization failures

**utils/logger.ts:**
- Provides structured JSON logging
- Automatically includes trace context (trace_id, span_id) when available
- Uses @opentelemetry/api to get active span context
- Outputs to console.log/console.error for container log collection

**Required Configuration:**
The cartservice-ts Kubernetes manifest needs:
```yaml
env:
  - name: OTEL_EXPORTER_OTLP_ENDPOINT
    value: "http://grafana-lgtm:4317"
  - name: OTEL_SERVICE_NAME
    value: "cartservice-ts"
```

**Validation Steps:**
1. Verify instrumentation.ts initializes all three exporters (traces, metrics, logs)
2. Verify logger.ts includes trace_id and span_id in log entries
3. Verify gRPC operations create spans
4. Test that telemetry reaches grafana-lgtm:4317

### 4. Dashboard Provisioning

**Dashboard Strategy:**
Use standard, community-maintained Grafana dashboards rather than building custom ones. This provides:
- Proven observability patterns
- Regular updates from the community
- Reduced maintenance burden
- Best practices built-in

**Required Dashboards:**

**1. Infrastructure Dashboard - Kubernetes Views Namespaces (ID: 15758)**
- Shows pod CPU and memory usage
- Container restart counts
- Network I/O per pod
- Resource quotas and limits
- Deployed via grafana-dashboards-data.yaml ConfigMap

**2. Logs Dashboard - Loki Stack Monitoring (ID: 14055)**
- Displays structured logs from cartservice-ts
- Supports filtering by log level, service, trace_id
- Shows log volume over time
- Trace-to-logs correlation
- Deployed via grafana-dashboards-data.yaml ConfigMap

**3. Application Metrics Dashboard - Node.js Application (ID: 11159)**
- RED metrics (Rate, Errors, Duration)
- Node.js runtime metrics (heap, event loop)
- gRPC method-level metrics
- Request/response sizes
- Deployed via grafana-dashboards-data.yaml ConfigMap

**4. Traces - Grafana Explore**
- No dashboard needed - use built-in Explore interface
- Tempo datasource provides trace search
- Trace-to-logs correlation via trace_id
- Service map visualization

### 5. Dashboard Provisioning Implementation

**ConfigMap Structure:**

```yaml
# grafana-dashboards-data.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboards
data:
  # Dashboard 1: Kubernetes infrastructure
  kubernetes-namespaces.json: |
    {
      # Downloaded from grafana.com/api/dashboards/15758/revisions/latest/download
    }
  
  # Dashboard 2: Loki logs
  loki-logs.json: |
    {
      # Downloaded from grafana.com/api/dashboards/14055/revisions/latest/download
    }
  
  # Dashboard 3: Node.js application metrics
  nodejs-app.json: |
    {
      # Downloaded from grafana.com/api/dashboards/11159/revisions/latest/download
    }
```

**Dashboard Provisioning Config:**

```yaml
# In grafana-lgtm.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard-provisioning
data:
  dashboards.yaml: |
    apiVersion: 1
    providers:
      - name: 'default'
        orgId: 1
        folder: 'Online Boutique'
        type: file
        disableDeletion: false
        updateIntervalSeconds: 10
        allowUiUpdates: true
        options:
          path: /var/lib/grafana/dashboards
```

**Datasource Provisioning:**

```yaml
# In grafana-lgtm.yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://localhost:9090
    isDefault: true
  - name: Loki
    type: loki
    access: proxy
    url: http://localhost:3100
  - name: Tempo
    type: tempo
    access: proxy
    url: http://localhost:3200
    jsonData:
      tracesToLogsV2:
        datasourceUid: Loki
        filterByTraceID: true
```

Note: All datasources use `localhost` because all components run in the same container.

### 6. Kubernetes Manifest Updates

**CartService-TS Manifest:**

Update `kubernetes-manifests/cartservice-ts.yaml` to include OpenTelemetry configuration:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cartservice-ts
spec:
  template:
    spec:
      containers:
      - name: server
        image: cartservice-ts
        env:
        - name: OTEL_EXPORTER_OTLP_ENDPOINT
          value: "http://grafana-lgtm:4317"
        - name: OTEL_SERVICE_NAME
          value: "cartservice-ts"
        - name: OTEL_SERVICE_VERSION
          value: "1.0.0"
        - name: LOG_LEVEL
          value: "info"
```

**Observability Kustomization:**

The `kubernetes-manifests/observability/kustomization.yaml` should reference:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
 - grafana-lgtm.yaml
 - grafana-dashboards-data.yaml
```

**Deployment via Kustomize:**

The observability stack is deployed as part of the main kustomization:
```bash
kubectl apply -k kubernetes-manifests/
```

Or specifically:
```bash
kubectl apply -k kubernetes-manifests/observability/
```

## Data Models

### Telemetry Data Structure

**Traces:**
- Span attributes follow OpenTelemetry semantic conventions
- Service name: cartservice-ts
- Service version: 1.0.0
- gRPC method, status code, duration
- Automatic instrumentation via GrpcInstrumentation

**Metrics:**
- Counter: grpc_server_handled_total, grpc_server_started_total
- Histogram: grpc_server_handling_seconds
- Gauge: nodejs_heap_size_used_bytes, nodejs_eventloop_lag_seconds
- Labels: service_name, grpc_method, grpc_status

**Logs:**
- Structured JSON format
- Required fields: timestamp, level, message, service_name
- Trace correlation: trace_id, span_id (automatically added by logger)
- Context: Additional metadata passed to logger methods

### Configuration Model

**Environment Variables for CartService-TS:**

```yaml
OTEL_EXPORTER_OTLP_ENDPOINT: "http://grafana-lgtm:4317"
OTEL_SERVICE_NAME: "cartservice-ts"
OTEL_SERVICE_VERSION: "1.0.0"
LOG_LEVEL: "info"
```

**Grafana LGTM Configuration:**
- No additional configuration needed
- Built-in collector auto-configured
- Datasources provisioned via ConfigMap
- Dashboards provisioned via ConfigMap

## Error Handling

### Telemetry Failures

**Principle:** Telemetry failures should never crash the application

**Implementation:**
- Wrap telemetry initialization in try-catch blocks
- Log telemetry errors but continue service operation
- Use fire-and-forget pattern for telemetry export
- Configure reasonable timeouts for export operations

**Example (TypeScript):**

```typescript
export function initializeTelemetry() {
  try {
    const sdk = new NodeSDK({...});
    sdk.start();
    console.log('OpenTelemetry initialized successfully');
  } catch (error) {
    console.error('Failed to initialize OpenTelemetry:', error);
    // Continue without telemetry
  }
}
```

### Collector Unavailability

**Behavior:**
- Services should start even if collector is unavailable
- SDK should buffer telemetry data temporarily
- Retry export with exponential backoff
- Drop oldest data if buffer is full

**Configuration:**
- Set reasonable buffer sizes (e.g., 2048 spans)
- Configure export timeout (e.g., 30 seconds)
- Enable batch processing to reduce overhead

### Storage Failures

**Loki/Tempo/Mimir:**
- Use persistent volumes for data durability
- Configure retention policies (e.g., 7 days for local dev)
- Monitor disk usage
- Graceful degradation: if storage is full, drop oldest data

## Testing Strategy

### Component Testing

**Grafana LGTM Stack:**
- Verify grafana-lgtm pod is running and healthy
- Verify all ports are accessible (3000, 4317, 4318)
- Test OTLP endpoint connectivity from cartservice-ts
- Confirm datasources are provisioned correctly

**CartService-TS Instrumentation:**
- Verify telemetry initialization doesn't break existing functionality
- Test that spans are created for gRPC operations
- Confirm metrics are exported to Prometheus
- Validate logs include trace_id and span_id
- Test graceful handling of collector unavailability

### Integration Testing

**End-to-End Flow:**
1. Deploy observability stack: `kubectl apply -k kubernetes-manifests/observability/`
2. Deploy cartservice-ts with OTEL environment variables
3. Generate traffic to cartservice-ts (via frontend or direct gRPC calls)
4. Verify data appears in Grafana:
   - Metrics in Prometheus datasource
   - Traces in Tempo datasource
   - Logs in Loki datasource
5. Verify log-trace correlation using trace_id

**Test Scenarios:**
- Add item to cart → verify gRPC span appears in Tempo
- Generate error → verify error log with trace_id appears in Loki
- Sustained load → verify metrics show request rate in Prometheus
- View dashboards → verify all three dashboards display data

### Verification Checklist

**Infrastructure Verification:**
1. Check grafana-lgtm pod: `kubectl get pods -l app=grafana-lgtm`
2. Check service endpoints: `kubectl get svc grafana-lgtm`
3. Port-forward Grafana: `kubectl port-forward svc/grafana-lgtm 3000:3000`
4. Access Grafana UI: `http://localhost:3000`

**Data Verification:**
1. Navigate to Connections → Data sources
2. Test Prometheus, Loki, and Tempo datasources
3. Go to Explore → select Loki → query: `{service_name="cartservice-ts"}`
4. Go to Explore → select Tempo → search for traces
5. Go to Explore → select Prometheus → query: `grpc_server_handled_total`

**Dashboard Verification:**
1. Navigate to Dashboards → Online Boutique folder
2. Open "Kubernetes Views Namespaces" dashboard
3. Open "Loki Stack Monitoring" dashboard
4. Open "Node.js Application Dashboard"
5. Verify all panels show data

## Deployment Considerations

### Local Development Workflow

**Initial Setup:**
```bash
# Deploy observability stack
kubectl apply -k kubernetes-manifests/observability/

# Wait for pod to be ready
kubectl wait --for=condition=ready pod -l app=grafana-lgtm --timeout=120s

# Port-forward Grafana
kubectl port-forward svc/grafana-lgtm 3000:3000

# Access Grafana
open http://localhost:3000
```

**Deploy CartService-TS:**
```bash
# Ensure OTEL environment variables are set in manifest
kubectl apply -f kubernetes-manifests/cartservice-ts.yaml
```

**Iterative Development:**
- Observability stack runs continuously
- Rebuild cartservice-ts as needed
- Telemetry automatically flows to grafana-lgtm
- Dashboards update in real-time

### Resource Requirements

**Minimum Local Kubernetes:**
- 4GB RAM available to cluster
- 2 CPU cores
- 10GB disk space

**Recommended:**
- 8GB RAM
- 4 CPU cores
- 20GB disk space

**grafana-lgtm Container:**
- Memory: 1Gi (all components combined)
- CPU: 500m
- Storage: EmptyDir (ephemeral for local dev)

### Data Retention

**Local Development (grafana/otel-lgtm defaults):**
- Metrics: Stored in-memory (lost on restart)
- Traces: Stored in-memory (lost on restart)
- Logs: Stored in-memory (lost on restart)

**Note:** For persistent storage, mount volumes to:
- `/data/loki` for logs
- `/data/tempo` for traces
- `/data/prometheus` for metrics

This is optional for local development but recommended for longer-term testing.

## Security Considerations

### Local Development Focus

Since this is local-first development:
- No TLS/authentication required between components
- Grafana can use default admin credentials
- No network policies needed
- Focus on functionality over security

### Production Considerations (Future)

If deploying to shared/production environments:
- Enable TLS for all communication
- Configure authentication for Grafana
- Use secrets for credentials
- Implement network policies
- Enable RBAC for Kubernetes resources

## Future Enhancements

### Phase 2: Additional Services
- Instrument frontend service with OpenTelemetry Go SDK
- Instrument other microservices (checkout, payment, etc.)
- Add service-specific dashboards
- Implement distributed tracing across all services

### Phase 3: Advanced Features
- Alerting rules for critical metrics
- SLO/SLI tracking for service reliability
- Persistent storage for production-like environments
- Custom business metrics dashboards

### Phase 4: Production Readiness
- Add authentication to Grafana
- Implement data retention policies
- Add backup/restore procedures
- Performance tuning and optimization

## References

- Grafana LGTM Stack: https://github.com/grafana/otel-lgtm
- OpenTelemetry Documentation: https://opentelemetry.io/docs/
- Grafana Dashboards: https://grafana.com/grafana/dashboards/
- OpenTelemetry Semantic Conventions: https://opentelemetry.io/docs/specs/semconv/
- Grafana Kubernetes Solution: https://grafana.com/solutions/kubernetes/
- Grafana Application Observability: https://grafana.com/products/cloud/application-observability/
