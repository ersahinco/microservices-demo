# Implementation Plan

- [x] 1. Set up project structure and dependencies
  - Create src/cartservice-ts directory with TypeScript project structure
  - Initialize package.json with dependencies (@grpc/grpc-js, @grpc/proto-loader, ioredis, @opentelemetry packages)
  - Configure tsconfig.json for Node.js target with strict type checking
  - Copy proto/demo.proto to src/cartservice-ts/proto/
  - Create directory structure: src/, tests/, proto/
  - _Requirements: 7.1, 7.2, 8.1_

- [x] 2. Implement configuration and utilities
  - [x] 2.1 Create utils/config.ts for environment variable management
    - Load PORT, REDIS_ADDR, LOG_LEVEL, OTEL_EXPORTER_OTLP_ENDPOINT from environment
    - Provide default values (port: 7070, logLevel: 'info', serviceName: 'cartservice-ts')
    - Export singleton config object
    - _Requirements: 8.2_
  
  - [x] 2.2 Create utils/logger.ts for structured logging
    - Implement simple logger with JSON output
    - Support log levels: debug, info, warn, error
    - Include timestamp and context in log entries
    - _Requirements: 7.5_

- [x] 3. Implement storage abstraction layer
  - [x] 3.1 Create storage/cart-store.ts with ICartStore interface
    - Define ICartStore interface with addItem, getCart, emptyCart, ping methods
    - Define Cart and CartItem TypeScript interfaces
    - _Requirements: 4.3, 7.2_
  
  - [x] 3.2 Implement storage/memory-store.ts
    - Use Map<string, Cart> for in-memory storage
    - Implement addItem: retrieve cart, merge items, store cart
    - Implement getCart: return cart or empty cart if not found
    - Implement emptyCart: set empty cart in Map
    - Implement ping: always return true
    - _Requirements: 4.2, 1.1, 1.2, 1.3, 2.1, 2.2, 3.1, 3.2_
  
  - [x] 3.3 Implement storage/redis-store.ts
    - Initialize ioredis client with connection string from config
    - Implement Protobuf serialization/deserialization for Cart messages
    - Implement addItem: GET cart → deserialize → merge → serialize → SET
    - Implement getCart: GET cart → deserialize → return (or empty)
    - Implement emptyCart: SET empty serialized cart
    - Implement ping: execute Redis PING command
    - Handle connection errors with descriptive messages
    - _Requirements: 4.1, 4.4, 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.4, 3.1, 3.3_
  
  - [ ]* 3.4 Write unit tests for storage implementations
    - Test memory-store: addItem, getCart, emptyCart operations
    - Test redis-store with mocked Redis client
    - Test error handling for storage failures
    - _Requirements: 9.2_

- [x] 4. Implement gRPC handlers
  - [x] 4.1 Create handlers/cart-handler.ts
    - Implement addItem handler: validate input, call storage.addItem, return Empty
    - Implement getCart handler: validate userId, call storage.getCart, return Cart
    - Implement emptyCart handler: validate userId, call storage.emptyCart, return Empty
    - Add error handling: INVALID_ARGUMENT for validation, FAILED_PRECONDITION for storage errors
    - Log all operations with userId and operation details
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 7.4_
  
  - [x] 4.2 Create handlers/health-handler.ts
    - Implement gRPC health check protocol
    - Return SERVING status when operational
    - Optionally check storage backend connectivity using ping()
    - _Requirements: 5.1, 5.2, 5.4_
  
  - [ ]* 4.3 Write unit tests for handlers
    - Test cart-handler with mocked storage: addItem, getCart, emptyCart
    - Test validation error handling
    - Test storage error handling
    - Test health-handler returns SERVING status
    - _Requirements: 9.1_

