import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEncryption } from "@/lib/encryption-provider";
import {
  decryptImageMetadata,
  getDecryptedImageUrl,
  DEFAULT_CROP_VIEW,
  type ImageCropView,
} from "@/lib/images";

interface CoverInput {
  _id: string;
  storageId: string;
  storageUrl: string | null;
  metadataCiphertext: string;
}

interface Props {
  /** The cover row from getCoverByCollection / listCoversByCollectionIds.
   *  Both `null` (no cover set) and `undefined` (Convex query still
   *  loading) render the deterministic fallback color — on a dashboard
   *  with N tiles, a wall of spinners is more jarring than the calm
   *  color, and rendering the color in the loading state also avoids
   *  flickering on tiles whose query resolves to "no cover set". */
  cover: CoverInput | null | undefined;
  /** Used by the fallback color hash so distinct collections get distinct
   *  tiles even before they have a cover image. */
  collectionName: string;
  className?: string;
  alt?: string;
}

// Same absolute-positioning trick as EncryptedThumbnail, but inside a
// 16:9 container instead of a square. The math is aspect-agnostic — see
// renderCroppedImageProps in EncryptedThumbnail.tsx for the derivation.
export function CollectionCoverImage({
  cover,
  collectionName,
  className,
  alt = "",
}: Props) {
  const { dek } = useEncryption();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [cropView, setCropView] = useState<ImageCropView>(DEFAULT_CROP_VIEW);
  const [failed, setFailed] = useState(false);
  const loadingForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!cover || !cover.storageUrl || !dek) {
      loadingForRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setObjectUrl(null);
      setCropView(DEFAULT_CROP_VIEW);
      setFailed(false);
      return;
    }
    const sid = cover.storageId;
    loadingForRef.current = sid;

    decryptImageMetadata(cover.metadataCiphertext, dek)
      .then((meta) => {
        if (loadingForRef.current !== sid) return;
        setCropView(meta.cropView);
      })
      .catch(() => {
        if (loadingForRef.current !== sid) return;
        setCropView(DEFAULT_CROP_VIEW);
      });

    setObjectUrl(null);
    setFailed(false);

    // The returned URL is owned by the shared LRU cache in lib/images.ts
    // and may be held simultaneously by other consumers (dashboard tile,
    // detail-page banner, picker preview). DO NOT call URL.revokeObjectURL
    // on it from here — the cache evicts via its own mechanism.
    getDecryptedImageUrl(sid, cover.storageUrl, dek)
      .then((url) => {
        if (loadingForRef.current !== sid) return;
        setObjectUrl(url);
      })
      .catch((err) => {
        if (loadingForRef.current !== sid) return;
        console.warn("Cover decrypt failed:", err);
        setFailed(true);
      });
  }, [cover, dek]);

  const containerClass = cn(
    "relative overflow-hidden bg-muted",
    className
  );

  // No cover OR decryption failed: deterministic color from the name so
  // each unset tile is still visually distinct.
  if (!cover || failed) {
    return (
      <div
        className={containerClass}
        style={{ backgroundColor: fallbackColor(collectionName) }}
        aria-hidden
      />
    );
  }

  if (!objectUrl) {
    return (
      <div
        className={cn(
          containerClass,
          "flex items-center justify-center text-muted-foreground/60"
        )}
        aria-label="Loading cover image"
      >
        <Loader2 className="size-1/4 max-h-8 max-w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <img src={objectUrl} alt={alt} {...renderCroppedImageProps(cropView)} />
    </div>
  );
}

function renderCroppedImageProps(cropView: ImageCropView) {
  if (cropView === null) {
    return {
      className: "absolute inset-0 size-full object-cover",
    } as const;
  }
  const w = Math.max(0.0001, cropView.width);
  const h = Math.max(0.0001, cropView.height);
  return {
    style: {
      position: "absolute" as const,
      width: `${100 / w}%`,
      height: `${100 / h}%`,
      left: `${(-100 * cropView.x) / w}%`,
      top: `${(-100 * cropView.y) / h}%`,
      maxWidth: "none",
      maxHeight: "none",
    },
  };
}

// Deterministic HSL from the collection name. Saturation/lightness fixed so
// every tile reads as a "muted card background" rather than a riot of color;
// only the hue varies. Same name always yields the same color, so renames
// shift the tile (acceptable — it's a visual identity tied to the name).
function fallbackColor(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    // Empty name (shouldn't happen — name is required) → neutral muted.
    return "hsl(220 12% 88%)";
  }
  // FNV-1a 32-bit, plenty of distribution for short strings.
  let hash = 2166136261;
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 42% 78%)`;
}
