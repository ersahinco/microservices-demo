# Requirements Document

## Introduction

This document specifies the requirements for implementing a Grafana-based observability stack for the Online Boutique microservices application. The system will provide comprehensive monitoring, logging, and tracing capabilities using OpenTelemetry and the Grafana LGTM stack (Loki, Grafana, Tempo, Mimir) based on the grafana/otel-lgtm image. The implementation focuses exclusively on cartservice-ts instrumentation, with infrastructure and application-level dashboards for logs, metrics, and traces.

## Glossary

- **LGTM Stack**: Grafana's observability stack consisting of Loki (logs), Grafana (visualization), Tempo (traces), and Mimir/Prometheus (metrics)
- **Grafana LGTM Image**: The grafana/otel-lgtm Docker image that bundles all LGTM components with a built-in OpenTelemetry Collector
- **OpenTelemetry Collector**: A vendor-agnostic service that receives, processes, and exports telemetry data (built into the LGTM image)
- **CartService-TS**: The TypeScript-based cart service that manages shopping cart operations
- **Telemetry Data**: Observability data including metrics, logs, and traces
- **Local Kubernetes**: Kubernetes cluster running locally (e.g., minikube, kind, Docker Desktop)
- **Infrastructure Dashboard**: Grafana dashboard showing Kubernetes cluster and pod-level metrics
- **Application Dashboard**: Grafana dashboard showing application-level metrics, logs, and traces for cartservice-ts

## Requirements

### Requirement 1

**User Story:** As a developer, I want to deploy the Grafana LGTM observability stack to my local Kubernetes cluster, so that I can monitor my microservices without requiring cloud infrastructure.

#### Acceptance Criteria

1. THE Observability_Stack SHALL deploy using the grafana/otel-lgtm Docker image to the local Kubernetes cluster
2. THE Observability_Stack SHALL include all LGTM components (Loki, Grafana, Tempo, Prometheus) in a single container
3. THE Observability_Stack SHALL include a built-in OpenTelemetry Collector with OTLP receivers
4. THE Observability_Stack SHALL persist configuration through Kubernetes manifests in kubernetes-manifests/observability
5. WHEN deployed, THE Observability_Stack SHALL expose Grafana UI on port 3000 accessible from the local machine

### Requirement 2

**User Story:** As a developer, I want the built-in OpenTelemetry Collector to receive telemetry data from cartservice-ts, so that metrics, logs, and traces are centralized for analysis.

#### Acceptance Criteria

1. THE Built_In_Collector SHALL accept OTLP protocol data over gRPC on port 4317
2. THE Built_In_Collector SHALL accept OTLP protocol data over HTTP on port 4318
3. THE Built_In_Collector SHALL export metrics to Prometheus within the LGTM container
4. THE Built_In_Collector SHALL export logs to Loki within the LGTM container
5. THE Built_In_Collector SHALL export traces to Tempo within the LGTM container

### Requirement 3

**User Story:** As a developer, I want the CartService-TS to send telemetry data to the Grafana LGTM built-in collector, so that I can observe its behavior and performance.

#### Acceptance Criteria

1. THE CartService_TS SHALL instrument its code using OpenTelemetry SDK for Node.js
2. THE CartService_TS SHALL export metrics including request counts, error rates, and latency to grafana-lgtm:4317
3. THE CartService_TS SHALL export distributed traces for all gRPC operations to grafana-lgtm:4317
4. THE CartService_TS SHALL export structured logs with trace context correlation (trace_id, span_id) to grafana-lgtm:4317
5. THE CartService_TS SHALL use OTLP gRPC exporters compatible with the grafana/otel-lgtm collector

### Requirement 4

**User Story:** As a developer, I want to view infrastructure-level metrics in Grafana dashboards, so that I can monitor Kubernetes cluster health and resource usage.

#### Acceptance Criteria

