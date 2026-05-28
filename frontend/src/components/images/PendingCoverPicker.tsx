import { useCallback, useEffect, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ImagePlus, Trash2 } from "lucide-react";

interface Props {
  file: File | null;
  onChange: (file: File | null) => void;
  /** Disables the dropzone (e.g. while the parent form is submitting). */
  disabled?: boolean;
}

// Cover picker for the create-collection flow. Holds nothing of its own —
// the parent owns the pending File and uploads it after the collection is
// created. Preview is a local object URL so we don't touch the network or
// the crypto pipeline until submit. No crop editor here on purpose: the
// crop dialog operates on already-encrypted server-side bytes, so cropping
// only becomes available once the cover exists (post-create, via Edit).
export function PendingCoverPicker({ file, onChange, disabled }: Props) {
  // Local object URL for the selected File. Memoized on the File identity
  // so it's stable across re-renders, and revoked on change/unmount via
  // the effect below so the blob doesn't pin memory when the user picks
  // a different file. (useMemo + useEffect cleanup, rather than
  // useState+useEffect, sidesteps the cascading-render lint rule.)
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const picked = acceptedFiles[0];
      if (picked) onChange(picked);
    },
    [onChange]
  );

  const { getRootProps, getInputProps, isDragActive, open: openPicker } =
    useDropzone({
      onDrop,
      accept: { "image/*": [] },
      maxFiles: 1,
      multiple: false,
      disabled,
      noClick: true,
      noKeyboard: true,
    });

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Cover image</span>
        <span className="text-xs text-muted-foreground">Optional</span>
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

        {!file || !previewUrl ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center p-6 text-center">
            <ImagePlus className="size-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No cover yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Drag a photo here or pick from your device. You can crop it
              after creating the collection.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={openPicker}
              disabled={disabled}
            >
              <ImagePlus className="size-4" />
              Add cover
            </Button>
          </div>
        ) : (
          <div className="relative">
            <img
              src={previewUrl}
              alt=""
              className="aspect-video w-full object-cover"
            />
            <div className="absolute right-2 top-2 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={openPicker}
                disabled={disabled}
                className="bg-background/85 hover:bg-background"
              >
                Replace
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => onChange(null)}
                disabled={disabled}
                aria-label="Remove cover"
                className="size-8 bg-background/85 hover:bg-background"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
