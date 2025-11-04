#!/bin/bash
# K8s debugging and ops utilities (secondary to Skaffold)
# Primary workflow: Use `skaffold dev` for build/deploy iteration
# This script: Debugging, logs, cleanup, and port-forwarding
# Usage: ./scripts/dev.sh [command] [service]

set -e

SERVICE="${2:-cartservice-ts}"
NAMESPACE="${NAMESPACE:-default}"

logs() {
    kubectl logs -f -l app="$SERVICE" -n "$NAMESPACE" --tail=50
}

port-forward() {
    case "$SERVICE" in
        frontend)
            echo "Forwarding frontend:8080 to localhost:8080"
            kubectl port-forward -n "$NAMESPACE" deployment/frontend 8080:8080
            ;;
        cartservice-ts)
            echo "Forwarding cartservice:7070 to localhost:7070"
            kubectl port-forward -n "$NAMESPACE" svc/cartservice 7070:7070
            ;;
        grafana|grafana-lgtm)
            echo "Forwarding grafana:3000 to localhost:3000"
            kubectl port-forward -n "$NAMESPACE" svc/grafana-lgtm 3000:3000
            ;;
        *)
            local PORT="${3:-8080}"
            echo "Forwarding $SERVICE:$PORT to localhost:$PORT"
            kubectl port-forward -n "$NAMESPACE" deployment/"$SERVICE" "$PORT:$PORT"
            ;;
    esac
}

debug() {
    echo "=== Pods ==="
    kubectl get pods -l app="$SERVICE" -n "$NAMESPACE"
    echo -e "\n=== Recent Logs ==="
    kubectl logs -l app="$SERVICE" -n "$NAMESPACE" --tail=30
    echo -e "\n=== Events ==="
    kubectl get events -n "$NAMESPACE" --sort-by='.lastTimestamp' | grep "$SERVICE" | tail -10
}

shell() {
    local POD=$(kubectl get pods -l app="$SERVICE" -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}')
    kubectl exec -it "$POD" -n "$NAMESPACE" -- /bin/sh
}

restart() {
    echo "Restarting $SERVICE deployment..."
    kubectl rollout restart deployment/"$SERVICE" -n "$NAMESPACE"
    kubectl rollout status deployment/"$SERVICE" -n "$NAMESPACE" --timeout=120s
    echo "✅ $SERVICE restarted!"
}

cleanup() {
    if [ "$SERVICE" = "all" ]; then
        cleanup_all
        return
    fi
    
    echo "Cleaning up failed pods for $SERVICE..."
    kubectl delete pods -l app="$SERVICE" -n "$NAMESPACE" \
        --field-selector=status.phase=Failed 2>/dev/null || true
    
    # Delete pods with image pull errors
    local pods=$(kubectl get pods -l app="$SERVICE" -n "$NAMESPACE" -o wide 2>/dev/null | \
        grep -E "ErrImagePull|ImagePullBackOff|ErrImageNeverPull" | awk '{print $1}')
    
    if [ -n "$pods" ]; then
        echo "Deleting pods with image pull errors:"
        echo "$pods" | while read pod; do
            [ -n "$pod" ] && echo "  → $pod" && kubectl delete pod "$pod" -n "$NAMESPACE"
        done
    else
        echo "No problematic pods found for $SERVICE"
    fi
}

cleanup_all() {
    echo "=== Cleaning up all failed/problematic pods ==="
    
    # Delete failed pods
    echo "Removing failed pods..."
    kubectl delete pods -n "$NAMESPACE" --field-selector=status.phase=Failed 2>/dev/null || true
    
    # Delete pods with image pull errors
    local pods=$(kubectl get pods -n "$NAMESPACE" -o wide 2>/dev/null | \
        grep -E "ErrImagePull|ImagePullBackOff|ErrImageNeverPull" | awk '{print $1}')
    
    if [ -n "$pods" ]; then
        echo "Deleting pods with image pull errors:"
        echo "$pods" | while read pod; do
            [ -n "$pod" ] && echo "  → $pod" && kubectl delete pod "$pod" -n "$NAMESPACE"
        done
        echo ""
        echo "✅ Cleanup complete! Kubernetes will recreate healthy pods."
    else
        echo "No problematic pods found"
    fi
}

case "${1:-help}" in
    cleanup) cleanup ;;
    logs) logs ;;
    port-forward|pf) port-forward ;;
    debug) debug ;;
    shell) shell ;;
    restart) restart ;;
    *)
        cat << EOF
K8s Debugging & Ops Utilities

PRIMARY WORKFLOW (Recommended):
  Use Skaffold for build/deploy iteration:
    skaffold dev              # Continuous development with auto-rebuild + port-forward
    skaffold run              # One-time build and deploy
    skaffold debug            # Debug mode with breakpoint support

SECONDARY WORKFLOW (This Script):
  Use dev.sh for debugging and operational tasks

Usage: $0 [command] [service]

Debugging & Monitoring:
  logs               Follow logs for a service
  debug              Show pod status, logs, and events
  shell              Open shell in pod
  port-forward [port] Port forward to localhost (manual)
  restart            Restart deployment (without rebuild)

Cleanup & Maintenance:
  cleanup [service|all]  Remove failed/problematic pods

Examples:
  # Debugging
  $0 logs cartservice-ts
  $0 debug cartservice-ts
  $0 shell cartservice-ts
  
  # Port forwarding (manual - skaffold dev does this automatically)
  $0 port-forward frontend          # localhost:8080
  $0 port-forward cartservice-ts    # localhost:7070
  $0 port-forward grafana-lgtm      # localhost:3000
  
  # Cleanup
  $0 cleanup all                    # Remove all failed pods
  $0 cleanup cartservice-ts         # Remove failed pods for specific service
  
  # Restart without rebuild
  $0 restart cartservice-ts         # Restart deployment

Environment Variables:
  NAMESPACE          Kubernetes namespace (default: default)

Note: Skaffold automatically handles:
  - Building only changed services
  - Deploying only when changes detected
  - Port forwarding (with 'skaffold dev')
  - Log streaming (with 'skaffold dev')
  
  Use this script only for debugging tasks not covered by Skaffold.
EOF
        ;;
esac
