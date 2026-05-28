import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useEncryption } from "@/lib/encryption-provider";
import {
  decryptImageMetadata,
  encryptImageMetadata,
  fetchAndDecryptImage,
  type CropRegion,
  type ImageMetadata,
} from "@/lib/images";

// Smooths a number to 4 decimals before persisting. Avoids gigantic ratios
// like 0.4999999991 round-tripping through the ciphertext and bloating
// the encrypted payload.
function trim(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

interface ImageInput {
  storageId: string;
  storageUrl: string | null;
  metadataCiphertext: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: ImageInput;
  /** Aspect ratio for the crop box. 1 = square (asset thumbnails),
   *  16/9 = collection cover banner. Defaults to square. */
  aspect?: number;
  /** Dialog title — defaults to "Crop view" but callers can specialize
   *  ("Crop cover" for the collection variant). */
  title?: string;
  /** Helper text under the title. Defaults to the asset-image wording. */
  description?: string;
  /** Persist the new metadata ciphertext. Caller decides which API to
   *  hit (asset updateImage vs. collection updateCoverMetadata). Throw
   *  to surface a failure — the dialog shows a generic toast and stays
   *  open so the user can retry. */
  onSave: (metadataCiphertext: string) => Promise<void>;
  onSaved?: () => void;
}

export function CropViewDialog({
  open,
  onOpenChange,
  image,
  aspect = 1,
  title = "Crop view",
  description = "Adjust how this image appears on the asset card. The original file is unchanged.",
  onSave,
  onSaved,
}: Props) {
  const { dek } = useEncryption();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<ImageMetadata | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  // Captured via Cropper's onMediaLoaded — needed to normalize the crop
  // region (reported in natural-image pixels) into 0..1 focal coordinates.
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load the encrypted bytes + metadata when the dialog opens. We
  // deliberately re-fetch each time rather than cache — the cropper is
  // mounted only while the dialog is open, so this is fine.
  useEffect(() => {
    if (!open || !dek || !image.storageUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setObjectUrl(null);
      setMeta(null);
      setNaturalSize(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchAndDecryptImage(image.storageUrl, dek),
      decryptImageMetadata(image.metadataCiphertext, dek).catch(
        (): ImageMetadata => ({
          cropView: null,
          contentType: "image/jpeg",
          sizeBytes: 0,
        })
      ),
    ])
      .then(([{ objectUrl }, metadata]) => {
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setObjectUrl(objectUrl);
        setMeta(metadata);
        // The saved crop view (if any) is applied via the cropper's
        // `initialCroppedAreaPercentages` prop below — it back-computes
        // matching crop+zoom and fires our handlers. Start at (0, 0) / 1
        // so an image with no saved crop opens centered at default zoom.
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("Crop dialog load failed:", err);
        toast.error("Failed to load image");
        setLoading(false);
        onOpenChange(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, image.storageId, dek]);

  // Free the decrypted object URL when the dialog unmounts.
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedArea(croppedAreaPixels);
    },
    []
  );

  async function handleSave() {
    if (!dek || !meta || !croppedArea || !naturalSize || !image.storageUrl) {
      return;
    }
    setSaving(true);
    try {
      // Persist the crop region itself (normalized 0..1 against the natural
      // image), not a focal+zoom pair — the thumbnail can derive the
      // display transform from this alone without needing to know natural
      // dimensions at render time.
      const w = Math.max(1, naturalSize.width);
      const h = Math.max(1, naturalSize.height);
      const cropView: CropRegion = {
        x: trim(croppedArea.x / w),
        y: trim(croppedArea.y / h),
        width: trim(croppedArea.width / w),
        height: trim(croppedArea.height / h),
      };
      const nextMeta: ImageMetadata = { ...meta, cropView };
      const metadataCiphertext = await encryptImageMetadata(nextMeta, dek);

      await onSave(metadataCiphertext);
      toast.success("Crop saved");
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Crop save failed:", err);
      toast.error("Failed to save crop");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="relative h-72 w-full overflow-hidden rounded-md bg-muted">
          {loading || !objectUrl ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : (
            <Cropper
              image={objectUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              onMediaLoaded={({ naturalWidth, naturalHeight }) =>
                setNaturalSize({ width: naturalWidth, height: naturalHeight })
              }
              // Restores the previously saved crop view by back-computing
              // matching crop+zoom (react-easy-crop fires onCropChange /
              // onZoomChange to set them via our handlers). `undefined`
              // for "no saved crop" so the cropper opens centered.
              initialCroppedAreaPercentages={
                meta?.cropView
                  ? {
                      x: meta.cropView.x * 100,
                      y: meta.cropView.y * 100,
                      width: meta.cropView.width * 100,
                      height: meta.cropView.height * 100,
                    }
                  : undefined
              }
              minZoom={1}
              maxZoom={4}
              restrictPosition
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="zoom-range" className="text-sm">
            Zoom
          </Label>
          <input
            id="zoom-range"
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
            disabled={loading || !objectUrl}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || !croppedArea || !naturalSize}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
