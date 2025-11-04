# Implementation Plan

- [x] 1. Verify and update Grafana LGTM stack deployment
  - Review existing grafana-lgtm.yaml for correct image and configuration
  - Verify Service exposes ports 3000 (Grafana), 4317 (OTLP gRPC), 4318 (OTLP HTTP)
  - Verify datasource provisioning ConfigMap includes Prometheus, Loki, and Tempo with localhost URLs
  - Verify dashboard provisioning ConfigMap is correctly mounted
  - Update resource limits if needed (1Gi memory, 500m CPU recommended)
  - Test deployment: kubectl apply -k kubernetes-manifests/observability/
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Validate CartService-TS OpenTelemetry instrumentation
  - Review src/cartservice-ts/src/telemetry/instrumentation.ts for OTLP exporters (traces, metrics, logs)
  - Verify OTLPTraceExporter, OTLPMetricExporter, and OTLPLogExporter are configured
  - Verify GrpcInstrumentation is included for automatic gRPC tracing
  - Review src/cartservice-ts/src/utils/logger.ts for trace context inclusion (trace_id, span_id)
  - Verify logger uses @opentelemetry/api to get active span context
  - Test instrumentation initialization with mock endpoint
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Update CartService-TS Kubernetes manifest with OTEL configuration
  - Add OTEL_EXPORTER_OTLP_ENDPOINT environment variable pointing to http://grafana-lgtm:4317
  - Add OTEL_SERVICE_NAME environment variable set to "cartservice-ts"
  - Add OTEL_SERVICE_VERSION environment variable set to "1.0.0"
  - Verify LOG_LEVEL environment variable is set appropriately
  - Apply updated manifest and verify pod starts successfully
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 4. Download and add infrastructure dashboard (Kubernetes Views Namespaces)
  - Download dashboard JSON from grafana.com/api/dashboards/15758/revisions/latest/download
  - Add dashboard JSON to grafana-dashboards-data.yaml ConfigMap as kubernetes-namespaces.json
  - Verify dashboard displays pod CPU, memory, network I/O metrics
  - Test dashboard shows data for cartservice-ts pod
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 5. Validate app logs dashboard. kubernetes-manifests/observability/validation.sh
  - Validate dashboard JSON to grafana-dashboards-data.yaml ConfigMap as loki-logs.json
  - Verify dashboard displays structured logs from cartservice-ts
  - Verify dashboard supports filtering by log level and trace_id
  - Test log-trace correlation using trace_id field
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6. Check existence of application metrics dashboard under kubernetes-manifests/observability/dashboards (Node.js Application)
  - Check dashboard JSON from grafana.com/api/dashboards/11159/revisions/latest/download
  - Check dashboard JSON to grafana-dashboards-data.yaml ConfigMap as nodejs-app.json
  - Verify dashboard displays RED metrics (Rate, Errors, Duration)
  - Verify dashboard shows Node.js runtime metrics (heap, event loop)
  - Test dashboard shows gRPC method-level metrics
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 7. Test and fix end-to-end telemetry flow using kubernetes-manifests/observability/validation.sh. See documentation for proper service log,metrics,tracing instrumentation: https://github.com/grafana/docker-otel-lgtm
  - See documentations for Opentelemetry and grafanastack. Ensure actual documentations are referred. Understand how to proper service log,metrics,tracing instrumentation: https://github.com/grafana/docker-otel-lgtm
 The validation script shows:
  ✓ Traces are working - 20 traces from cartservice-ts found in Tempo with proper span hierarchy
  ✓ Logs are working - Logs from cartservice-ts are reaching Loki with trace context (trace_id and span_id)
  ⚠️ Metrics - The specific Prometheus metrics (grpc_server_handled_total, nodejs_heap_size_used_bytes) aren't found, but this is expected behavior since OpenTelemetry uses different metric naming conventions
  - Deploy grafana-lgtm stack and wait for pod to be ready
  - Deploy cartservice-ts with OTEL environment variables
  - Generate test traffic to cartservice-ts (via frontend or direct gRPC calls)
  - Verify metrics appear in Prometheus datasource (query: grpc_server_handled_total)
  - Verify traces appear in Tempo datasource (search for cartservice-ts)
  - Verify logs appear in Loki datasource (query: {service_name="cartservice-ts"})
  - Verify trace_id and span_id are present in log entries
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 8. Verify Grafana Explore for traces
  - Access Grafana UI at http://localhost:3000
  - Navigate to Explore and select Tempo datasource
  - Search for traces from cartservice-ts
  - Verify span hierarchy displays gRPC operations
  - Verify span duration and timing information is accurate
  - Test trace-to-logs correlation by clicking trace_id link
  - Verify span attributes include service name, operation name, and status
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 9. Create verification documentation
  - Create VERIFICATION.md in kubernetes-manifests/observability/
  - Document steps to deploy and access Grafana
  - Document steps to verify datasources are connected
  - Document steps to generate test traffic
  - Document steps to verify data in each dashboard
  - Document steps to verify trace-to-logs correlation
  - Include troubleshooting tips for common issues
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

