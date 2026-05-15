import { useEffect } from "react";
import { Toaster } from "sonner";
import { useTheme } from "@/lib/theme-provider";

/**
 * Wraps Sonner's Toaster with two behaviors that aren't built in:
 *
 * 1. The current theme mode is threaded through so the panel inherits
 *    light/dark from the app rather than defaulting to its own palette.
 *    "system" is resolved by Sonner itself.
 *
 * 2. A delegated document-level click handler synthesizes the missing
 *    "click anywhere on the toast to dismiss" behavior by programmatically
 *    triggering the (visually-hidden) close button. Clicks on the toast's
 *    own controls (close button, action button, cancel button) are passed
 *    through so their native behavior still fires.
 */
export function ThemedToaster() {
  const { mode } = useTheme();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const toast = target.closest("[data-sonner-toast]");
      if (!toast) return;
      if (
        target.closest("[data-close-button], [data-button], [data-cancel]")
      ) {
        return;
      }
      const closeBtn = toast.querySelector<HTMLButtonElement>(
        "[data-close-button]"
      );
      closeBtn?.click();
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return (
    <Toaster
      position="top-right"
      theme={mode}
      closeButton
      toastOptions={{ className: "cursor-pointer" }}
    />
  );
}
