#!/bin/sh
set -e

# Derive the API origin from API_BASE_URL so it can be substituted into the
# CSP connect-src directive. In production the frontend (app.<domain>) and
# the API (api.<domain>) live on different origins, so a 'self'-only
# connect-src would block every fetch — the call to /api/v1/users/me would
# fail and the dashboard never loads.
#
# Strip path/query, leaving scheme://host[:port]. A relative or empty
# API_BASE_URL produces an empty origin, which is correct: 'self' already
# covers same-origin fetches.
API_ORIGIN=""
case "$API_BASE_URL" in
  http://*|https://*)
    API_ORIGIN=$(printf '%s' "$API_BASE_URL" | awk -F/ '{print $1"//"$3}')
    ;;
esac
export API_ORIGIN

# Render the nginx config from its template. The single-quoted variable list
# tells envsubst to substitute only ${API_ORIGIN} — nginx's own $variables
# (e.g. $request_uri, $uri) pass through untouched.
envsubst '${API_ORIGIN}' \
  < /etc/nginx/conf.d/default.conf.template \
  > /etc/nginx/conf.d/default.conf

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
