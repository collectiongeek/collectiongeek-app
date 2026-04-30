#!/bin/bash
set -e

echo "==> Installing Go tools..."
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
go install github.com/air-verse/air@latest

if [ -f /workspace/backend/go.mod ]; then
  echo "==> Installing backend dependencies..."
  cd /workspace/backend
  go mod download
else
  echo "==> Skipping backend deps (no go.mod found yet)"
fi

if [ -f /workspace/frontend/package.json ]; then
  echo "==> Installing frontend dependencies..."
  cd /workspace/frontend
  npm ci
else
  echo "==> Skipping frontend deps (no package.json found yet)"
fi

echo "==> Installing Convex CLI..."
npm install -g convex

echo "==> Installing Helm..."
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

echo "==> Done! Dev environment is ready."