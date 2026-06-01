# Security scanning

CollectionGeek is scanned with three free, open-source-friendly layers. Each one
runs in CI on every PR and push to `main`, and the first two also run locally with
one command. Findings surface in the repo's **Security → Code scanning** tab.

| Layer | Tool | Covers | Local command |
|-------|------|--------|---------------|
| SAST | [Opengrep](https://github.com/opengrep/opengrep) | TS/React, Convex, Go source — injection, dangerous sinks, auth bugs | `npm run scan:sast` |
| Supply chain / IaC | [Trivy](https://github.com/aquasecurity/trivy) | npm + Go CVEs, leaked secrets, Dockerfile/compose misconfig | `npm run scan:trivy` |
| GitHub-native | CodeQL · Secret scanning · Dependabot | Second SAST engine, push-time secret blocking, dependency PRs | (CI / GitHub only) |

Run everything at once with `npm run scan:security`.

## Why these tools

- **Opengrep, not Semgrep CE.** Opengrep is the community-governed LGPL-2.1 fork of
  Semgrep Community Edition. It restores cross-function taint analysis and SARIF
  fingerprinting that Semgrep moved behind its commercial platform, stays backward
  compatible with Semgrep's rule format, and carries no rug-pull risk — the same
  reasoning that led this project to OpenTofu over Terraform.
- **Trivy, not tfsec.** tfsec is in maintenance-only mode; Aqua folded its checks
  into Trivy's misconfiguration scanner. Trivy covers IaC + containers + deps +
  secrets in a single binary, which minimizes the number of tools to maintain.
- **GitHub-native** is essentially free effort on a public repo and acts as a
  backstop with a different engine.

## Rule scope: security only

The scan loads only the `security/` subdirectories of the Opengrep rule set
(auto-discovered with `find`), not the whole language folders. The language roots
also ship best-practice, i18n, and portability rules — on this codebase those
produced ~308 non-security findings (mostly "JSX element not internationalized")
that bury the real signal. Security-only scoping keeps per-framework coverage
(JWT, node-crypto, DOM-XSS, Go TLS, …) while reporting actual vulnerabilities.

To broaden later, point `--config` at a full language dir (e.g.
`.opengrep-rules/typescript`) in [security.yml](../.github/workflows/security.yml)
and [scripts/security-scan.sh](../scripts/security-scan.sh).

## Posture: report-only (for now)

CI is intentionally **non-blocking**: scans upload to the Security tab but never fail
a PR. This lets us tune out false positives before enforcing. To make it blocking
later:

- **Opengrep** — add `--error` to the scan step in
  [.github/workflows/security.yml](../.github/workflows/security.yml).
- **Trivy** — set `exit-code: '1'` in the same file.

Accepted findings are suppressed via [.trivyignore](../.trivyignore) (Trivy) and rule
`# nosem` / `# nosemgrep` inline comments (Opengrep).

## Version pinning

Scanner versions are pinned in three places that must stay in sync:

| What | Where |
|------|-------|
| Opengrep CLI | `OPENGREP_VERSION` in `security.yml` and `post-create.sh` |
| Opengrep rules | `OPENGREP_RULES_REF` (a commit SHA) in `security.yml` and `scripts/security-scan.sh` |
| Trivy CLI (local) | `TRIVY_VERSION` in `post-create.sh` |
| Trivy action (CI) | `aquasecurity/trivy-action@<tag>` in `security.yml` |

The CI Opengrep binary is additionally **cosign-verified** before it runs, so a
tampered release won't execute. Treat version bumps like any dependency bump.

## One-time GitHub settings (manual)

These can't be set from a file — flip them once in the repo UI (free on public repos):

1. **Settings → Code security → Secret scanning** → Enable, and enable
   **Push protection** (blocks a WorkOS / Convex key before it lands in a commit).
2. **Settings → Code security → Code scanning** → confirm "default"/CodeQL is on
   (the [codeql.yml](../.github/workflows/codeql.yml) workflow also drives this).
3. **Dependabot** → ensure Dependabot alerts + security updates are enabled; the
   [dependabot.yml](../.github/dependabot.yml) handles version-update PRs.

## Local usage

The devcontainer installs `opengrep` and `trivy` automatically (see
[post-create.sh](../.devcontainer/post-create.sh)). Outside the devcontainer:

```bash
# Opengrep
curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh | bash
# Trivy
curl -fsSL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
  | sh -s -- -b /usr/local/bin v0.71.0
```

Then `npm run scan:security`. The Opengrep rule set is cloned on first run into
`.opengrep-rules/` (git-ignored).

## Editor integration

Opengrep is CLI/LSP-first today — there's no one-click VS Code extension equivalent
to Semgrep's yet. The practical IDE workflow is `npm run scan:sast` (fast on this
codebase) plus the CI annotations on your PRs. If you later want in-editor squiggles,
Opengrep exposes an LSP (`opengrep lsp`) that a generic LSP client extension can
point at; revisit as the editor tooling matures.

## Sibling repos

The same Trivy config scanner replaces tfsec in
[`collectiongeek-infra`](https://github.com/collectiongeek/collectiongeek-infra)
(`trivy config .`) and audits Helm/K8s manifests in
[`collectiongeek-gitops`](https://github.com/collectiongeek/collectiongeek-gitops).
Those repos carry their own copies of the workflow.
