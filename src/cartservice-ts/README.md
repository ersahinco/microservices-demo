# Cart Service (TypeScript)

A gRPC-based microservice that manages shopping cart operations for the Online Boutique application. This TypeScript implementation replaces the original .NET version with a focus on maintainability, pragmatism, and local-first development.

## Overview

The Cart Service provides three core operations:
- **AddItem**: Add products to a user's cart or increment quantities
- **GetCart**: Retrieve a user's complete shopping cart
- **EmptyCart**: Clear all items from a user's cart

The service supports two storage backends (Redis and in-memory) and includes comprehensive OpenTelemetry instrumentation for observability with the Grafana LGTM stack.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Cart Service (TS)                     │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │           gRPC Server (Port 7070)                  │ │
│  │  - CartService (AddItem, GetCart, EmptyCart)       │ │
│  │  - HealthService (Check)                           │ │
│  └────────────────┬───────────────────────────────────┘ │
│                   │                                      │
│  ┌────────────────▼───────────────────────────────────┐ │
│  │         OpenTelemetry Middleware                   │ │
│  │  - Automatic gRPC instrumentation                  │ │
│  │  - Trace propagation                               │ │
│  │  - Metrics collection (10s interval)               │ │
│  │  - Structured logging with trace correlation       │ │
│  └────────────────┬───────────────────────────────────┘ │
│                   │                                      │
│  ┌────────────────▼───────────────────────────────────┐ │
│  │            Cart Handler Layer                      │ │
│  │  - Request validation                              │ │
│  │  - Business logic                                  │ │
│  │  - Error handling                                  │ │
│  └────────────────┬───────────────────────────────────┘ │
│                   │                                      │
│  ┌────────────────▼───────────────────────────────────┐ │
│  │         Storage Abstraction (ICartStore)           │ │
│  └────────────────┬───────────────────────────────────┘ │
│                   │                                      │
│         ┌─────────┴─────────┐                           │
│         │                   │                           │
│  ┌──────▼──────┐    ┌──────▼──────┐                    │
│  │ RedisStore  │    │ MemoryStore │                    │
│  └──────┬──────┘    └──────┬──────┘                    │
└─────────┼──────────────────┼───────────────────────────┘
          │                  │
          │ OTLP/gRPC        │
          │ (port 4317)      │
          ▼                  ▼
    ┌─────────┐      ┌────────────────┐
    │  Redis  │      │ Grafana LGTM   │
    │(External)│      │ (Observability)│
    └─────────┘      └────────────────┘
```

## Technology Stack

- **Runtime**: Node.js 20 (LTS)
- **Language**: TypeScript 5.x
- **gRPC Framework**: @grpc/grpc-js
- **Protobuf**: @grpc/proto-loader
- **Redis Client**: ioredis
- **Observability**: OpenTelemetry SDK with OTLP exporters
- **Testing**: Jest
- **Container**: Node.js Alpine-based Docker image

## Configuration


The service is configured via environment variables:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | gRPC server port | `7070` | No |
| `REDIS_ADDR` | Redis connection string (host:port) | `null` | No |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` | No |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint | `null` | No |
| `OTEL_SERVICE_NAME` | Service name for telemetry | `cartservice-ts` | No |
| `OTEL_SERVICE_VERSION` | Service version for telemetry | `1.0.0` | No |

### Storage Backend Selection

- **Redis**: Set `REDIS_ADDR` to use Redis as the storage backend (e.g., `redis-cart:6379`)
- **In-Memory**: Leave `REDIS_ADDR` unset to use in-memory storage (suitable for development)

## Local Development

### Prerequisites

- Node.js 20 or later
- npm 9 or later
- (Optional) Redis server for testing with Redis backend

### Setup

1. Install dependencies:
```bash
cd src/cartservice-ts
npm install
```

2. Run in development mode:
```bash
npm run dev
```

3. Run with Redis (optional):
```bash
# Start Redis in Docker
docker run -d -p 6379:6379 redis:alpine

# Run service with Redis
REDIS_ADDR=localhost:6379 npm run dev
```

### Development Workflow

