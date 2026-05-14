import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme-provider";
import { themes, type ThemeMode } from "@/lib/themes";
import { cn } from "@/lib/utils";

// Show the swatch colors for the user's CURRENT mode (light vs dark) so the
// preview reflects what they'll actually see.
function previewSwatches(
  theme: (typeof themes)[number],
  isDark: boolean
): string[] {
  const vars = isDark ? theme.dark : theme.light;
  return [vars.primary, vars.accent, vars.background, vars.foreground].filter(
    Boolean
  );
}

function isDarkResolved(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

// Resolves an arrow/Home/End key press to the next index inside a radio group.
// Returns null for keys we don't handle so the event keeps propagating.
function nextRadioIndex(
  key: string,
  current: number,
  count: number,
  opts: { orientation: "horizontal" | "vertical"; wrap: boolean }
): number | null {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const nextKey = opts.orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
  const prevKey = opts.orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
  let target: number;
  if (key === nextKey) target = current + 1;
  else if (key === prevKey) target = current - 1;
  else return null;
  if (opts.wrap) return (target + count) % count;
  return target >= 0 && target < count ? target : null;
}

const APPEARANCE_OPTIONS = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
  { value: "system" as const, label: "System", icon: Monitor },
];

export function ThemePicker() {
  const { theme, mode, setTheme, setMode } = useTheme();
  const isDark = isDarkResolved(mode);

  // Controlled open state so we can move focus into our custom radios when
  // the menu opens — Radix DropdownMenu has no onOpenAutoFocus hook and its
  // default behavior tries to focus a MenuItem (we have none).
  const [open, setOpen] = useState(false);

  // Refs let us programmatically focus the next radio after an arrow key.
  const appearanceRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const themeRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const appearanceIndex = APPEARANCE_OPTIONS.findIndex((o) => o.value === mode);
  const themeIndex = themes.findIndex((t) => t.key === theme);

  useEffect(() => {
    if (!open) return;
    // Wait one frame so the dropdown content has mounted before we focus.
    const id = requestAnimationFrame(() => {
      const idx = appearanceIndex >= 0 ? appearanceIndex : 0;
      appearanceRefs.current[idx]?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, appearanceIndex]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme">
          <Palette className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        <div
          className="grid grid-cols-3 gap-1 px-1 pb-1.5"
          role="radiogroup"
          aria-label="Appearance mode"
        >
          {APPEARANCE_OPTIONS.map((opt, i) => {
            const Icon = opt.icon;
            const active = mode === opt.value;
            return (
              <button
                key={opt.value}
                ref={(el) => {
                  appearanceRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active || (appearanceIndex === -1 && i === 0) ? 0 : -1}
                onClick={() => setMode(opt.value)}
                onKeyDown={(e) => {
                  // Cross to Theme group on ArrowDown or Tab — Appearance is
                  // a row, Theme is the next stacked section.
                  if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const idx = themeIndex >= 0 ? themeIndex : 0;
                    themeRefs.current[idx]?.focus();
                    return;
                  }
                  const next = nextRadioIndex(
                    e.key,
                    i,
                    APPEARANCE_OPTIONS.length,
                    { orientation: "horizontal", wrap: true }
                  );
                  if (next === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setMode(APPEARANCE_OPTIONS[next].value);
                  appearanceRefs.current[next]?.focus();
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {opt.label}
              </button>
            );
          })}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Theme
        </DropdownMenuLabel>
        <div
          className="max-h-72 overflow-y-auto px-1 pb-1"
          role="radiogroup"
          aria-label="Theme selection"
        >
          {themes.map((t, i) => {
            const active = theme === t.key;
            const swatches = previewSwatches(t, isDark);
            return (
              <button
                key={t.key}
                ref={(el) => {
                  themeRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active || (themeIndex === -1 && i === 0) ? 0 : -1}
                onClick={() => setTheme(t.key)}
                onKeyDown={(e) => {
                  // Cross back up to Appearance group: ArrowUp from the top
                  // row, or Shift+Tab from anywhere (so Tab navigation
                  // always reaches the other group instead of closing the
                  // menu via Radix's default).
                  if (
                    (e.key === "ArrowUp" && i === 0) ||
                    (e.key === "Tab" && e.shiftKey)
                  ) {
                    e.preventDefault();
                    e.stopPropagation();
                    const idx = appearanceIndex >= 0 ? appearanceIndex : 0;
                    appearanceRefs.current[idx]?.focus();
                    return;
                  }
                  const next = nextRadioIndex(e.key, i, themes.length, {
                    orientation: "vertical",
                    wrap: false,
                  });
                  if (next === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setTheme(themes[next].key);
                  const target = themeRefs.current[next];
                  target?.focus();
                  // Scrollable list — keep the focused row in view.
                  target?.scrollIntoView({ block: "nearest" });
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <div className="flex shrink-0 -space-x-1">
                  {swatches.map((color, j) => (
                    <span
                      key={j}
                      className="block size-3.5 rounded-full border border-border/40 ring-1 ring-background"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <span className="flex-1 text-left">{t.label}</span>
                {active && <Check className="size-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
