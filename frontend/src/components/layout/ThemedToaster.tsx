import { Toaster } from "sonner";
import { useTheme } from "@/lib/theme-provider";

/**
 * Sonner toaster, configured for mobile-first dismissal and placement.
 *
 * `bottom-center` keeps toasts out of the thumb's working area on a phone
 * and out of the way of whatever the user was just editing.
 * `duration={2000}` auto-dismisses fast so a toast can never block work for
 * long. Users dismiss earlier via the visible X (closeButton) or by swiping
 * the toast away (Sonner's native gesture). The previous "click anywhere on
 * the toast to dismiss" handler synthesized clicks on a hidden close button
 * — unreliable on touch because Sonner's swipe gesture preventDefaults
 * touchstart, so the click was never synthesized.
 */
export function ThemedToaster() {
  const { mode } = useTheme();

  return (
    <Toaster
      position="bottom-center"
      theme={mode}
      closeButton
      duration={2000}
    />
  );
}