- [x] 5. Implement OpenTelemetry instrumentation for Grafana observeability stack
  - [x] 5.1 Create telemetry/instrumentation.ts
    - Initialize NodeSDK with gRPC instrumentation
    - Configure OTLP exporter (or console for development)
    - Add service name and version as resource attributes
    - Export initialization function
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 5.2 Add custom metrics for cart operations
    - Create counter for cart_requests_total (by method and status)
    - Create histogram for cart_request_duration_seconds
    - Create counter for cart_storage_operations_total
    - Instrument handlers to record metrics
    - _Requirements: 6.3_

- [x] 6. Implement gRPC server
  - [x] 6.1 Create server.ts
    - Load proto definitions using @grpc/proto-loader
    - Create gRPC server instance
    - Register CartService with cart-handler implementation
    - Register HealthService with health-handler implementation
    - Configure server options (max message size, keepalive)
    - Bind server to port from config
    - Implement graceful shutdown handler
    - _Requirements: 5.3, 7.1_
  
  - [x] 6.2 Create index.ts as application entry point
    - Initialize OpenTelemetry instrumentation
    - Load configuration
    - Initialize storage backend (Redis or Memory based on REDIS_ADDR)
    - Start gRPC server
    - Log startup information
    - Handle process signals for graceful shutdown
    - _Requirements: 4.1, 4.2, 7.1_

- [x] 7. Create Docker container
  - [x] 7.1 Create Dockerfile with multi-stage build
    - Build stage: install dependencies, compile TypeScript
    - Production stage: copy built files, use node:20-alpine base
    - Run as non-root user (node)
    - Expose port 7070
    - Use tini as init system
    - _Requirements: 8.1, 8.3_
  
  - [x] 7.2 Create .dockerignore file
    - Exclude node_modules, tests, .git, documentation
    - _Requirements: 8.1_
  
  - [x] 7.3 Add build scripts to package.json
    - Add "build" script: tsc
    - Add "start" script: node dist/index.js
    - Add "dev" script: ts-node src/index.ts
    - Add "test" script: jest
    - _Requirements: 8.1_

- [x] 8. Create Kubernetes manifests
  - [x] 8.1 Create kubernetes-manifests/cartservice-ts.yaml
    - Define Deployment with 2 replicas
    - Configure resource limits (300m CPU, 128Mi memory) and requests (200m CPU, 64Mi memory)
    - Set environment variables: REDIS_ADDR, OTEL_EXPORTER_OTLP_ENDPOINT
    - Configure security context: non-root, read-only filesystem, drop capabilities
    - Add readiness probe: gRPC health check on port 7070
    - Add liveness probe: gRPC health check on port 7070
    - Define Service: ClusterIP on port 7070
    - Create ServiceAccount: cartservice-ts
    - _Requirements: 8.4, 8.5, 10.1_
  
  - [x] 8.2 Update skaffold.yaml
    - Add cartservice-ts artifact with context src/cartservice-ts
    - Configure Docker build for linux/amd64 and linux/arm64 platforms
    - _Requirements: 8.2, 8.3, 8.4_

- [ ] 9. Integration and end-to-end testing
  - [ ]* 9.1 Create integration tests
    - Start test gRPC server with memory store
    - Test complete flow: AddItem → GetCart → EmptyCart
    - Test concurrent requests
    - Verify health check endpoint
    - _Requirements: 9.5_
  
  - [ ]* 9.2 Verify OpenTelemetry traces
    - Start service with console exporter
    - Make test requests
    - Verify spans are created for gRPC calls and storage operations
    - _Requirements: 6.1, 6.4_

- [x] 10. Documentation and deployment preparation
  - [x] 10.1 Create README.md for cartservice-ts
    - Document service purpose and architecture
    - List environment variables and configuration
    - Provide local development instructions
    - Document build and deployment process
    - Include testing instructions
    - _Requirements: 7.5, 10.2_
  
  - [x] 10.2 Verify deployment with Skaffold
    - Run skaffold dev to build and deploy locally
    - Test service connectivity from other services
    - Verify Redis connection (if configured)
    - Check logs for errors
    - Verify metrics are exported
    - _Requirements: 8.4, 10.3_
