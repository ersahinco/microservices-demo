# Developer Workflow Guide

## Primary Workflow: Skaffold (Recommended)

Skaffold is the **primary tool** for build/deploy iteration. It handles automatic rebuilds, multi-platform support, continuous development, and includes the observability stack.

### Quick Start
```bash
# Continuous development (watches for changes, auto-rebuilds, port-forwards)
skaffold dev

# One-time build and deploy all services + observability
skaffold run

# Debug mode with breakpoint support
skaffold debug
```

### Why Skaffold?
- ✅ Automatic file watching and hot reload
- ✅ Only rebuilds services with changes (smart detection)
- ✅ Built-in git commit tagging
- ✅ Multi-platform builds (amd64/arm64)
- ✅ Integrated with Kustomize (includes observability stack)
- ✅ Automatic port forwarding (frontend:8080, cartservice:7070, grafana:3000)
- ✅ Log streaming from all services
- ✅ Fast incremental builds

### Skaffold Profiles
```bash
# Debug mode (enables debugging for cartservice)
skaffold debug

# Build on Google Cloud Build (no local Docker needed)
skaffold run -p gcb

# Enable network policies
skaffold run -p network-policies
```

### What Skaffold Deploys
- All application services (frontend, cartservice-ts, etc.)
- Observability stack (Grafana, Prometheus, Loki, Tempo, OpenTelemetry)
- Automatic port forwarding to localhost:
  - Frontend: http://localhost:8080
  - Cartservice: http://localhost:7070
  - Grafana: http://localhost:3000

## Secondary Workflow: dev.sh (Debugging Only)

Use `dev.sh` for debugging and troubleshooting tasks. Skaffold handles all build/deploy operations.

### Debugging & Monitoring
```bash
# View logs (alternative to skaffold dev's log streaming)
./scripts/dev.sh logs cartservice-ts

# Debug pod status and events
./scripts/dev.sh debug cartservice-ts

# Open shell in pod
./scripts/dev.sh shell cartservice-ts

# Restart deployment without rebuild
./scripts/dev.sh restart cartservice-ts
```

### Cleanup & Maintenance
```bash
# Clean up all failed/problematic pods
./scripts/dev.sh cleanup all

# Clean up specific service
./scripts/dev.sh cleanup cartservice-ts
```

### Manual Port Forwarding (Optional)
```bash
# Note: skaffold dev does this automatically
./scripts/dev.sh port-forward cartservice-ts  # localhost:7070
./scripts/dev.sh port-forward frontend        # localhost:8080
./scripts/dev.sh port-forward grafana-lgtm    # localhost:3000
```

## Image Tagging Strategy

Skaffold automatically tags images with git commit hashes:
- `<service>:f5697b27-dirty` - Git commit hash (traceable)
- Local builds also create `:latest` tag

```bash
# Check your images
docker images | grep cartservice-ts

# Output:
# cartservice-ts   f5697b27-dirty   bdc262d570a4   21 hours ago   199MB
# cartservice-ts   latest           bdc262d570a4   21 hours ago   199MB
```

## Release Workflow

```bash
# Build with semantic version
VERSION=v1.2.0 ./scripts/dev.sh deploy cartservice-ts

# Creates:
# - cartservice-ts:v1.2.0
# - cartservice-ts:latest
```

## Environment Variables

```bash
# Custom namespace
NAMESPACE=staging skaffold dev
NAMESPACE=staging ./scripts/dev.sh logs cartservice-ts
```

## Observability Stack

The observability stack (Grafana, OpenTelemetry, Prometheus, Loki, Tempo) is **included in Skaffold** and deployed automatically.

### Accessing Observability

```bash
# With skaffold dev running, Grafana is automatically available at:
# http://localhost:3000

# Or manually port forward:
./scripts/dev.sh port-forward grafana-lgtm  # localhost:3000
```

### Observability Components
- Grafana LGTM (Loki, Grafana, Tempo, Mimir)
- OpenTelemetry Collector
- Pre-configured dashboards
- Automatic metrics, logs, and traces collection

## Kubernetes Manifests

All manifests use:
- `image: <service>:latest` - References the latest build
- `imagePullPolicy: IfNotPresent` - Uses local images first

This ensures:
- ✅ Fast local development (no registry pulls)
- ✅ Reliable deployments (uses local builds)
- ✅ Traceable versions (git commit hash tags)

## Common Scenarios

### Scenario 1: Fresh Start (Development)
```bash
# Start continuous development mode
skaffold dev

# Skaffold will:
# - Build all services (only once initially)
# - Deploy to Kubernetes (including observability stack)
# - Watch for file changes
# - Auto-rebuild ONLY changed services
# - Auto-redeploy ONLY when changes detected
# - Stream logs from all pods
# - Port forward: frontend:8080, cartservice:7070, grafana:3000
```

### Scenario 2: Quick Iteration on One Service
```bash
# Use Skaffold (recommended)
skaffold dev  # Watches all services, only rebuilds what changed

# Edit code in src/cartservice-ts/
# Skaffold automatically detects changes and rebuilds only cartservice-ts
# Other services are NOT rebuilt or redeployed
```

### Scenario 3: Debugging Issues
```bash
# With skaffold dev running, logs are already streaming
# For additional debugging:

# Check pod status and recent events
./scripts/dev.sh debug cartservice-ts

# Access pod shell
./scripts/dev.sh shell cartservice-ts

# Clean up failed pods
./scripts/dev.sh cleanup all
```

### Scenario 4: Testing Frontend Locally
```bash
# Run Skaffold (port forwarding is automatic)
skaffold dev

# Open browser: http://localhost:8080 (frontend)
# Open browser: http://localhost:3000 (grafana)
```

### Scenario 5: One-Time Deploy (CI/CD Style)
```bash
# Build and deploy once (no watching)
skaffold run

# Or with specific profile
skaffold run -p gcb  # Build on Google Cloud Build
```

## Tips

1. **Use `skaffold dev` for active development** - Automatic rebuilds ONLY on file changes
2. **Skaffold is smart** - Only rebuilds/redeploys services with actual changes
3. **Use `skaffold run` for one-time deploys** - CI/CD style deployment
4. **Use `dev.sh` for debugging only** - Shell access, cleanup utilities
5. **Keep Skaffold running** - It handles all build/deploy iteration automatically
6. **Port forwarding is automatic** - Frontend, cartservice, and Grafana are accessible immediately
7. **Observability included** - Grafana stack deploys with your services

## Verification

```bash
# Check all pods are running
kubectl get pods

# Check service images
docker images | grep -E "cartservice-ts|frontend"

# Check deployments
kubectl get deployments
```
