#!/bin/sh
set -e

# Write runtime config from environment variables into a JS file loaded before
# the app bundle. This keeps the Docker image environment-agnostic — the same
# image runs in test and production; only the K8s ConfigMap differs.
cat > /usr/share/nginx/html/config.js <<EOF
window.__CG_CONFIG__ = {
  apiBaseUrl: "${API_BASE_URL}",
  workosClientId: "${WORKOS_CLIENT_ID}",
  convexUrl: "${CONVEX_URL}"
};
EOF

exec nginx -g "daemon off;"
