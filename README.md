# collectiongeek-app

## Architecture

- **Backend:** Go (Chi) — API server at `backend/`
- **Frontend:** React (Vite + TypeScript) — Web app at `frontend/`
- **State:** Convex — Real-time data layer at `convex/`

## Getting Started

### Prerequisites

- Docker Desktop (or Docker Engine + Compose on Linux)
- VS Code with the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension

### Setup

1. Clone the repo
2. Open the folder in VS Code
3. Click "Reopen in Container" when prompted
4. Wait for the dev container to build (first time only)

All tools (Go, Node, Docker CLI, linters) are provided by the dev container.

### Run locally (dev mode, with hot-reload)

Backend:

```bash
cd backend && air
```

Frontend (separate terminal):

```bash
cd frontend && npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8080
- Health check: http://localhost:8080/healthz

### Run locally (production containers)

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8080

### Without Dev Container (not recommended)

If you prefer to work without the dev container, you'll need installed locally:

- Go 1.22+
- Node.js 20+
- Docker & Docker Compose
- golangci-lint
