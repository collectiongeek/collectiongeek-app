/**
 * Image-upload orchestration. Bridges:
 *   1. Browser file inputs / drag-and-drop  (a File)
 *   2. Client-side resize+compress           (browser-image-compression)
 *   3. Zero-knowledge encryption + envelope  (lib/crypto)
 *   4. Direct upload to Convex File Storage  (signed URL → POST)
 *
 * The Convex storage URL is one-shot. The bytes that traverse the wire are
 * encrypted-with-owner-header; nothing readable ever reaches the server.
 */

import imageCompression from "browser-image-compression";
import {
  decryptBinary,
  decryptString,
  encryptBinary,
  encryptString,
  unwrapOwnerHeader,
  wrapWithOwnerHeader,
} from "@/lib/crypto";

// Per spec — enforced by the client; the server can't see image bytes to
// validate them. browser-image-compression iterates resize+quality until
// the output blob fits, so a small over-spec is still recoverable.
export const MAX_DIMENSION_PX = 1500;
export const MAX_FILE_SIZE_BYTES = 500 * 1024;
export const MAX_IMAGES_PER_ASSET = 6;

/**
 * A user-selected crop region as fractions (0..1) of the natural image
 * dimensions. (x, y) is the top-left corner; width and height are the
 * extents. In pixel space the region is always square (the cropper
 * enforces aspect=1), but the *normalized* width and height differ for
 * non-square images.
 *
 * This is sufficient to reproduce the cropper's view in a fixed-size
 * thumbnail without needing the natural dimensions at render time —
 * see EncryptedThumbnail for the derivation.
 */
export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `null` means "no custom crop set" — render with default cover-fit. */
export type ImageCropView = CropRegion | null;

export interface ImageMetadata {
  cropView: ImageCropView;
  contentType: string;
  sizeBytes: number;
}

export const DEFAULT_CROP_VIEW: ImageCropView = null;

/**
 * Resizes + recompresses any image file the browser can decode to fit the
 * 1500×1500 / 500KB envelope. Always outputs JPEG for a predictable size
 * curve; transparency in PNGs is flattened against white, which is
 * acceptable for "photos of objects".
 */
export async function compressForUpload(file: File): Promise<Blob> {
  return imageCompression(file, {
    maxWidthOrHeight: MAX_DIMENSION_PX,
    maxSizeMB: MAX_FILE_SIZE_BYTES / (1024 * 1024),
    useWebWorker: true,
    fileType: "image/jpeg",
    // Aggressive but reasonable starting quality; the library steps down
    // automatically if the size cap isn't met.
    initialQuality: 0.85,
  });
}

/**
 * Encrypts a compressed image blob and wraps it with the plaintext owner
 * header. The returned Blob is the exact byte stream to POST to the Convex
 * upload URL.
 */
export async function encryptForUpload(
  blob: Blob,
  dek: CryptoKey,
  workosUserId: string
): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const encrypted = await encryptBinary(bytes, dek);
  const wrapped = wrapWithOwnerHeader(workosUserId, encrypted);
  // `application/octet-stream` is opaque to any intermediary — the server
  // can't sniff the type either way (the bytes are ciphertext), but using
  // a generic content type avoids any CDN trying to be helpful.
  return new Blob([wrapped as BlobPart], { type: "application/octet-stream" });
}

/**
 * POSTs the wrapped+encrypted blob to a Convex one-shot upload URL and
 * returns the resulting storageId. Throws on any non-2xx response.
 */
export async function uploadEncryptedBlob(
  uploadUrl: string,
  encryptedBlob: Blob
): Promise<string> {
  const res = await fetch(uploadUrl, {
    method: "POST",
    body: encryptedBlob,
    headers: { "Content-Type": "application/octet-stream" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
  const body: unknown = await res.json();
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { storageId?: unknown }).storageId !== "string"
  ) {
    throw new Error("Upload response missing storageId");
  }
  return (body as { storageId: string }).storageId;
}

/**
 * Encrypts the asset-image metadata object (crop view + content-type + size)
 * with the same envelope used by other text ciphertext fields.
 */
export async function encryptImageMetadata(
  meta: ImageMetadata,
  dek: CryptoKey
): Promise<string> {
  return encryptString(JSON.stringify(meta), dek);
}

export async function decryptImageMetadata(
  ciphertext: string,
  dek: CryptoKey
): Promise<ImageMetadata> {
  const json = await decryptString(ciphertext, dek);
  return normalizeImageMetadata(JSON.parse(json));
}

// Tolerant of older blobs that used the (x, y, zoom) shape — those parse
// to cropView=null (no custom crop) so the thumbnail falls back to
// cover-fit instead of misrendering. New writes always use CropRegion.
function normalizeImageMetadata(v: unknown): ImageMetadata {
  if (typeof v !== "object" || v === null) {
    throw new Error("Image metadata has unexpected shape");
  }
  const o = v as Record<string, unknown>;
  if (typeof o.contentType !== "string" || typeof o.sizeBytes !== "number") {
    throw new Error("Image metadata has unexpected shape");
  }
  return {
    contentType: o.contentType,
    sizeBytes: o.sizeBytes,
    cropView: isCropRegion(o.cropView) ? o.cropView : null,
  };
}

function isCropRegion(v: unknown): v is CropRegion {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.x === "number" &&
    typeof o.y === "number" &&
    typeof o.width === "number" &&
    typeof o.height === "number"
  );
}

