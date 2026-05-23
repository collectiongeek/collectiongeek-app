import { useEffect, useRef, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEncryption } from "@/lib/encryption-provider";
import {
  decryptImageMetadata,
  getDecryptedImageUrl,
  DEFAULT_CROP_VIEW,
  type ImageCropView,
} from "@/lib/images";

interface ImageInput {
  _id: string;
  storageId: string;
  storageUrl: string | null;
  metadataCiphertext: string;
}

interface Props {
  image: ImageInput | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
  alt?: string;
}

const sizeClasses: Record<NonNullable<Props["size"]>, string> = {
  sm: "size-12",
  md: "size-24",
  lg: "size-40",
};

export function EncryptedThumbnail({
  image,
  size = "sm",
  className,
  alt = "",
}: Props) {
  const { dek } = useEncryption();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [cropView, setCropView] = useState<ImageCropView>(DEFAULT_CROP_VIEW);
  const [failed, setFailed] = useState(false);
  // Track the storageId the current effect is loading for, so we don't
  // race when the image prop changes mid-flight.
  const loadingForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!image || !image.storageUrl || !dek) {
      // Clearing in response to a missing input is valid; the lint rule
      // would prefer a render-time check but that doesn't compose with
      // the async-fetch path below.
      // Also clear loadingForRef so a still-pending decrypt from the
      // PREVIOUS render can't pass its `sid === loadingForRef.current`
      // gate and write a stale URL into state.
      loadingForRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setObjectUrl(null);
      setCropView(DEFAULT_CROP_VIEW);
      setFailed(false);
      return;
    }
    const sid = image.storageId;
    loadingForRef.current = sid;

    // Crop view is decrypted independently of bytes — it's a much smaller
    // payload and can land first to avoid a default-then-jump on render.
    decryptImageMetadata(image.metadataCiphertext, dek)
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

    getDecryptedImageUrl(sid, image.storageUrl, dek)
      .then((url) => {
        if (loadingForRef.current !== sid) return;
        setObjectUrl(url);
      })
      .catch((err) => {
        if (loadingForRef.current !== sid) return;
        console.warn("Thumbnail decrypt failed:", err);
        setFailed(true);
      });
  }, [image, dek]);

  const containerClass = cn(
    "relative overflow-hidden rounded-md bg-muted shrink-0",
    sizeClasses[size],
    className
  );

  if (!image) {
    return (
      <div
        className={cn(
          containerClass,
          "flex items-center justify-center text-muted-foreground/60"
        )}
        aria-hidden
      >
        <ImageOff className="size-1/2" />
      </div>
    );
  }

  if (failed) {
    return (
      <div
        className={cn(
          containerClass,
          "flex items-center justify-center text-muted-foreground/60"
        )}
        aria-label="Image failed to load"
      >
        <ImageOff className="size-1/2" />
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div
        className={cn(
          containerClass,
          "flex items-center justify-center text-muted-foreground/60"
        )}
        aria-label="Loading image"
      >
        <Loader2 className="size-1/3 animate-spin" />
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <img src={objectUrl} alt={alt} {...renderCroppedImageProps(cropView)} />
    </div>
  );
}

// Build the className + style for the <img> inside the (square) thumbnail.
// When cropView is null the image cover-fits the container — same as a
// plain avatar. When a CropRegion is set, position the image absolutely
// so the requested region exactly fills the container:
//
//   width%  = 100 / w     height% = 100 / h
//   left%   = -100·x / w   top%    = -100·y / h
//
// Worked example: image 4000×3000, crop 1000×1000 at (1500, 1000).
// Normalized x≈0.375, y≈0.333, w=0.25, h≈0.333. Result: image rendered
// at 400% × 300% of container, positioned at (-150%, -100%). The
// container window (0..100%) exposes natural pixels 1500..2500
// horizontally and 1000..2000 vertically — exactly the requested crop.
function renderCroppedImageProps(cropView: ImageCropView) {
  if (cropView === null) {
    return {
      className: "absolute inset-0 size-full object-cover",
    } as const;
  }
  // Defensive floor against a corrupted (zero-width) blob — Math.max
  // keeps the division finite. A zero crop dimension would be a
  // ciphertext-shape failure, not a normal write path, but we don't
  // want NaN positioning if it ever happens.
  const w = Math.max(0.0001, cropView.width);
  const h = Math.max(0.0001, cropView.height);
  return {
    // maxWidth/maxHeight: "none" overrides Tailwind preflight's
    // `img { max-width: 100% }`, which would otherwise clip the
    // intentionally-oversized image back to the container.
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
