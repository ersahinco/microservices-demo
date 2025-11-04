#!/bin/bash
# Script to generate grafana-dashboards-data.yaml ConfigMap from dashboard JSON files
# Usage: ./add-dashboard.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARDS_DIR="${SCRIPT_DIR}/dashboards"
OUTPUT_FILE="${SCRIPT_DIR}/grafana-dashboards-data.yaml"

echo "Generating Grafana dashboards ConfigMap..."

# Start the ConfigMap YAML
cat > "${OUTPUT_FILE}" << 'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboards
  namespace: default
data:
EOF

# Add each dashboard JSON file to the ConfigMap
for dashboard_file in "${DASHBOARDS_DIR}"/*.json; do
  if [ -f "${dashboard_file}" ]; then
    dashboard_name=$(basename "${dashboard_file}")
    echo "  Adding dashboard: ${dashboard_name}"
    
    # Add the dashboard to the ConfigMap with proper indentation
    echo "  ${dashboard_name}: |-" >> "${OUTPUT_FILE}"
    # Add indented content and ensure it ends with a newline
    sed 's/^/    /' "${dashboard_file}" >> "${OUTPUT_FILE}"
    # Ensure there's a newline after the JSON content
    [ -n "$(tail -c 1 "${dashboard_file}")" ] && echo "" >> "${OUTPUT_FILE}"
    # Add blank line between dashboards
    echo "" >> "${OUTPUT_FILE}"
  fi
done

echo "✓ ConfigMap generated successfully: ${OUTPUT_FILE}"
echo "✓ Total dashboards: $(ls -1 "${DASHBOARDS_DIR}"/*.json 2>/dev/null | wc -l | tr -d ' ')"
