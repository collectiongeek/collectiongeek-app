# -- Build stage --
FROM node:22-alpine AS builder

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
FROM nginx:alpine

RUN apk upgrade --no-cache

COPY --from=builder /workspace/frontend/dist /usr/share/nginx/html
COPY frontend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# CSP + security-header config and SPA fallback live in nginx.conf so the
# Content-Security-Policy string isn't fighting printf escaping. See the
# header comment in that file for what each directive protects.
# Copied as a .template — docker-entrypoint.sh renders it via envsubst at
# container start so connect-src can be templated from $API_BASE_URL.
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf.template

EXPOSE 80

# Renders nginx.conf from the template, writes /config.js from env vars,
# then starts Nginx.
CMD ["/docker-entrypoint.sh"]