/**
 * Fetches an encrypted image from its Convex storage URL, strips the owner
 * header, decrypts the body, and returns an `objectURL` suitable for use
 * as an `<img src>`. Caller is responsible for `URL.revokeObjectURL()`
 * once the image is no longer needed — unless the result came from
 * {@link getDecryptedImageUrl}, in which case the cache owns the URL.
 */
export async function fetchAndDecryptImage(
  storageUrl: string,
  dek: CryptoKey
): Promise<{ objectUrl: string; contentType: string }> {
  const res = await fetch(storageUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch image (${res.status})`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const { body } = unwrapOwnerHeader(bytes);
  const plain = await decryptBinary(body, dek);
  // The owner header doesn't carry the original content-type — it's
  // always JPEG post-compression. Hard-code it instead of guessing.
  const contentType = "image/jpeg";
  const blob = new Blob([plain as BlobPart], { type: contentType });
  return { objectUrl: URL.createObjectURL(blob), contentType };
}

// --- Shared object-URL cache ----------------------------------------
//
// Decrypting an image is the expensive step (fetch + AES-GCM + Blob), so
// thumbnails and the lightbox cooperate through one module-level cache
// keyed by storageId.
//
// The cache is LRU-bounded: 6 images × 500 KB × hundreds of assets in a
// long browse session is real memory, so we cap at MAX_CACHE_ENTRIES
// and revoke the oldest object URL when the cap is exceeded. The
// underlying Map preserves insertion order, so an LRU is just
// "delete + reinsert on touch" plus "drop the oldest key on overflow."

const MAX_CACHE_ENTRIES = 100;
const objectUrlCache = new Map<string, string>();
// Identity of an in-flight fetch is tracked via an opaque token so the
// resolving promise can check "was I evicted while fetching?" without
// referencing itself (which TS can't flow-analyze across an async IIFE).
interface InFlightSlot {
  promise: Promise<string>;
  token: object;
}
const inFlight = new Map<string, InFlightSlot>();

function touchCache(storageId: string): void {
  const url = objectUrlCache.get(storageId);
  if (url === undefined) return;
  // Delete + reinsert moves the entry to the most-recently-used end.
  objectUrlCache.delete(storageId);
  objectUrlCache.set(storageId, url);
}

function insertCache(storageId: string, url: string): void {
  objectUrlCache.set(storageId, url);
  while (objectUrlCache.size > MAX_CACHE_ENTRIES) {
    const oldest = objectUrlCache.keys().next().value;
    if (oldest === undefined) break;
    const oldUrl = objectUrlCache.get(oldest);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    objectUrlCache.delete(oldest);
  }
}

/**
 * Returns a decrypted-image object URL for the given storage record,
 * sharing one entry across all callers (thumbnail + lightbox + crop
 * dialog). Concurrent calls for the same storageId are coalesced.
 *
 * The cache owns the URL — DO NOT revoke it. Eviction (LRU overflow or
 * explicit {@link evictDecryptedImageUrl}) revokes; everything else
 * just hands out the cached handle.
 */
export async function getDecryptedImageUrl(
  storageId: string,
  storageUrl: string,
  dek: CryptoKey
): Promise<string> {
  const cached = objectUrlCache.get(storageId);
  if (cached) {
    touchCache(storageId);
    return cached;
  }
  const pending = inFlight.get(storageId);
  if (pending) return pending.promise;
  // Fresh token per call. `evict` clears the slot, so when the fetch
  // resolves we can tell "is the slot still ours?" via identity.
  const token: object = {};
  const promise = (async () => {
    try {
      const { objectUrl } = await fetchAndDecryptImage(storageUrl, dek);
      if (inFlight.get(storageId)?.token !== token) {
        // Evicted (or superseded) while we were fetching: drop the URL
        // and surface an error rather than resurrecting the cache.
        URL.revokeObjectURL(objectUrl);
        throw new Error("Image evicted during fetch");
      }
      insertCache(storageId, objectUrl);
      return objectUrl;
    } finally {
      // Only clear the slot if it's still ours. Evict may have
      // pre-cleared it, and a brand-new request may have replaced it;
      // either way we must not clobber someone else's slot.
      if (inFlight.get(storageId)?.token === token) {
        inFlight.delete(storageId);
      }
    }
  })();
  inFlight.set(storageId, { promise, token });
  return promise;
}

/**
 * Drops a cached URL (e.g. after the underlying image was deleted) so a
 * subsequent fetch goes back to storage. Safe to call when nothing is
 * cached.
 *
 * Also clears any in-flight entry for the same storageId so a pending
 * fetch resolving after the evict cannot resurrect the cache with a
 * stale URL. (See the identity check inside `getDecryptedImageUrl`.)
 */
export function evictDecryptedImageUrl(storageId: string): void {
  const url = objectUrlCache.get(storageId);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrlCache.delete(storageId);
  }
  inFlight.delete(storageId);
}
