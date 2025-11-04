# Design Document: TypeScript Cart Service

## Overview

The TypeScript Cart Service is a gRPC-based microservice that manages shopping cart operations for the Online Boutique application. It replaces the existing .NET implementation with a TypeScript version that prioritizes maintainability, pragmatism, and local-first development.

The service implements three core operations:
- **AddItem**: Add products to a user's cart or increment quantities
- **GetCart**: Retrieve a user's complete shopping cart
- **EmptyCart**: Clear all items from a user's cart

The service supports two storage backends (Redis and in-memory) and includes OpenTelemetry instrumentation for observability with Grafana. The design follows clean architecture principles with minimal abstractions, focusing on simplicity and effectiveness.

## Architecture

### High-Level Architecture

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
│  │  - Trace propagation                               │ │
│  │  - Metrics collection                              │ │
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
    ┌─────▼─────┐      ┌────▼────┐
    │   Redis   │      │  Memory │
    │  (External)│      │ (Local) │
    └───────────┘      └─────────┘
```

### Technology Stack

- **Runtime**: Node.js (LTS version)
- **Language**: TypeScript 5.x
- **gRPC Framework**: @grpc/grpc-js
- **Protobuf**: @grpc/proto-loader
- **Redis Client**: ioredis
- **Observability**: @opentelemetry/sdk-node, @opentelemetry/instrumentation-grpc
- **Testing**: Jest
- **Build**: TypeScript compiler (tsc)
- **Container**: Node.js Alpine-based Docker image

### Directory Structure

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
│   ├── models/
│   │   └── cart.ts              # Cart domain models
│   ├── telemetry/
│   │   └── instrumentation.ts   # OpenTelemetry setup
│   └── utils/
│       ├── config.ts            # Configuration management
│       └── logger.ts            # Logging utility
├── proto/
│   └── demo.proto               # Protobuf definitions (copied)
├── tests/
│   ├── handlers/
│   │   └── cart-handler.test.ts
│   └── storage/
│       ├── redis-store.test.ts
│       └── memory-store.test.ts
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

## Components and Interfaces

### 1. gRPC Server (server.ts)

**Responsibility**: Initialize and configure the gRPC server with all services and middleware.

**Key Functions**:
- Load protobuf definitions using @grpc/proto-loader
- Register CartService and HealthService implementations
- Configure OpenTelemetry instrumentation
- Bind server to port 7070
- Handle graceful shutdown

**Configuration**:
- Port: 7070 (from environment or default)
- Max message size: 4MB
- Keepalive settings for connection management

### 2. Cart Handler (handlers/cart-handler.ts)

**Responsibility**: Implement gRPC service methods for cart operations.

**Interface**:
```typescript
interface ICartServiceHandlers {
  addItem(call: ServerUnaryCall<AddItemRequest, Empty>, callback: sendUnaryData<Empty>): void;
  getCart(call: ServerUnaryCall<GetCartRequest, Cart>, callback: sendUnaryData<Cart>): void;
  emptyCart(call: ServerUnaryCall<EmptyCartRequest, Empty>, callback: sendUnaryData<Empty>): void;
}
```

**Implementation Details**:
- **addItem**: 
  - Validate userId and item (productId, quantity > 0)
  - Retrieve existing cart from storage
  - Merge new item with existing items (increment quantity if product exists)
  - Persist updated cart
  - Return Empty response or error
  
- **getCart**:
  - Validate userId
  - Retrieve cart from storage
  - Return cart or empty cart if not found
  - Handle storage errors with FAILED_PRECONDITION status
  
- **emptyCart**:
  - Validate userId
  - Clear cart in storage
  - Return Empty response or error

**Error Handling**:
- Invalid input: INVALID_ARGUMENT status
- Storage failures: FAILED_PRECONDITION status with descriptive message
- Unexpected errors: INTERNAL status with sanitized message

### 3. Health Handler (handlers/health-handler.ts)

**Responsibility**: Implement gRPC health check protocol.

**Interface**:
```typescript
interface IHealthServiceHandlers {
  check(call: ServerUnaryCall<HealthCheckRequest, HealthCheckResponse>, callback: sendUnaryData<HealthCheckResponse>): void;
}
```

**Implementation**:
- Return SERVING status when service is operational
- Optionally check storage backend connectivity
- Support Kubernetes readiness and liveness probes

### 4. Storage Abstraction (storage/cart-store.ts)

**Responsibility**: Define storage interface for cart operations.

**Interface**:
```typescript
interface ICartStore {
  addItem(userId: string, productId: string, quantity: number): Promise<void>;
  getCart(userId: string): Promise<Cart>;
  emptyCart(userId: string): Promise<void>;
  ping(): Promise<boolean>;
}

interface Cart {
  userId: string;
  items: CartItem[];
}

