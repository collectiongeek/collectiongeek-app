import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:py-1 md:text-sm",
        // Strip the native number-input spinner arrows everywhere. No-op on
        // non-numeric inputs since the pseudo-elements don't exist.
        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className
      )}
      {...props}
    />
  );
}

// Reusable class string for native <select> elements that should visually match
// Input. The full Radix-based <Select> from select.tsx is preferable for new
// code, but several call sites use native <select> for simple option lists —
// keeping their sizing in one place avoids drift the next time the touch
// targets change.
export const nativeSelectClasses =
  "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:h-9 md:py-1 md:text-sm";

export { Input };