```bash
# Install dependencies
npm install

# Run in development mode (with auto-reload)
npm run dev

# Build TypeScript to JavaScript
npm run build

# Run compiled JavaScript
npm start

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run specific test file
npm test -- cart-handler.test.ts

# Run in watch mode (for development)
npm test -- --watch
```

### Test Structure

- `tests/handlers/` - Tests for gRPC handler logic
- `tests/storage/` - Tests for storage layer implementations

## Build and Deployment

### Docker Build

Build the Docker image:

```bash
# From the cartservice-ts directory
docker build -t cartservice-ts:latest .

# Build with specific tag
docker build -t gcr.io/[PROJECT_ID]/cartservice-ts:v1.0.0 .
```

Run the container:

```bash
# Run with in-memory storage
docker run -p 7070:7070 cartservice-ts:latest

# Run with Redis and observability
docker run -p 7070:7070 \
  -e REDIS_ADDR=redis-cart:6379 \
  -e OTEL_EXPORTER_OTLP_ENDPOINT=http://grafana-lgtm:4317 \
  cartservice-ts:latest
```

### Kubernetes Deployment

The service includes Kubernetes manifests at `kubernetes-manifests/cartservice-ts.yaml`.

Deploy to Kubernetes:

```bash
# Apply the manifest
kubectl apply -f kubernetes-manifests/cartservice-ts.yaml

# Check deployment status
kubectl get pods -l app=cartservice-ts

# View logs
kubectl logs -l app=cartservice-ts -f

# Check service
kubectl get svc cartservice-ts
```

### Skaffold Development

For local Kubernetes development with Skaffold:

```bash
# From the repository root
skaffold dev

# Deploy only cartservice-ts
skaffold dev --module=cartservice-ts

# Build images without deploying
skaffold build
```

Skaffold will:
1. Build the Docker image
2. Deploy to your local Kubernetes cluster
3. Stream logs to your terminal
4. Automatically rebuild and redeploy on code changes

## OpenTelemetry Observability

### What OpenTelemetry Provides

OpenTelemetry instrumentation for cartservice-ts provides telemetry at **application level only**:

#### ✅ Application Level (What's Included)

**1. Traces** - Distributed tracing for gRPC operations
- Automatic span creation for all gRPC method calls
- Span hierarchy showing request flow
- Timing information for each operation
- Status codes and error tracking

**2. Custom Application Metrics**
- `cart_requests_total` - Request count by method and status
- `cart_request_duration_seconds` - Request latency histogram
- `cart_storage_operations_total` - Storage operation count
- `cart_storage_duration_seconds` - Storage operation latency

**3. OpenTelemetry Span Metrics** (auto-generated from traces)
- `traces_spanmetrics_calls_total` - Span call count
- `traces_spanmetrics_latency_*` - Span latency histograms

**4. Structured Logs with Trace Correlation**
- JSON logs with trace_id and span_id
- Automatic correlation with traces
- Log level filtering (info, warn, error)

#### ❌ Infrastructure Level (NOT Included)

OpenTelemetry does **NOT** provide pod/container infrastructure metrics:
- ❌ CPU usage (container_cpu_usage_seconds_total)
- ❌ Memory usage (container_memory_working_set_bytes)
- ❌ Network I/O (container_network_*)
- ❌ Disk I/O
- ❌ Node.js runtime metrics (heap, event loop lag)

**Why?** OpenTelemetry focuses on application-level observability. Infrastructure metrics require:
- **For Kubernetes metrics**: kube-state-metrics + node-exporter
- **For Node.js runtime**: `@opentelemetry/host-metrics` package (optional)

All telemetry data is sent via OTLP (OpenTelemetry Protocol) to the Grafana LGTM stack running at `grafana-lgtm:4317`.

