# collectiongeek-app

## Architecture

| Layer | Tech | Location |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind v4 + shadcn | `frontend/` |
| Backend | Go (Chi) — REST API | `backend/` |
| Database / Realtime | Convex | `convex/` |
| Auth | WorkOS AuthKit | — |

## Prerequisites

- Docker Desktop (or Docker Engine on Linux)
- VS Code with the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension
- An [Anthropic API key](https://console.anthropic.com/) — set `ANTHROPIC_API_KEY` in your shell before opening the container, or drop it in `~/.claude/`

All other tools (Go, Node, air, Convex CLI, Claude Code) are provided by the dev container.

## First-time setup

See [SETUP.md](SETUP.md) for the full walkthrough: WorkOS project config, Convex project linking, and how to populate the env files below.

### Env files you need

**`frontend/.env.local`** (Vite dev server — copy from `frontend/.env.local.example`)

```
VITE_API_BASE_URL=http://localhost:8081
VITE_WORKOS_CLIENT_ID=client_...      # WorkOS Staging Client ID
VITE_CONVEX_URL=https://....convex.cloud
```

**`.env.local`** (Convex CLI — copy from `.env.local.example`)

```
WORKOS_CLIENT_ID=client_...           # WorkOS Staging Client ID
WORKOS_API_KEY=sk_test_...            # WorkOS Staging API key
```

## Run locally (dev mode, with hot-reload)

Open three terminals inside the dev container:

**Terminal 1 — Convex** (auto-deploys schema and function changes)

```bash
npx convex dev
```

**Terminal 2 — Go backend**

```bash
cd backend && \
PORT=8081 \
WORKOS_CLIENT_ID=client_... \
WORKOS_API_KEY=sk_test_... \
CONVEX_DEPLOY_URL=https://....convex.cloud \
CONVEX_DEPLOY_KEY=dev:... \
go run ./cmd/server
```

> Replace `go run ./cmd/server` with `air` if you want automatic restart on file changes.

**Terminal 3 — Vite dev server**

```bash
cd frontend && npm run dev
```

| Service | URL |
|---|---|
| App | http://localhost:3000 |
| Backend API | http://localhost:8081 |
| Health check | http://localhost:8081/healthz |
| Convex dashboard | https://dashboard.convex.dev |

> **WorkOS redirect URI:** add `http://localhost:3000/callback` to your WorkOS Staging
> environment under Authentication → AuthKit → Redirect URIs.

## Run locally (production containers)

Tests the Docker build without needing a cluster. Does not use `air` or Vite hot-reload.

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| App | http://localhost:3000 |
| Backend API | http://localhost:8080 |

> The compose backend reads `CONVEX_DEPLOY_URL`, `CONVEX_DEPLOY_KEY`, and
> `WORKOS_CLIENT_ID` from your shell environment, so export them before running.

## Without the dev container

Install manually:

- Go 1.22+
- Node.js 20+
- [`air`](https://github.com/air-verse/air) — `go install github.com/air-verse/air@latest`
- [Convex CLI](https://docs.convex.dev/cli) — `npm install -g convex`
- [Claude Code](https://claude.ai/code) — `npm install -g @anthropic-ai/claude-code`