interface CartItem {
  productId: string;
  quantity: number;
}
```

**Design Rationale**:
- Simple interface with clear responsibilities
- Async operations for I/O-bound storage
- Ping method for health checks
- No unnecessary abstraction layers

### 5. Redis Store (storage/redis-store.ts)

**Responsibility**: Implement cart storage using Redis.

**Implementation Details**:
- Use ioredis client with connection pooling
- Serialize carts as Protobuf binary (for compatibility with .NET version)
- Key format: `cart:{userId}`
- Connection configuration from REDIS_ADDR environment variable
- Automatic reconnection with exponential backoff
- Error handling with descriptive messages

**Operations**:
- **addItem**: GET cart → deserialize → merge item → serialize → SET cart
- **getCart**: GET cart → deserialize → return (or empty cart if not found)
- **emptyCart**: SET cart to empty serialized cart
- **ping**: PING command to check connectivity

### 6. Memory Store (storage/memory-store.ts)

**Responsibility**: Implement cart storage using in-memory Map.

**Implementation Details**:
- Use Map<string, Cart> for storage
- No serialization needed (direct object storage)
- Suitable for development and testing
- Data lost on service restart

**Operations**:
- **addItem**: Get cart from Map → merge item → store in Map
- **getCart**: Get cart from Map → return (or empty cart)
- **emptyCart**: Set empty cart in Map
- **ping**: Always returns true

### 7. Telemetry (telemetry/instrumentation.ts)

**Responsibility**: Configure OpenTelemetry for Grafana observability stack.

**Implementation**:
- Initialize NodeSDK with gRPC instrumentation
- Configure trace exporter (OTLP)
- Configure metrics exporter (OTLP)
- Add service name and version as resource attributes
- Instrument gRPC server and client calls
- Propagate trace context across service boundaries

**Metrics**:
- Request count by method
- Request duration histogram
- Error count by status code
- Storage operation latency

**Traces**:
- Span per gRPC method call
- Nested spans for storage operations
- Include userId and operation details as span attributes

### 8. Configuration (utils/config.ts)

**Responsibility**: Centralize configuration management.

**Configuration Options**:
```typescript
interface Config {
  port: number;              // Default: 7070
  redisAddr: string | null;  // From REDIS_ADDR env var
  logLevel: string;          // Default: 'info'
  serviceName: string;       // Default: 'cartservice-ts'
  serviceVersion: string;    // From package.json
  otelExporterEndpoint: string | null; // From OTEL_EXPORTER_OTLP_ENDPOINT
}
```

**Implementation**:
- Load from environment variables
- Provide sensible defaults
- Validate required configurations
- Export singleton config object

### 9. Logger (utils/logger.ts)

**Responsibility**: Provide structured logging for Grafana observeability stack.

**Implementation**:
- Use console with structured JSON output
- Include timestamp, level, message, and context
- Support log levels: debug, info, warn, error
- Include trace ID in logs when available
- Simple implementation without heavy dependencies

## Data Models

### Cart Protobuf Message

```protobuf
message Cart {
    string user_id = 1;
    repeated CartItem items = 2;
}

message CartItem {
    string product_id = 1;
    int32 quantity = 2;
}
```

### TypeScript Domain Model

```typescript
interface Cart {
  userId: string;
  items: CartItem[];
}

interface CartItem {
  productId: string;
  quantity: number;
}
```

**Serialization**:
- Redis: Store as Protobuf binary for compatibility with .NET version
- Memory: Store as native TypeScript objects
- gRPC: Automatic serialization/deserialization by @grpc/grpc-js

## Error Handling

### Error Categories

1. **Validation Errors** (INVALID_ARGUMENT)
   - Missing userId
   - Missing productId
   - Invalid quantity (≤ 0)
   
2. **Storage Errors** (FAILED_PRECONDITION)
   - Redis connection failure
   - Redis operation timeout
   - Serialization/deserialization errors
   
3. **Internal Errors** (INTERNAL)
   - Unexpected exceptions
   - Programming errors

### Error Response Format

```typescript
{
  code: grpc.status.FAILED_PRECONDITION,
  message: "Can't access cart storage: Connection refused",
  details: [] // Optional additional details
}
```

### Error Handling Strategy

- Catch errors at handler level
- Log errors with context (userId, operation, error details)
- Return appropriate gRPC status codes
- Include descriptive error messages
- Avoid exposing internal implementation details
- Emit error metrics for monitoring

## Testing Strategy

### Unit Tests

**Cart Handler Tests** (handlers/cart-handler.test.ts):
- Test addItem with new product
- Test addItem with existing product (quantity increment)
- Test getCart with existing cart
- Test getCart with non-existent cart (returns empty)
- Test emptyCart
- Test error handling for invalid inputs
- Test error handling for storage failures

**Redis Store Tests** (storage/redis-store.test.ts):
- Test addItem creates new cart
- Test addItem updates existing cart
- Test getCart retrieves cart
- Test getCart returns empty for non-existent user
- Test emptyCart clears cart
- Test ping checks connectivity
- Test error handling for connection failures

**Memory Store Tests** (storage/memory-store.test.ts):
- Test addItem creates new cart
- Test addItem updates existing cart
- Test getCart retrieves cart
- Test getCart returns empty for non-existent user
- Test emptyCart clears cart
- Test ping always succeeds

### Integration Tests

**End-to-End gRPC Tests**:
- Start test server with memory store
- Test complete AddItem → GetCart → EmptyCart flow
- Test concurrent requests
- Test health check endpoint
- Verify OpenTelemetry spans are created

### Test Approach

- Use Jest as test framework
- Mock Redis client for unit tests
- Use real in-memory store for integration tests
- Focus on business logic and edge cases
- Avoid over-mocking (test real behavior when possible)
- Keep tests simple and readable
- Aim for 80%+ code coverage on core logic

### Test Execution

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- cart-handler.test.ts

# Run in watch mode
npm test -- --watch
```

