# -- Build stage --
FROM node:20-alpine AS builder

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
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Writes /config.js from env vars at startup, then starts Nginx
CMD ["/docker-entrypoint.sh"]
