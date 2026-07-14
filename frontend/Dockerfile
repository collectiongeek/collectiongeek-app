# -- Build stage --
FROM node:26-alpine AS builder

# Mirror the repo layout so the ../convex/_generated/ alias in tsconfig resolves.
WORKDIR /workspace

# Cache dependency downloads
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci && ln -s /workspace/frontend/node_modules /workspace/node_modules

COPY frontend/ ./frontend/
# The Convex sources are needed at build time: _generated/api.d.ts re-imports them
# (e.g. `import type * as assets from "../assets.js"`) so TypeScript can infer
# query/mutation return types. They are not bundled into the frontend output.
COPY convex/ ./convex/

# Version metadata, supplied by CI (see .github/workflows/build-and-push.yml).
# Vite's `define:` substitution (vite.config.ts) reads these as env vars and
# inlines them into the bundle as string literals.
ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILT_AT=unknown
ENV APP_VERSION=${VERSION} APP_COMMIT=${COMMIT} APP_BUILT_AT=${BUILT_AT}

RUN cd frontend && npm run build

# -- Runtime stage --
# The UNPRIVILEGED variant: master process runs as uid 101 (not root),
# listens on 8080 (no privileged port), pid + temp files live under /tmp.
# That is what lets the chart run this container with runAsNonRoot, a
# read-only root filesystem and every capability dropped.
FROM nginxinc/nginx-unprivileged:alpine

# Root for the package upgrade and file installs (root-owned, world-readable
# is exactly right: the runtime user can read, nothing can tamper); the USER
# below drops back to the image's unprivileged account for runtime.
USER root
RUN apk upgrade --no-cache

COPY --from=builder /workspace/frontend/dist /usr/share/nginx/html
COPY frontend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# CSP + security-header config and SPA fallback live in nginx.conf so the
# Content-Security-Policy string isn't fighting printf escaping. See the
# header comment in that file for what each directive protects.
# Copied as a .template — docker-entrypoint.sh renders it via envsubst at
# container start so connect-src can be templated from $API_BASE_URL.
# NOT under /etc/nginx/conf.d: in Kubernetes that directory is an emptyDir
# mount (the rendered config's writable home), which would shadow anything
# the image put there.
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template

USER nginx

EXPOSE 8080

# Renders nginx.conf from the template, writes /config.js from env vars,
# then starts Nginx.
CMD ["/docker-entrypoint.sh"]
