# Requirements Document

## Introduction

This document specifies the requirements for rewriting the cart service from .NET/C# to TypeScript. The TypeScript Cart Service will be a gRPC-based microservice that manages shopping cart operations for the Online Boutique application. The service will maintain feature parity with the existing .NET implementation while prioritizing maintainability, pragmatism, and local-first development. The new service will be deployed alongside the existing .NET version to enable a smooth transition.

## Glossary

- **Cart Service**: The microservice responsible for managing shopping cart operations (add, get, empty)
- **gRPC**: High-performance RPC framework used for inter-service communication
- **Redis**: In-memory data store used as the primary cart storage backend
- **In-Memory Store**: Fallback storage mechanism when Redis is unavailable
- **Protobuf**: Protocol Buffers, the interface definition language for gRPC services
- **Skaffold**: Tool for continuous development and deployment to Kubernetes
- **OpenTelemetry**: Observability framework for collecting traces, metrics, and logs
- **Health Check**: gRPC endpoint that reports service availability status

## Requirements

### Requirement 1

**User Story:** As a frontend service, I want to add items to a user's shopping cart, so that customers can build their order incrementally

#### Acceptance Criteria

1. WHEN the Cart Service receives an AddItem gRPC request with a valid user ID, product ID, and quantity, THE Cart Service SHALL store the item in the user's cart
2. WHEN the Cart Service receives an AddItem request for a product already in the cart, THE Cart Service SHALL increment the existing quantity by the requested amount
3. WHEN the Cart Service receives an AddItem request for a new product, THE Cart Service SHALL create a new cart item with the specified quantity
4. IF the Cart Service cannot access the storage backend during AddItem, THEN THE Cart Service SHALL return a gRPC FAILED_PRECONDITION status with an error message
5. THE Cart Service SHALL persist cart data to the configured storage backend (Redis or in-memory)

### Requirement 2

**User Story:** As a frontend service, I want to retrieve a user's complete shopping cart, so that I can display their selected items

#### Acceptance Criteria

1. WHEN the Cart Service receives a GetCart gRPC request with a valid user ID, THE Cart Service SHALL return the complete cart with all items and quantities
2. WHEN the Cart Service receives a GetCart request for a user with no existing cart, THE Cart Service SHALL return an empty cart object
3. THE Cart Service SHALL include the user ID in the returned cart response
4. IF the Cart Service cannot access the storage backend during GetCart, THEN THE Cart Service SHALL return a gRPC FAILED_PRECONDITION status with an error message

### Requirement 3

**User Story:** As a checkout service, I want to empty a user's shopping cart after order completion, so that the cart is cleared for future purchases

#### Acceptance Criteria

1. WHEN the Cart Service receives an EmptyCart gRPC request with a valid user ID, THE Cart Service SHALL remove all items from the user's cart
2. THE Cart Service SHALL persist the empty cart state to the storage backend
3. IF the Cart Service cannot access the storage backend during EmptyCart, THEN THE Cart Service SHALL return a gRPC FAILED_PRECONDITION status with an error message

### Requirement 4

**User Story:** As a platform operator, I want the cart service to support multiple storage backends, so that I can choose between Redis and in-memory storage based on deployment needs

#### Acceptance Criteria

1. WHERE the REDIS_ADDR environment variable is configured, THE Cart Service SHALL use Redis as the storage backend
2. WHERE the REDIS_ADDR environment variable is not configured, THE Cart Service SHALL use an in-memory storage backend
3. THE Cart Service SHALL implement a storage abstraction layer that allows switching between backends without changing business logic
4. THE Cart Service SHALL serialize cart data using Protobuf format for storage

### Requirement 5

**User Story:** As a platform operator, I want the cart service to expose health check endpoints, so that Kubernetes can monitor service availability

#### Acceptance Criteria

1. THE Cart Service SHALL implement the gRPC health check protocol
2. THE Cart Service SHALL respond to health check requests with a SERVING status when operational
3. THE Cart Service SHALL listen on port 7070 for gRPC requests including health checks
4. THE Cart Service SHALL support both readiness and liveness probe checks

### Requirement 6

**User Story:** As a developer, I want the cart service to emit OpenTelemetry traces and metrics, so that I can monitor performance and debug issues using Grafana

#### Acceptance Criteria

1. THE Cart Service SHALL instrument gRPC handlers with OpenTelemetry tracing
2. THE Cart Service SHALL export traces in a format compatible with OpenTelemetry collectors
3. THE Cart Service SHALL emit metrics for request counts, latencies, and error rates
4. THE Cart Service SHALL propagate trace context from incoming requests to outgoing storage operations
5. THE Cart Service SHALL include service name and version in telemetry metadata

### Requirement 7

**User Story:** As a developer, I want the cart service to have a clean architecture with minimal abstractions, so that the codebase is maintainable and easy to understand

#### Acceptance Criteria

1. THE Cart Service SHALL organize code into logical layers (handlers, storage, models)
2. THE Cart Service SHALL avoid over-engineered patterns and unnecessary abstractions
3. THE Cart Service SHALL use TypeScript interfaces for type safety without excessive class hierarchies
4. THE Cart Service SHALL implement error handling that is simple and effective
5. THE Cart Service SHALL include inline documentation for complex logic

### Requirement 8

**User Story:** As a developer, I want the cart service to be containerized and deployable via Skaffold, so that I can develop and test locally with Kubernetes

#### Acceptance Criteria

1. THE Cart Service SHALL include a Dockerfile that builds a production-ready container image
2. THE Cart Service SHALL be configurable via environment variables for deployment flexibility
3. THE Cart Service SHALL support both linux/amd64 and linux/arm64 platforms
4. THE Cart Service SHALL integrate with the existing Skaffold configuration for local development
5. THE Cart Service SHALL include Kubernetes manifests for deployment, service, and service account resources

### Requirement 9

**User Story:** As a developer, I want the cart service to include focused tests for core functionality, so that I can verify correctness without over-testing

#### Acceptance Criteria

1. THE Cart Service SHALL include tests for gRPC handler logic (AddItem, GetCart, EmptyCart)
2. THE Cart Service SHALL include tests for storage layer operations
3. THE Cart Service SHALL use pragmatic test approaches that focus on business logic
4. THE Cart Service SHALL avoid excessive mocking in favor of testing real behavior
5. THE Cart Service SHALL include integration tests that verify end-to-end request handling

### Requirement 10

**User Story:** As a platform operator, I want the new TypeScript cart service to coexist with the .NET version, so that the original implementation remains available for reference

#### Acceptance Criteria

1. THE Cart Service SHALL be deployed in a separate directory (src/cartservice-ts)
2. THE Cart Service SHALL maintain the existing .NET service in src/cartservice for reference
3. THE Cart Service SHALL implement the same gRPC contract as the .NET version
4. THE Cart Service SHALL support the same configuration options (REDIS_ADDR) as the .NET version
