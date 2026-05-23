import { useEffect, useMemo, useState } from "react";
import Lightbox, { type SlideImage } from "yet-another-react-lightbox";
import Counter from "yet-another-react-lightbox/plugins/counter";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";
import "./AssetImagesLightbox.css";
import { Loader2, ImageOff } from "lucide-react";
import { useEncryption } from "@/lib/encryption-provider";
import { getDecryptedImageUrl } from "@/lib/images";

// The lightbox shows the **uncropped** image — no transform, no
// object-cover. The crop view is a card-only affordance; opening the
// gallery shows what the file actually contains.
//
// yet-another-react-lightbox handles the gestures the spec calls for:
// arrows + counter + ESC on desktop, swipe-left/right + pull-down-to-close
// on touch devices. We just need to feed it decrypted object URLs.

interface InputImage {
  _id: string;
  storageId: string;
  storageUrl: string | null;
}

interface Props {
  images: InputImage[];
  startIndex: number;
  open: boolean;
  onClose: () => void;
}

// Tracks the resolved object URL per storageId for this lightbox session.
// `null` = error decrypting that slide; `undefined` = still loading.
type SlideState = Record<string, string | null | undefined>;

export function AssetImagesLightbox({
  images,
  startIndex,
  open,
  onClose,
}: Props) {
  const { dek } = useEncryption();
  const [slides, setSlides] = useState<SlideState>({});

  // When the lightbox opens (or the underlying images change while open),
  // kick off decrypts for every slide. `getDecryptedImageUrl` is cached,
  // so already-loaded thumbnails resolve synchronously on the next tick.
  useEffect(() => {
    if (!open || !dek) return;
    let cancelled = false;
    // Reset to "all loading" state when the lightbox (re-)opens so a
    // stale URL from a previous session doesn't briefly show.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlides({});
    for (const image of images) {
      if (!image.storageUrl) {
        if (!cancelled) {
          setSlides((s) => ({ ...s, [image.storageId]: null }));
        }
        continue;
      }
      getDecryptedImageUrl(image.storageId, image.storageUrl, dek)
        .then((url) => {
          if (cancelled) return;
          setSlides((s) => ({ ...s, [image.storageId]: url }));
        })
        .catch((err) => {
          if (cancelled) return;
          console.warn("Lightbox decrypt failed:", err);
          setSlides((s) => ({ ...s, [image.storageId]: null }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, dek, images]);

  // yet-another-react-lightbox accepts a `src` per slide. We pass an empty
  // string for slides that haven't resolved yet and use the `render.slide`
  // hook to display a loader/error placeholder until the URL is ready.
  const lightboxSlides = useMemo<SlideImage[]>(
    () =>
      images.map((image) => {
        const resolved = slides[image.storageId];
        return {
          src: typeof resolved === "string" ? resolved : "",
          // Custom marker so render.slide can branch without re-running
          // the dictionary lookup. `unknown` instead of `any` keeps the
          // library's type narrowing honest.
          _state: resolved,
        } as SlideImage & { _state: string | null | undefined };
      }),
    [images, slides]
  );

  if (!open) return null;

  return (
    <Lightbox
      open={open}
      close={onClose}
      slides={lightboxSlides}
      index={startIndex}
      plugins={[Counter]}
      counter={{ container: { style: { top: 8, left: 8 } } }}
      // Disable controller animations beyond defaults — keeps the
      // "discreet" feel the spec calls for.
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      // Hide arrows entirely when there's nothing to navigate to.
      carousel={{ finite: true }}
      render={{
        slide: ({ slide }) => {
          const state = (slide as SlideImage & {
            _state: string | null | undefined;
          })._state;
          if (state === null) {
            return (
              <div className="flex flex-col items-center gap-2 text-white/80">
                <ImageOff className="size-10" />
                <span className="text-sm">Image failed to load</span>
              </div>
            );
          }
          if (typeof state !== "string") {
            return (
              <div className="text-white/80">
                <Loader2 className="size-8 animate-spin" />
              </div>
            );
          }
          // Display the **uncropped** decrypted image. The library
          // handles fit-to-viewport sizing.
          return (
            <img
              src={state}
              alt=""
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
              }}
              draggable={false}
            />
          );
        },
        // Hide prev/next chrome when there's only one image — keeps the
        // single-image case from looking dead-buttoned.
        buttonPrev: images.length > 1 ? undefined : () => null,
        buttonNext: images.length > 1 ? undefined : () => null,
      }}
    />
  );
}
