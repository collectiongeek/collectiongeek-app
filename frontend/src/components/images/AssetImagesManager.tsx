import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { toast } from "sonner";
import { api } from "@convex-gen/api";
import type { Id } from "@convex-gen/dataModel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, ImagePlus, MoreHorizontal, Crop, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEncryption } from "@/lib/encryption-provider";
import {
  compressForUpload,
  encryptForUpload,
  encryptImageMetadata,
  uploadEncryptedBlob,
  DEFAULT_CROP_VIEW,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGES_PER_ASSET,
  type ImageMetadata,
} from "@/lib/images";
import {
  deleteImage,
  recordImage,
  requestImageUploadUrl,
  updateImage,
} from "@/lib/api";
import { EncryptedThumbnail } from "./EncryptedThumbnail";
import { CropViewDialog } from "./CropViewDialog";
import { DeleteImageConfirm } from "./DeleteImageConfirm";
import { AssetImagesLightbox } from "./AssetImagesLightbox";

interface Props {
  assetId: string;
}

export function AssetImagesManager({ assetId }: Props) {
  const { dek, workosUserId } = useEncryption();
  const { getAccessToken } = useAuth();
  const images = useQuery(api.images.listByAsset, {
    assetId: assetId as Id<"assets">,
  });
  const [uploading, setUploading] = useState(false);
  const [cropOpen, setCropOpen] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const count = images?.length ?? 0;
  const remaining = MAX_IMAGES_PER_ASSET - count;
  const full = remaining <= 0;

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!dek || !workosUserId) {
        toast.error("Encryption not ready");
        return;
      }
      if (acceptedFiles.length === 0) return;

      // Hard cap before we burn any CPU on compression.
      const accepted = acceptedFiles.slice(0, remaining);
      if (accepted.length < acceptedFiles.length) {
        toast.warning(
          `Only ${remaining} more image${remaining === 1 ? "" : "s"} can be added (limit ${MAX_IMAGES_PER_ASSET}).`
        );
      }

      setUploading(true);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Not authenticated");

        // Sequential uploads — keeps the UX predictable (a single spinner)
        // and avoids racing against the server-side image-cap check.
        for (const file of accepted) {
          try {
            const compressed = await compressForUpload(file);
            if (compressed.size > MAX_FILE_SIZE_BYTES) {
              toast.error(`"${file.name}" is too large after compression.`);
              continue;
            }
            const encrypted = await encryptForUpload(compressed, dek, workosUserId);

            const { uploadUrl } = await requestImageUploadUrl(token, assetId);
            const storageId = await uploadEncryptedBlob(uploadUrl, encrypted);

            const meta: ImageMetadata = {
              cropView: DEFAULT_CROP_VIEW,
              contentType: "image/jpeg",
              sizeBytes: compressed.size,
            };
            const metadataCiphertext = await encryptImageMetadata(meta, dek);

            await recordImage(token, assetId, {
              storageId,
              metadataCiphertext,
            });
          } catch (err) {
            console.error("Image upload failed:", err);
            const msg = err instanceof Error ? err.message : "Unknown error";
            if (msg.includes("Image limit reached")) {
              toast.error("Image limit reached.");
              break;
            }
            toast.error(`Couldn't upload "${file.name}".`);
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [dek, workosUserId, getAccessToken, assetId, remaining]
  );

  const { getRootProps, getInputProps, isDragActive, open: openPicker } =
    useDropzone({
      onDrop,
      accept: { "image/*": [] },
      maxFiles: MAX_IMAGES_PER_ASSET,
      disabled: uploading || full,
      noClick: true, // we use an explicit "Add images" button
      noKeyboard: true,
    });

  async function handleSetPrimary(imageId: string) {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await updateImage(token, assetId, imageId, { setPrimary: true });
    } catch (err) {
      console.error("Set primary failed:", err);
      toast.error("Failed to set primary image");
    }
  }

  async function handleDelete(imageId: string) {
    setDeleteOpen(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await deleteImage(token, assetId, imageId);
      toast.success("Image deleted");
    } catch (err) {
      console.error("Image delete failed:", err);
      toast.error("Failed to delete image");
    }
  }

  // Drag-and-drop target. Wraps both the grid and the empty state so the
  // user can drop a file anywhere in the section.
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Images
        </h2>
        <span className="text-xs text-muted-foreground">
          {count} / {MAX_IMAGES_PER_ASSET}
        </span>
      </div>

      <div
        {...getRootProps()}
        className={cn(
          "rounded-xl border-2 border-dashed p-4 transition-colors",
          isDragActive && !full
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/20"
        )}
      >
        <input {...getInputProps()} />

        {images === undefined ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ImagePlus className="size-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No images yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Drag photos here or pick from your device. Up to{" "}
              {MAX_IMAGES_PER_ASSET} images.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={openPicker}
              disabled={uploading || full}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              Add images
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {images.map((image, index) => (
                <ImageTile
                  key={image._id}
                  image={image}
                  onOpen={() => setLightboxIndex(index)}
                  onCrop={() => setCropOpen(image._id)}
                  onSetPrimary={() => handleSetPrimary(image._id)}
                  onAskDelete={() => setDeleteOpen(image._id)}
                />
              ))}
            </div>
            <div
              className={cn(
                "flex items-center justify-between transition-opacity",
                full && "opacity-60"
              )}
            >
              <p className="text-xs text-muted-foreground">
                {full
                  ? `Image limit reached (${MAX_IMAGES_PER_ASSET}). Delete one to add another.`
                  : "Drag photos here, or use the button to pick."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openPicker}
                disabled={uploading || full}
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                Add images
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs are rendered outside the dropzone so an open dialog doesn't
          intercept drop events. */}
      {images?.map((image) =>
        cropOpen === image._id ? (
          <CropViewDialog
            key={`crop-${image._id}`}
            open
            onOpenChange={(o) => setCropOpen(o ? image._id : null)}
            image={image}
            onSave={async (metadataCiphertext) => {
              const token = await getAccessToken();
              if (!token) throw new Error("Not authenticated");
              await updateImage(token, assetId, image._id, {
                metadataCiphertext,
              });
            }}
          />
        ) : null
      )}
      <DeleteImageConfirm
        open={deleteOpen !== null}
        onOpenChange={(o) => !o && setDeleteOpen(null)}
        onConfirm={() => deleteOpen && handleDelete(deleteOpen)}
      />
      {images && lightboxIndex !== null && (
        <AssetImagesLightbox
          images={images}
          startIndex={lightboxIndex}
          open
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

interface TileProps {
  image: {
    _id: string;
    storageId: string;
    storageUrl: string | null;
    metadataCiphertext: string;
    isPrimary: boolean;
  };
  onOpen: () => void;
  onCrop: () => void;
  onSetPrimary: () => void;
  onAskDelete: () => void;
}

function ImageTile({
  image,
  onOpen,
  onCrop,
  onSetPrimary,
  onAskDelete,
}: TileProps) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
      {/* The whole tile is clickable to open the lightbox. The kebab menu
          and Primary badge layer above as siblings with their own click
          handlers; the button below is the actual hit target so keyboard
          focus + screen-reader announcement work for free. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open image"
        className="absolute inset-0 z-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
      >
        <EncryptedThumbnail
          image={image}
          size="lg"
          className="size-full rounded-none"
        />
      </button>
      {image.isPrimary && (
        <div className="pointer-events-none absolute left-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium shadow-sm">
          <Star className="inline size-3 fill-current" /> Primary
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 size-7 bg-background/80 hover:bg-background"
            aria-label="Image actions"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!image.isPrimary && (
            <DropdownMenuItem onClick={onSetPrimary}>
              <Star className="size-4" />
              Set as primary
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onCrop}>
            <Crop className="size-4" />
            Crop view
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onAskDelete}>
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