## Deployment

### Docker Container

**Dockerfile Strategy**:
- Multi-stage build for smaller image size
- Stage 1: Build TypeScript to JavaScript
- Stage 2: Production image with only runtime dependencies
- Base image: node:20-alpine
- Non-root user for security
- Health check using grpc-health-probe

**Dockerfile**:
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER node
EXPOSE 7070
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
```

### Kubernetes Deployment

**Deployment Manifest** (kubernetes-manifests/cartservice-ts.yaml):
- Deployment with 2 replicas for availability
- Service account: cartservice-ts
- Resource limits: 300m CPU, 128Mi memory
- Resource requests: 200m CPU, 64Mi memory
- Security context: non-root, read-only filesystem
- Readiness probe: gRPC health check on port 7070
- Liveness probe: gRPC health check on port 7070
- Environment variables: REDIS_ADDR, OTEL_EXPORTER_OTLP_ENDPOINT

**Service Manifest**:
- ClusterIP service
- Port 7070 (gRPC)
- Selector: app=cartservice-ts

**Deployment Strategy**:
- Rolling update with maxUnavailable=1, maxSurge=1
- Deploy as replacement for .NET version

### Skaffold Integration

**Update skaffold.yaml**:
```yaml
- image: cartservice-ts
  context: src/cartservice-ts
  docker:
    dockerfile: Dockerfile
```

**Development Workflow**:
```bash
# Build and deploy to local Kubernetes
skaffold dev

# Deploy only cartservice-ts
skaffold dev --module=cartservice-ts

# Build images
skaffold build
```

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| PORT | gRPC server port | 7070 | No |
| REDIS_ADDR | Redis connection string (host:port) | null | No |
| LOG_LEVEL | Logging level (debug, info, warn, error) | info | No |
| OTEL_EXPORTER_OTLP_ENDPOINT | OpenTelemetry collector endpoint | null | No |
| SERVICE_NAME | Service name for telemetry | cartservice-ts | No |



## Observability

### OpenTelemetry Integration

**Traces**:
- Automatic gRPC instrumentation
- Custom spans for storage operations
- Trace context propagation
- Span attributes: userId, operation, productId, quantity

**Metrics**:
- `cart_requests_total`: Counter of requests by method and status
- `cart_request_duration_seconds`: Histogram of request latency
- `cart_storage_operations_total`: Counter of storage operations
- `cart_storage_duration_seconds`: Histogram of storage operation latency
- `cart_items_total`: Gauge of total items across all carts (optional)

**Logs**:
- Structured JSON logs
- Include trace ID for correlation
- Log levels: debug, info, warn, error
- Log all errors with context

### Grafana Dashboards

**Recommended Dashboards**:
1. **Service Overview**
   - Request rate (RPS)
   - Error rate
   - P50, P95, P99 latency
   - Active connections
   
2. **Storage Performance**
   - Redis operation latency
   - Redis connection pool stats
   - Cache hit/miss rates (if implemented)
   
3. **Business Metrics**
   - Carts created per minute
   - Items added per minute
   - Average items per cart
   - Cart operations by user

### Monitoring and Alerts

**Key Alerts**:
- Error rate > 5% for 5 minutes
- P99 latency > 500ms for 5 minutes
- Redis connection failures
- Pod restarts > 3 in 10 minutes
- Memory usage > 90%

## Security Considerations

- Run container as non-root user
- Read-only root filesystem
- Drop all Linux capabilities
- No privilege escalation
- Network policies to restrict traffic
- Validate all user inputs
- Sanitize error messages (no sensitive data)
- Use secure Redis connection (TLS in production)
- Regular dependency updates for vulnerabilities

## Performance Considerations

- Connection pooling for Redis
- Efficient Protobuf serialization
- Minimal memory allocations
- Async I/O for all storage operations
- Graceful degradation when Redis is slow
- Request timeout configuration
- Resource limits to prevent resource exhaustion

## Future Enhancements (Out of Scope)

- Cart expiration (TTL)
- Cart persistence to database
- Cart sharing between users
- Cart item validation against product catalog
- Cart recommendations
- A/B testing framework
- Advanced caching strategies
