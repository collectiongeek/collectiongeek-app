import { config } from "@/lib/config";
import type { VersionInfo } from "@/lib/version";

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

// --- Version (public, no auth) ---

export async function getBackendVersion(): Promise<VersionInfo> {
  const res = await fetch(`${BASE_URL}/api/v1/version`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<VersionInfo>;
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

export function updateTheme(
  token: string,
  data: { theme?: string; themeMode?: "light" | "dark" | "system" }
) {
  return request<void>("/api/v1/users/me/theme", {
    method: "PUT",
    token,
    body: JSON.stringify(data),
  });
}

export function setEncryptionKey(
  token: string,
  data: { wrappedDek: string; keySalt: string }
) {
  return request<void>("/api/v1/users/me/encryption", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function rotateEncryptionKey(
  token: string,
  data: { wrappedDek: string; keySalt: string }
) {
  return request<void>("/api/v1/users/me/encryption/rotate", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

// --- Asset Types ---

export type DescriptorDataType =
  | "text"
  | "number"
  | "date"
  | "year"
  | "boolean"
  | "select";

export interface DescriptorInput {
  /** Ciphertext of the descriptor name. */
  name: string;
  dataType: DescriptorDataType;
  /** For "select" data type: ciphertext of JSON.stringify(options[]).
   *  A single encrypted blob, not an array of encrypted strings. */
  options?: string;
  required: boolean;
  order: number;
  /** Plaintext stable identifier carried over from a source template
   *  descriptor at install time. Edits preserve it; user-authored
   *  descriptors leave it undefined. */
  sourceKey?: string;
}

export interface AssetTypePayload {
  name: string;
  description?: string;
  descriptors?: DescriptorInput[];
  // Set when installing from a public template — plaintext, public identifiers.
  // The server records them on the asset type and bumps the template's
  // installCount atomically.
  sourceTemplateSlug?: string;
  sourceTemplateVersion?: string;
}

export function createAssetType(token: string, data: AssetTypePayload) {
  return request<{ id: string }>("/api/v1/asset-types", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function updateAssetType(
  token: string,
  id: string,
  data: Partial<AssetTypePayload>
) {
  return request<void>(`/api/v1/asset-types/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(data),
  });
}

export function deleteAssetType(token: string, id: string) {
  return request<void>(`/api/v1/asset-types/${id}`, {
    method: "DELETE",
    token,
  });
}

// --- Collection Types ---

export interface CollectionTypePayload {
  name: string;
  description?: string;
  assetTypeIds?: string[];
}

export function createCollectionType(
  token: string,
  data: CollectionTypePayload
) {
  return request<{ id: string }>("/api/v1/collection-types", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function updateCollectionType(
  token: string,
  id: string,
  data: Partial<CollectionTypePayload>
) {
  return request<void>(`/api/v1/collection-types/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(data),
  });
}

export function deleteCollectionType(token: string, id: string) {
  return request<void>(`/api/v1/collection-types/${id}`, {
    method: "DELETE",
    token,
  });
}

// --- Collections ---

export function createCollection(
  token: string,
  data: { name: string; description?: string; collectionTypeId?: string }
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
  data: { name?: string; description?: string; collectionTypeId?: string }
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

// --- Collection cover image ---
//
// Same two-step handshake as asset images. The cover is upserted: a second
// recordCover call against the same collection replaces the existing row
// and deletes the previous storage blob server-side.

export function requestCollectionCoverUploadUrl(
  token: string,
  collectionId: string
) {
  return request<{ uploadUrl: string }>(
    `/api/v1/collections/${collectionId}/cover/upload-url`,
    { method: "POST", token }
  );
}

export function recordCollectionCover(
  token: string,
  collectionId: string,
  data: { storageId: string; metadataCiphertext: string }
) {
  return request<{ id: string }>(`/api/v1/collections/${collectionId}/cover`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function updateCollectionCoverMetadata(
  token: string,
  collectionId: string,
  data: { metadataCiphertext: string }
) {
  return request<void>(`/api/v1/collections/${collectionId}/cover`, {
    method: "PATCH",
    token,
    body: JSON.stringify(data),
  });
}

export function deleteCollectionCover(token: string, collectionId: string) {
  return request<void>(`/api/v1/collections/${collectionId}/cover`, {
    method: "DELETE",
    token,
  });
}

// --- Assets ---

export interface DescriptorValueInput {
  descriptorId: string;
  value: string;
}

// All user-content fields are ciphertext strings. Numbers (cents) and tag
// arrays are stringified+encrypted on the client before reaching this layer.
export interface AssetPayload {
  assetTypeId?: string;
  name: string;
  description?: string;
  dateAcquired?: string;
  dateSold?: string;
  purchasedValue?: string;
  marketValue?: string;
  tags?: string;
  // Ciphertext of the enum value, or "" in an edit payload to clear the field.
  kind?: string;
  status?: string;
  collectionIds?: string[];
  descriptorValues?: DescriptorValueInput[];
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

export function addAssetToCollection(
  token: string,
  assetId: string,
  collectionId: string
) {
  return request<void>(`/api/v1/assets/${assetId}/collections`, {
    method: "POST",
    token,
    body: JSON.stringify({ collectionId }),
  });
}

export function removeAssetFromCollection(
  token: string,
  assetId: string,
  collectionId: string
) {
  return request<void>(
    `/api/v1/assets/${assetId}/collections/${collectionId}`,
    { method: "DELETE", token }
  );
}

// --- Asset Images ---

// Step 1 of the upload handshake: ask the backend for a one-shot Convex
// storage URL the client can POST the encrypted bytes to.
export function requestImageUploadUrl(token: string, assetId: string) {
  return request<{ uploadUrl: string }>(
    `/api/v1/assets/${assetId}/images/upload-url`,
    { method: "POST", token }
  );
}

// Step 2 of the upload handshake: tell the backend that the bytes are in
// place at `storageId` and that this row should be persisted. `setPrimary`
// only matters when there are already other images on the asset — the
// first image is always primary regardless.
export function recordImage(
  token: string,
  assetId: string,
  data: { storageId: string; metadataCiphertext: string; setPrimary?: boolean }
) {
  return request<{ id: string }>(`/api/v1/assets/${assetId}/images`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

// Patches an image row — used for both crop-view edits and the
// "make this the primary" flip.
export function updateImage(
  token: string,
  assetId: string,
  imageId: string,
  data: { metadataCiphertext?: string; setPrimary?: boolean }
) {
  return request<void>(`/api/v1/assets/${assetId}/images/${imageId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(data),
  });
}

export function deleteImage(token: string, assetId: string, imageId: string) {
  return request<void>(`/api/v1/assets/${assetId}/images/${imageId}`, {
    method: "DELETE",
    token,
  });
}