### Instrumentation Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ CartService-TS Container                                     │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Application Code (index.ts, handlers, etc.)            │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ OpenTelemetry Instrumentation (auto-loaded via         │ │
│  │ --require flag)                                        │ │
│  │                                                         │ │
│  │  • GrpcInstrumentation (auto-traces gRPC calls)       │ │
│  │  • Logger with OTLP export                            │ │
│  │  • Metrics with 10s export interval                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ OTLP Exporters (gRPC)                                  │ │
│  │  • OTLPTraceExporter                                   │ │
│  │  • OTLPMetricExporter                                  │ │
│  │  • OTLPLogExporter                                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │
                           │ OTLP/gRPC (port 4317)
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Grafana LGTM Stack (grafana-lgtm:4317)                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Built-in OpenTelemetry Collector                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                   │
│         ┌────────────────┼────────────────┐                 │
│         ▼                ▼                ▼                 │
│    ┌────────┐      ┌────────┐      ┌──────────┐           │
│    │ Tempo  │      │ Loki   │      │Prometheus│           │
│    │(Traces)│      │ (Logs) │      │(Metrics) │           │
│    └────────┘      └────────┘      └──────────┘           │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          ▼                                   │
│                    ┌──────────┐                             │
│                    │ Grafana  │                             │
│                    │   UI     │                             │
│                    └──────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Details

#### 1. Instrumentation Loading (Dockerfile)

The instrumentation is loaded **before** the application code using Node.js `--require` flag:

```dockerfile
CMD ["node", "--require", "./dist/telemetry/instrumentation.js", "dist/index.js"]
```

This ensures:
- OpenTelemetry SDK is initialized first
- gRPC instrumentation hooks into the gRPC library before it's used
- All traces, metrics, and logs are properly captured

#### 2. Traces

**Implementation**: `src/telemetry/instrumentation.ts`

- Uses `GrpcInstrumentation` to automatically trace all gRPC method calls
- Exports traces via `OTLPTraceExporter` to `grafana-lgtm:4317`
- Includes service name and version in resource attributes

**What gets traced**:
- `AddItem` - Adding items to cart
- `GetCart` - Retrieving cart contents
- `EmptyCart` - Clearing cart
- All gRPC method calls with timing, status, and metadata

#### 3. Metrics

**Implementation**: `src/telemetry/instrumentation.ts`

- Uses `PeriodicExportingMetricReader` with 10-second export interval
- Exports metrics via `OTLPMetricExporter` to `grafana-lgtm:4317`
- Automatically collects gRPC metrics from instrumentation

**Custom Application Metrics**:
- `cart_requests_total` - Counter of requests by method and status
- `cart_request_duration_seconds` - Histogram of request latency
- `cart_storage_operations_total` - Counter of storage operations
- `cart_storage_duration_seconds` - Histogram of storage operation latency

**OpenTelemetry Span Metrics** (auto-generated):
- `traces_spanmetrics_calls_total` - Total span calls
- `traces_spanmetrics_latency_*` - Span latency histograms
- `traces_service_graph_request_*` - Service graph metrics

**Export interval**: 10 seconds (configurable)

#### 4. Logs

**Implementation**: `src/utils/logger.ts`

- Structured JSON logging with trace correlation
- Sends logs via `OTLPLogExporter` to `grafana-lgtm:4317`
- Also outputs to console for container log collection
- Automatically includes `trace_id` and `span_id` when available

**Log format**:
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

### Scope of OpenTelemetry Instrumentation

**Application Level Only:**
- ✅ gRPC request tracing (automatic via GrpcInstrumentation)
- ✅ Custom business metrics (cart operations)
- ✅ Structured logs with trace correlation
- ✅ Request/response timing and status

**NOT Infrastructure Level:**
- ❌ Pod CPU usage
- ❌ Pod memory usage
- ❌ Network I/O
- ❌ Node.js heap/event loop (requires additional package)

**Why?** OpenTelemetry focuses on **application observability** (what your code is doing), not **infrastructure monitoring** (what the container/pod is doing).

### How OpenTelemetry-Grafana Integration Works Out of the Box

The integration between OpenTelemetry and Grafana works **automatically** without requiring any dashboards. Here's how:

#### 1. Automatic Trace Context Propagation

When a request hits cartservice-ts:
1. OpenTelemetry creates a unique `trace_id` and `span_id`
2. These IDs are automatically injected into all logs during that request
3. The same IDs are attached to metrics and traces
4. Grafana uses these IDs to correlate everything

