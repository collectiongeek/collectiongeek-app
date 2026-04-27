# -- Build stage --
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build-time env var — overridden per environment
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# -- Runtime stage --
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA fallback: serve index.html for all routes
RUN echo 'server { \
    listen 80; \
    location / { \
    root /usr/share/nginx/html; \
    try_files $uri $uri/ /index.html; \
    } \
    }' > /etc/nginx/conf.d/default.conf

EXPOSE 80