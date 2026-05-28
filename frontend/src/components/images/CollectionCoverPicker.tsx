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
import {
  Crop,
  ImagePlus,
  Loader2,
  MoreHorizontal,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEncryption } from "@/lib/encryption-provider";
import {
  compressForUpload,
  DEFAULT_CROP_VIEW,
  encryptForUpload,
  encryptImageMetadata,
  MAX_FILE_SIZE_BYTES,
  uploadEncryptedBlob,
  type ImageMetadata,
} from "@/lib/images";
import {
  deleteCollectionCover,
  recordCollectionCover,
  requestCollectionCoverUploadUrl,
  updateCollectionCoverMetadata,
} from "@/lib/api";
import { CollectionCoverImage } from "./CollectionCoverImage";
import { CropViewDialog } from "./CropViewDialog";
import { DeleteImageConfirm } from "./DeleteImageConfirm";

interface Props {
  collectionId: string;
  /** Used by the fallback color when no cover is set, so the empty state
   *  doesn't look identical to other unset covers in the dashboard. */
  collectionName: string;
}

export function CollectionCoverPicker({ collectionId, collectionName }: Props) {
  const { dek, workosUserId } = useEncryption();
  const { getAccessToken } = useAuth();
  const cover = useQuery(api.images.getCoverByCollection, {
    collectionId: collectionId as Id<"collections">,
  });

  const [uploading, setUploading] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!dek || !workosUserId) {
        toast.error("Encryption not ready");
        return;
      }
      const file = acceptedFiles[0];
      if (!file) return;

      setUploading(true);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Not authenticated");

        const compressed = await compressForUpload(file);
        if (compressed.size > MAX_FILE_SIZE_BYTES) {
          toast.error("Image is too large after compression.");
          return;
        }
        const encrypted = await encryptForUpload(compressed, dek, workosUserId);

        const { uploadUrl } = await requestCollectionCoverUploadUrl(
          token,
          collectionId
        );
        const storageId = await uploadEncryptedBlob(uploadUrl, encrypted);

        // Reset to default crop on replace — the previous crop region was
        // computed against a different image and rarely makes sense to keep.
        // Users can re-crop via the menu.
        const meta: ImageMetadata = {
          cropView: DEFAULT_CROP_VIEW,
          contentType: "image/jpeg",
          sizeBytes: compressed.size,
        };
        const metadataCiphertext = await encryptImageMetadata(meta, dek);

        await recordCollectionCover(token, collectionId, {
          storageId,
          metadataCiphertext,
        });
        toast.success("Cover image updated");
      } catch (err) {
        console.error("Cover upload failed:", err);
        toast.error("Couldn't upload cover image.");
      } finally {
        setUploading(false);
      }
    },
    [dek, workosUserId, getAccessToken, collectionId]
  );

  const { getRootProps, getInputProps, isDragActive, open: openPicker } =
    useDropzone({
      onDrop,
      accept: { "image/*": [] },
      maxFiles: 1,
      multiple: false,
      disabled: uploading,
      noClick: true,
      noKeyboard: true,
    });

  async function handleRemove() {
    setRemoveOpen(false);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await deleteCollectionCover(token, collectionId);
      toast.success("Cover removed");
    } catch (err) {
      console.error("Cover delete failed:", err);
      toast.error("Failed to remove cover");
    }
  }

  const hasCover = cover != null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Cover image
        </h2>
        <span className="text-xs text-muted-foreground">
          Shown at the top of your collection.
        </span>
      </div>

      <div
        {...getRootProps()}
        className={cn(
          "rounded-xl border-2 border-dashed transition-colors overflow-hidden",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/20"
        )}
      >
        <input {...getInputProps()} />

        {cover === undefined ? (
          <div className="flex aspect-video w-full items-center justify-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : !hasCover ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center p-6 text-center">
            <ImagePlus className="size-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No cover yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Drag a photo here or pick from your device.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={openPicker}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              Add cover
            </Button>
          </div>
        ) : (
          <div className="relative">
            <CollectionCoverImage
              cover={cover}
              collectionName={collectionName}
              className="aspect-video w-full"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 size-8 bg-background/85 hover:bg-background"
                  aria-label="Cover actions"
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <MoreHorizontal className="size-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCropOpen(true)}>
                  <Crop className="size-4" />
                  Crop view
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openPicker} disabled={uploading}>
                  <RefreshCcw className="size-4" />
                  Replace
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setRemoveOpen(true)}>
                  <Trash2 className="size-4" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Dialogs rendered outside the dropzone so an open dialog can't
          intercept drop events. */}
      {hasCover && cropOpen && (
        <CropViewDialog
          open
          onOpenChange={setCropOpen}
          image={cover}
          aspect={16 / 9}
          title="Crop cover"
          description="Adjust the area shown at the top of your collection. The original image is unchanged."
          onSave={async (metadataCiphertext) => {
            const token = await getAccessToken();
            if (!token) throw new Error("Not authenticated");
            await updateCollectionCoverMetadata(token, collectionId, {
              metadataCiphertext,
            });
          }}
        />
      )}
      <DeleteImageConfirm
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        onConfirm={handleRemove}
      />
    </div>
  );
}