#### 2. Built-in Drilldown in Grafana Explore

**Traces → Logs** (Click "Logs for this span"):
- In Tempo, click any span
- Click "Logs for this span" button
- Grafana automatically queries: `{service_name="cartservice-ts"} | json | trace_id="<trace-id>"`
- All logs for that specific request appear in split view

**Logs → Traces** (Click trace_id):
- In Loki logs, each entry shows the `trace_id` field
- Click the trace_id value
- Jumps directly to the corresponding trace in Tempo
- Shows full request flow and timing

**Metrics → Traces** (Time-based correlation):
- Query high-latency metrics in Prometheus
- Note the time range with issues
- Search Tempo for traces in that time range
- Filter by service and sort by duration

#### 3. No Dashboards Required

The drilldown functionality is built into:
- **Grafana Explore** - Interactive query interface
- **Datasource Configuration** - Tempo's `tracesToLogsV2` setting
- **OpenTelemetry SDK** - Automatic trace context injection

Dashboards are optional and only provide:
- Pre-built visualizations
- Quick filters and dropdowns
- Multiple related metrics in one view

### Viewing Telemetry in Grafana

#### Access Grafana

```bash
kubectl port-forward svc/grafana-lgtm 3000:3000
```

Then open: http://localhost:3000 (default credentials: admin/admin)

**Recommended workflow**: Use **Explore** (not Dashboards) for investigating issues

#### View Traces (Tempo) - Start Here for Investigations

Navigate to: **Explore → Tempo**

**Search for traces**:
- Service Name: Select "cartservice-ts"
- TraceQL Query: `{service.name="cartservice-ts"}`
- Sort by duration to find slow requests

**Trace details include**:
- Span hierarchy for gRPC operations
- Operation names: `/hipstershop.CartService/GetCart`, `/hipstershop.CartService/AddItem`, etc.
- Duration: ~5-100ms depending on operation
- **Drilldown**: Click "Logs for this span" button to see correlated logs

#### View Metrics (Prometheus)

Navigate to: Explore → Prometheus

**Example queries**:
```promql
# Request rate
rate(cart_requests_total[5m])

# Average request duration
rate(cart_request_duration_seconds_sum[5m]) / rate(cart_request_duration_seconds_count[5m])

# 95th percentile latency
histogram_quantile(0.95, rate(cart_request_duration_seconds_bucket[5m]))

# Span metrics (auto-generated)
rate(traces_spanmetrics_calls_total{service_name="cartservice-ts"}[5m])
```

#### View Logs (Loki)

Navigate to: **Explore → Loki**

**Example queries**:
```logql
# All cartservice-ts logs
{service_name="cartservice-ts"}

# Error logs only
{service_name="cartservice-ts"} | json | level="error"

# Logs for specific trace (auto-populated when clicking trace_id)
{service_name="cartservice-ts"} | json | trace_id="<trace-id>"

# Logs with specific message
{service_name="cartservice-ts"} | json | message =~ "Cart retrieved"
```

**Drilldown**: Click any `trace_id` value in logs to jump to the full trace in Tempo

### Using Drilldown to Debug Issues

The real power of OpenTelemetry-Grafana integration is the **drilldown workflow**:

#### Example: Debugging a Slow Request

