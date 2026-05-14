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

export function ThemePicker() {
  const { theme, mode, setTheme, setMode } = useTheme();
  const isDark = isDarkResolved(mode);

  return (
    <DropdownMenu>
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
          {(
            [
              { value: "light" as const, label: "Light", icon: Sun },
              { value: "dark" as const, label: "Dark", icon: Moon },
              { value: "system" as const, label: "System", icon: Monitor },
            ] as const
          ).map((opt) => {
            const Icon = opt.icon;
            const active = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMode(opt.value)}
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
          {themes.map((t) => {
            const active = theme === t.key;
            const swatches = previewSwatches(t, isDark);
            return (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(t.key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <div className="flex shrink-0 -space-x-1">
                  {swatches.map((color, i) => (
                    <span
                      key={i}
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
