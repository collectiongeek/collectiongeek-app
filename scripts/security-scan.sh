#!/usr/bin/env bash
#
# Local mirror of .github/workflows/security.yml — run the same SAST +
# dependency/secret/misconfig scans on your machine before pushing.
#
#   ./scripts/security-scan.sh          # run everything
#   ./scripts/security-scan.sh sast     # Opengrep only
#   ./scripts/security-scan.sh trivy    # Trivy only
#
# Requires `opengrep` and `trivy` on PATH (the devcontainer installs both;
# see .devcontainer/post-create.sh for standalone install commands).
set -euo pipefail

# Keep this commit in sync with OPENGREP_RULES_REF in security.yml.
OPENGREP_RULES_REF="f1d2b562b414783763fd02a6ed2736eaed622efa"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RULES_DIR="${REPO_ROOT}/.opengrep-rules"

target="${1:-all}"

run_sast() {
  if ! command -v opengrep >/dev/null 2>&1; then
    echo "✗ opengrep not found on PATH — see .devcontainer/post-create.sh" >&2
    return 1
  fi

  # Fetch (or pin-check) the license-clean community rules.
  if [ ! -d "${RULES_DIR}/.git" ]; then
    echo "==> Cloning opengrep-rules @ ${OPENGREP_RULES_REF:0:12}"
    git clone --quiet https://github.com/opengrep/opengrep-rules "${RULES_DIR}"
  fi
  git -C "${RULES_DIR}" fetch --quiet origin "${OPENGREP_RULES_REF}" 2>/dev/null || true
  git -C "${RULES_DIR}" checkout --quiet "${OPENGREP_RULES_REF}"

  echo "==> Running Opengrep (SAST)"
  # Scope to the `security/` rule subdirectories only — the language roots also
  # contain best-practice/i18n/portability rules that drown out security signal.
  # Auto-discovering every security dir keeps per-framework coverage (JWT,
  # node-crypto, DOM-XSS, etc.) without hardcoding a brittle list.
  local -a cfg=()
  while IFS= read -r d; do cfg+=(--config "$d"); done < <(
    find "${RULES_DIR}/typescript" "${RULES_DIR}/javascript" \
         "${RULES_DIR}/go" "${RULES_DIR}/generic" -type d -name security 2>/dev/null
  )
  # Rule files contain UTF-8; force a UTF-8 locale so config loading works
  # regardless of the host's default.
  LANG=C.UTF-8 LC_ALL=C.UTF-8 opengrep scan \
    "${cfg[@]}" \
    --exclude '.opengrep-rules' \
    --exclude 'node_modules' \
    --exclude 'dist' \
    "${REPO_ROOT}"
}

run_trivy() {
  if ! command -v trivy >/dev/null 2>&1; then
    echo "✗ trivy not found on PATH — see .devcontainer/post-create.sh" >&2
    return 1
  fi
  echo "==> Running Trivy (deps / secrets / misconfig)"
  trivy fs \
    --scanners vuln,secret,misconfig \
    --ignore-unfixed \
    "${REPO_ROOT}"
}

case "${target}" in
  sast)  run_sast ;;
  trivy) run_trivy ;;
  all)   run_sast; echo; run_trivy ;;
  *)     echo "usage: $0 [all|sast|trivy]" >&2; exit 2 ;;
esac

echo "==> Security scan complete."