1. THE Grafana_Instance SHALL include a Kubernetes namespace monitoring dashboard
2. THE Infrastructure_Dashboard SHALL display pod CPU and memory usage metrics
3. THE Infrastructure_Dashboard SHALL display container restart counts and status
4. THE Infrastructure_Dashboard SHALL display network I/O metrics per pod
5. THE Infrastructure_Dashboard SHALL use the Kubernetes Views Namespaces dashboard (ID: 15758) or equivalent

### Requirement 5

**User Story:** As a developer, I want to view application-level logs in Grafana dashboards, so that I can troubleshoot issues and correlate logs with traces.

#### Acceptance Criteria

1. THE Grafana_Instance SHALL include a Loki logs dashboard for cartservice-ts
2. THE Logs_Dashboard SHALL display structured JSON logs from cartservice-ts
3. THE Logs_Dashboard SHALL support filtering by log level, trace_id, and span_id
4. THE Logs_Dashboard SHALL display trace context (trace_id, span_id) for each log entry
5. THE Logs_Dashboard SHALL use the Loki Stack Monitoring dashboard (ID: 14055) or equivalent

### Requirement 6

**User Story:** As a developer, I want to view application-level metrics in Grafana dashboards, so that I can monitor cartservice-ts performance and health.

#### Acceptance Criteria

1. THE Grafana_Instance SHALL include a Node.js application metrics dashboard for cartservice-ts
2. THE Application_Dashboard SHALL display request rate, error rate, and latency (RED metrics)
3. THE Application_Dashboard SHALL display Node.js runtime metrics (heap usage, event loop lag)
4. THE Application_Dashboard SHALL display gRPC method-level metrics
5. THE Application_Dashboard SHALL use the Node.js Application Dashboard (ID: 11159) or equivalent

### Requirement 7

**User Story:** As a developer, I want to view distributed traces in Grafana dashboards, so that I can understand request flow and identify performance bottlenecks.

#### Acceptance Criteria

1. THE Grafana_Instance SHALL provide access to Tempo trace data through the Explore interface
2. THE Trace_View SHALL display span hierarchy for cartservice-ts gRPC operations
3. THE Trace_View SHALL display span duration and timing information
4. THE Trace_View SHALL support trace-to-logs correlation using trace_id
5. THE Trace_View SHALL display span attributes including service name, operation name, and status

### Requirement 8

**User Story:** As a developer, I want to configure cartservice-ts through environment variables, so that I can enable or adjust observability without code changes.

#### Acceptance Criteria

1. THE CartService_Configuration SHALL support OTEL_EXPORTER_OTLP_ENDPOINT environment variable pointing to grafana-lgtm:4317
2. THE CartService_Configuration SHALL support OTEL_SERVICE_NAME environment variable for service identification
3. THE CartService_Configuration SHALL use sensible defaults when environment variables are not provided
4. THE Kubernetes_Manifests SHALL define OTEL environment variables for cartservice-ts
5. THE CartService_Configuration SHALL gracefully handle collector unavailability without crashing

### Requirement 9

**User Story:** As a developer, I want the observability stack to follow clean architecture principles, so that the implementation is maintainable and not over-engineered.

#### Acceptance Criteria

1. THE Instrumentation_Code SHALL separate telemetry concerns from business logic in cartservice-ts
2. THE Instrumentation_Code SHALL use minimal abstractions appropriate for the service complexity
3. THE Configuration_Management SHALL use simple, direct approaches without unnecessary layers
4. THE Implementation SHALL avoid premature optimization and complex patterns
5. THE Kubernetes_Manifests SHALL be organized clearly in kubernetes-manifests/observability directory

### Requirement 10

**User Story:** As a developer, I want to verify the observability stack is working correctly, so that I can trust the telemetry data I'm viewing.

#### Acceptance Criteria

1. THE Verification_Process SHALL include steps to confirm the grafana-lgtm pod is running
2. THE Verification_Process SHALL include steps to generate test traffic to cartservice-ts
3. THE Verification_Process SHALL include steps to verify metrics appear in Prometheus/Grafana
4. THE Verification_Process SHALL include steps to verify traces appear in Tempo/Grafana
5. THE Verification_Process SHALL include steps to verify logs appear in Loki/Grafana with trace correlation
