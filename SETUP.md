# CollectionGeek — Setup Guide

This guide covers every credential and configuration step needed to run the application.
**No secrets belong in any file committed to this repo.** All sensitive values go through
the mechanisms described below.

---

## 1. WorkOS

You need two WorkOS environments: **Staging** (for local dev + test cluster) and
**Production** (for the prod cluster).

### Staging environment

1. Sign in to [workos.com](https://workos.com) → select **Staging** from the environment dropdown
2. Go to **Authentication → User Management → Configure AuthKit**
3. Under **Redirect URIs**, add:
   ```
   http://localhost:3000/callback
   https://app.test.collectiongeek.app/callback
   ```
4. Note your **Client ID** (e.g. `client_01ABC…`)
5. Go to **API Keys** and create a secret key (e.g. `sk_test_…`)
6. Go to **Webhooks** and create a new endpoint:
   - URL: `https://<your-dev-convex-deployment>.convex.cloud/workos-webhook`
   - Events: `user.created`, `user.deleted`
   - Copy the **Webhook Secret** (e.g. `whsec_…`)

### Production environment

Repeat the same steps with the **Production** dropdown selected, using:

```
https://app.collectiongeek.app/callback
```

---

## 2. Convex

You need a dev project and a prod project. From the [Convex dashboard](https://dashboard.convex.dev):

1. Open each project → **Settings → URL & Deploy Key**
2. Copy the **Deployment URL** and **Deploy Key** for each

### Link the dev project

```bash
cd /workspace
npx convex dev   # opens a browser to link your dev project
```

This creates `convex.json` and `.env.local` at the workspace root automatically.

### Set Convex environment variables

**Dev project:**

```bash
npx convex env set WORKOS_CLIENT_ID  "client_your_staging_client_id"
npx convex env set WORKOS_API_KEY    "sk_test_your_staging_api_key"
npx convex env set WORKOS_WEBHOOK_SECRET "whsec_your_staging_webhook_secret"
```

**Prod project** (run with `--prod` flag or switch to prod project first):

```bash
npx convex env set WORKOS_CLIENT_ID  "client_your_prod_client_id"     --prod
npx convex env set WORKOS_API_KEY    "sk_live_your_prod_api_key"       --prod
npx convex env set WORKOS_WEBHOOK_SECRET "whsec_your_prod_secret"     --prod
```

---

## 3. Local development .env files

### `/workspace/.env.local` (Convex CLI — auto-created by `npx convex dev`)

Add the WorkOS values so the Convex dev server picks them up:

```
WORKOS_CLIENT_ID=client_your_staging_client_id
WORKOS_API_KEY=sk_test_your_staging_api_key
```

### `/workspace/frontend/.env.local` (Vite dev server)

Copy from the example and fill in:

```bash
cp frontend/.env.local.example frontend/.env.local
```

Then edit `frontend/.env.local`:

```
VITE_API_BASE_URL=http://localhost:8080
VITE_WORKOS_CLIENT_ID=client_your_staging_client_id
VITE_CONVEX_URL=https://your-dev-project.convex.cloud
```

---

## 4. Kubernetes secrets

The Go backend reads `CONVEX_DEPLOY_KEY`, `WORKOS_CLIENT_ID`, and `CONVEX_DEPLOY_URL`
from environment variables backed by a Kubernetes secret.

```bash
# Test cluster
kubectl create secret generic collectiongeek-secrets \
  --from-literal=CONVEX_DEPLOY_KEY="test:your_test_deploy_key" \
  --from-literal=WORKOS_CLIENT_ID="client_your_staging_client_id" \
  --from-literal=CONVEX_DEPLOY_URL="https://your-test-project.convex.cloud" \
  --namespace app \
  --context app-test

# Prod cluster
kubectl create secret generic collectiongeek-secrets \
  --from-literal=CONVEX_DEPLOY_KEY="prod:your_prod_deploy_key" \
  --from-literal=WORKOS_CLIENT_ID="client_your_prod_client_id" \
  --from-literal=CONVEX_DEPLOY_URL="https://your-prod-project.convex.cloud" \
  --namespace app \
  --context app-prod
```

---

## 5. Helm chart updates (collectiongeek-gitops)

In `charts/backend/values-test.yaml` and `values-prod.yaml`, add the following
(non-sensitive values only — sensitive values come from the K8s secret above):

```yaml
env:
  PORT: "8080"
  CORS_ALLOWED_ORIGINS: "https://app.[test.]collectiongeek.app"

secretRef: collectiongeek-secrets
```

In `charts/backend/templates/deployment.yaml`, add to the container spec:

```yaml
envFrom:
  - secretRef:
      name: {{ .Values.secretRef }}
env:
  {{- range $key, $val := .Values.env }}
  - name: {{ $key }}
    value: {{ $val | quote }}
  {{- end }}
```

---

## 6. Kubernetes ConfigMap — frontend runtime config

The frontend Docker image contains **no baked-in URLs or credentials**. At container
startup, `docker-entrypoint.sh` writes `/config.js` from environment variables, and the
app reads `window.__CG_CONFIG__` at runtime. The same image tag is deployed to both
test and production; only the ConfigMap differs.

In the gitops repo, create `charts/frontend/templates/configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: frontend-config
  namespace: app
data:
  API_BASE_URL: { { .Values.config.apiBaseUrl | quote } }
  WORKOS_CLIENT_ID: { { .Values.config.workosClientId | quote } }
  CONVEX_URL: { { .Values.config.convexUrl | quote } }
```

Reference the ConfigMap in `charts/frontend/templates/deployment.yaml`:

```yaml
envFrom:
  - configMapRef:
      name: frontend-config
```

Then add non-sensitive values to each values file:

**`charts/frontend/values-test.yaml`:**

```yaml
config:
  apiBaseUrl: "https://api.test.collectiongeek.app"
  workosClientId: "<WorkOS Staging Client ID>"
  convexUrl: "<your dev/test Convex deployment URL>"
```

**`charts/frontend/values-prod.yaml`:**

```yaml
config:
  apiBaseUrl: "https://api.collectiongeek.app"
  workosClientId: "<WorkOS Production Client ID>"
  convexUrl: "<your prod Convex deployment URL>"
```

> **Note:** `workosClientId` and `convexUrl` are not secret — they are visible to
> anyone who loads the app. Commit them directly in the gitops repo.

---

## 7. Running locally

```bash
# Terminal 1 — Convex dev server (auto-deploys function changes)
cd /workspace && npx convex dev

# Terminal 2 — Go backend
cd /workspace/backend && \
PORT=8081
WORKOS_CLIENT_ID=client_... \
CONVEX_DEPLOY_URL=https://... \
CONVEX_DEPLOY_KEY=dev:... \
WORKOS_API_KEY=sk_test_... \
go run ./cmd/server

# Terminal 3 — Vite dev server
cd /workspace/frontend && npm run dev
```

The app will be at [http://localhost:3000](http://localhost:3000).

The Vite dev server reads `frontend/.env.local` for `VITE_*` variables, which
provide the fallback values that `src/lib/config.ts` uses when `window.__CG_CONFIG__`
is not present (i.e., outside Docker). The Docker image itself has no baked-in env
vars — they are injected at container startup via the K8s ConfigMap.

---

## 8. Convex WebHook registration

After you run `npx convex dev`, Convex exposes the webhook endpoint at:

```
https://<your-dev-deployment>.convex.cloud/workos-webhook
```

Register this URL in the WorkOS **Webhooks** section (Staging environment) to enable
automatic user creation when someone signs up.