1. **Start in Grafana Explore** (http://localhost:3000/explore)
   - Select: Tempo datasource
   - Search: `{service.name="cartservice-ts"}`
   - Sort by duration to find slow requests

2. **Click "Logs for this span"**
   - Grafana automatically shows all logs for that request
   - See exactly what happened: "Redis operation took 150ms"

3. **Analyze the context**
   - Check log fields: userId, productId, operation
   - Identify pattern: Large carts are slow
   - Root cause: Need to optimize Redis batch operations

#### Example: Investigating Errors

1. **Find error in logs** (Explore → Loki)
   - Query: `{service_name="cartservice-ts"} | json | level="error"`
   - See: "Failed to add item: Redis connection timeout"

2. **Click the trace_id**
   - Jumps to the full trace in Tempo
   - See the complete request flow and timing

3. **Understand the failure**
   - Span shows: AddItem took 5000ms (timeout)
   - Previous spans: Normal timing
   - Conclusion: Redis connection issue, not application bug

### Verification

#### 1. Check Instrumentation Initialization

```bash
kubectl logs -l app=cartservice-ts --tail=50 | grep "OpenTelemetry instrumentation initialized"
```

Expected output:
```json
{"timestamp":"2025-10-27T15:10:31.190Z","level":"info","message":"OpenTelemetry instrumentation initialized","service":"cartservice-ts","context":{"serviceName":"cartservice-ts","serviceVersion":"1.0.0","otelEndpoint":"http://grafana-lgtm:4317"}}
```

#### 2. Run Validation Script

```bash
bash kubernetes-manifests/observability/validation.sh
```

This validates:
- ✅ Grafana LGTM pod is running
- ✅ CartService-TS has OTEL environment variables
- ✅ Metrics appear in Prometheus
- ✅ Traces appear in Tempo
- ✅ Logs appear in Loki with trace correlation
- ✅ Drilldown configuration (Traces→Logs, Logs→Traces)
- ✅ Grafana Explore accessibility

### Troubleshooting Observability

#### No Traces Appearing

**Symptom**: No traces in Tempo

**Causes**:
1. Instrumentation not loaded before application code
2. OTLP endpoint unreachable
3. No traffic to the service

**Solution**:
- Verify Dockerfile uses `--require` flag
- Check network connectivity: `kubectl exec -it <pod> -- nc -zv grafana-lgtm 4317`
- Generate traffic via frontend or direct gRPC calls
- Check collector metrics: `otelcol_receiver_accepted_spans_total`

#### No Metrics Appearing

**Symptom**: No metrics in Prometheus

**Causes**:
1. Metrics export interval not reached (wait 10+ seconds)
2. No gRPC traffic to generate metrics
3. Instrumentation not properly initialized

**Solution**:
- Wait at least 10 seconds after first request
- Generate traffic to the service
- Check logs for instrumentation errors
- Query collector: `otelcol_receiver_accepted_metric_points_total`

#### No Logs in Loki

**Symptom**: Logs appear in console but not in Loki

**Causes**:
1. LoggerProvider not initialized
2. OTLP log exporter not configured
3. Logs not being sent via OTLP

**Solution**:
- Verify `OTLPLogExporter` is configured in instrumentation
- Check that logger uses `logs.getLoggerProvider()`
- Verify logs have `service_name` label
- Check collector: `otelcol_receiver_accepted_log_records_total`

#### Trace Context Missing in Logs

**Symptom**: Logs don't have `trace_id` or `span_id`

**Causes**:
1. No active span when log is emitted
2. Logger not accessing active span context
3. Logs emitted outside of traced operations

**Solution**:
- Ensure logs are emitted within gRPC handler context
- Verify logger uses `trace.getActiveSpan()`
- Check that spans are properly created
- Startup logs may not have trace context (expected)

## API Reference

### gRPC Service Definition

The service implements the `CartService` interface defined in `proto/demo.proto`:

```protobuf
service CartService {
    rpc AddItem(AddItemRequest) returns (Empty) {}
    rpc GetCart(GetCartRequest) returns (Cart) {}
    rpc EmptyCart(EmptyCartRequest) returns (Empty) {}
}
```

### Methods

#### AddItem

Adds an item to a user's cart or increments the quantity if the product already exists.

**Request**:
```protobuf
message AddItemRequest {
    string user_id = 1;
    CartItem item = 2;
}

message CartItem {
    string product_id = 1;
    int32 quantity = 2;
}
```

**Response**: `Empty`

**Errors**:
- `INVALID_ARGUMENT` - Missing or invalid userId, productId, or quantity
- `FAILED_PRECONDITION` - Storage backend unavailable

#### GetCart

Retrieves a user's complete shopping cart.

**Request**:
```protobuf
message GetCartRequest {
    string user_id = 1;
}
```

**Response**:
```protobuf
message Cart {
    string user_id = 1;
    repeated CartItem items = 2;
}
```

**Errors**:
- `INVALID_ARGUMENT` - Missing userId
- `FAILED_PRECONDITION` - Storage backend unavailable

#### EmptyCart

Clears all items from a user's cart.

**Request**:
```protobuf
message EmptyCartRequest {
    string user_id = 1;
}
```

**Response**: `Empty`

**Errors**:
- `INVALID_ARGUMENT` - Missing userId
- `FAILED_PRECONDITION` - Storage backend unavailable

### Health Check

The service implements the gRPC health check protocol:

```bash
# Check service health (requires grpc-health-probe)
grpc-health-probe -addr=localhost:7070
```

## Project Structure

```
src/cartservice-ts/
├── src/
│   ├── index.ts                 # Application entry point
│   ├── server.ts                # gRPC server setup
│   ├── handlers/
│   │   ├── cart-handler.ts      # CartService gRPC handlers
│   │   └── health-handler.ts    # HealthService gRPC handlers
│   ├── storage/
│   │   ├── cart-store.ts        # ICartStore interface
│   │   ├── redis-store.ts       # Redis implementation
│   │   └── memory-store.ts      # In-memory implementation
│   ├── telemetry/
│   │   ├── instrumentation.ts   # OpenTelemetry setup
│   │   └── metrics.ts           # Custom metrics
│   └── utils/
│       ├── config.ts            # Configuration management
│       └── logger.ts            # Logging utility with OTLP export
├── proto/
│   └── demo.proto               # Protobuf definitions
├── tests/
│   ├── handlers/
│   └── storage/
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

### Service won't start

**Check logs**:
```bash
kubectl logs -l app=cartservice-ts
```

**Common issues**:
- Redis connection failure: Verify `REDIS_ADDR` is correct and Redis is accessible
- Port already in use: Check if another service is using port 7070
- Missing dependencies: Run `npm install`
- Instrumentation errors: Check for OpenTelemetry initialization errors

### Redis connection errors

**Symptoms**: `FAILED_PRECONDITION` errors in logs

**Solutions**:
- Verify Redis is running: `redis-cli ping`
- Check Redis address: Ensure `REDIS_ADDR` format is `host:port`
- Check network connectivity: Ensure service can reach Redis
- Fall back to in-memory: Unset `REDIS_ADDR` environment variable

### High latency

**Check**:
- Redis performance: Monitor Redis latency and connection pool
- Resource limits: Verify CPU and memory are not constrained
- Network latency: Check inter-service network performance
- Metrics: Review Grafana dashboards for bottlenecks
- Traces: Use Tempo to identify slow operations

### Memory leaks

**Monitor**:
- Pod memory usage: `kubectl top pods -l app=cartservice-ts`
- Heap snapshots: Use Node.js profiling tools
- Connection pools: Verify Redis connections are properly closed
- Metrics: Check `nodejs_heap_size_used_bytes` in Grafana

## Best Practices

### Observability

1. **Always Load Instrumentation First**: Use `--require` flag to load instrumentation before application code
2. **Use Structured Logging**: Always log with structured context for better querying
3. **Set Appropriate Export Intervals**: 10s for development, 60s for production
4. **Include Service Metadata**: Always set service name and version
5. **Handle Telemetry Failures Gracefully**: Never let telemetry failures crash the application

### Code Style

- Use TypeScript strict mode
- Follow existing code structure and patterns
- Keep abstractions minimal and pragmatic
- Write tests for new functionality
- Document complex logic with inline comments

## Contributing

### Making Changes

1. Make your changes in the `src/` directory
2. Run tests: `npm test`
3. Build: `npm run build`
4. Test locally with Skaffold: `skaffold dev`
5. Verify observability: Check logs, metrics, and traces in Grafana

## License

Apache License 2.0 - See LICENSE file for details

## Related Documentation

- [Observability Stack Documentation](../../kubernetes-manifests/observability/README.md)
- [Design Document](../../.kiro/specs/cartservice-typescript-rewrite/design.md)
- [Requirements Document](../../.kiro/specs/cartservice-typescript-rewrite/requirements.md)
- [Implementation Tasks](../../.kiro/specs/cartservice-typescript-rewrite/tasks.md)
- [Online Boutique Documentation](../../docs/)
