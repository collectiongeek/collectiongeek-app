import { config } from "@/lib/config";

const BASE_URL = config.apiBaseUrl;

async function request<T>(
  path: string,
  options: RequestInit & { token: string }
): Promise<T> {
  const { token, ...init } = options;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }

  if (res.status === 204 || res.headers.get("Content-Length") === "0") {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

// --- Users ---

// Called on first login to create the Convex user record (replaces webhook-based creation in dev).
export function ensureUser(token: string, email: string) {
  return request<{ id: string }>("/api/v1/users/me", {
    method: "POST",
    token,
    body: JSON.stringify({ email }),
  });
}

export function setUsername(token: string, email: string, username: string) {
  return request<{ id: string }>("/api/v1/users/me", {
    method: "POST",
    token,
    body: JSON.stringify({ email, username }),
  });
}

export function deleteAccount(token: string) {
  return request<void>("/api/v1/users/me", { method: "DELETE", token });
}

// --- Collections ---

export function createCollection(
  token: string,
  data: { name: string; description?: string; collectionType?: string }
) {
  return request<{ id: string }>("/api/v1/collections", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function updateCollection(
  token: string,
  id: string,
  data: { name?: string; description?: string; collectionType?: string }
) {
  return request<void>(`/api/v1/collections/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(data),
  });
}

export function deleteCollection(token: string, id: string) {
  return request<void>(`/api/v1/collections/${id}`, {
    method: "DELETE",
    token,
  });
}

// --- Assets ---

export interface AssetPayload {
  collectionId: string;
  name: string;
  description?: string;
  dateAcquired?: string;
  purchasedValue?: number;
  marketValue?: number;
  tags?: string[];
  category?: string;
  customFields?: Array<{
    fieldName: string;
    fieldValue: string;
    fieldType: string;
  }>;
}

export function createAsset(token: string, data: AssetPayload) {
  return request<{ id: string }>("/api/v1/assets", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function updateAsset(
  token: string,
  id: string,
  data: Partial<AssetPayload>
) {
  return request<void>(`/api/v1/assets/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(data),
  });
}

export function deleteAsset(token: string, id: string) {
  return request<void>(`/api/v1/assets/${id}`, { method: "DELETE", token });
}
