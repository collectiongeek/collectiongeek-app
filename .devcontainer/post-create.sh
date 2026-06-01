#!/bin/bash
set -e

echo "==> Installing Go tools..."
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

# ---------------------------------------------------------
# Security scanners (pinned). Keep these versions in sync with
# .github/workflows/security.yml so local results match CI.
# Run with: npm run scan:security
# ---------------------------------------------------------
OPENGREP_VERSION="v1.22.0"
TRIVY_VERSION="v0.71.0"

if ! command -v opengrep >/dev/null 2>&1; then
  echo "==> Installing Opengrep ${OPENGREP_VERSION}..."
  curl -fsSL "https://github.com/opengrep/opengrep/releases/download/${OPENGREP_VERSION}/opengrep_manylinux_x86" \
    -o /tmp/opengrep
  # Optional but recommended: if cosign is installed, verify the signature.
  if command -v cosign >/dev/null 2>&1; then
    base="https://github.com/opengrep/opengrep/releases/download/${OPENGREP_VERSION}"
    curl -fsSL "${base}/opengrep_manylinux_x86.sig"  -o /tmp/opengrep.sig
    curl -fsSL "${base}/opengrep_manylinux_x86.cert" -o /tmp/opengrep.cert
    cosign verify-blob --certificate /tmp/opengrep.cert --signature /tmp/opengrep.sig \
      --certificate-identity-regexp '^https://github.com/opengrep/.+' \
      --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
      /tmp/opengrep
  fi
  chmod +x /tmp/opengrep
  sudo mv /tmp/opengrep /usr/local/bin/opengrep
fi

if ! command -v trivy >/dev/null 2>&1; then
  echo "==> Installing Trivy ${TRIVY_VERSION}..."
  curl -fsSL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
    | sudo sh -s -- -b /usr/local/bin "${TRIVY_VERSION}"
fi

echo "==> Done! Dev environment is ready."