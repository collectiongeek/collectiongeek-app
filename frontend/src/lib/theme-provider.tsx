import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "@convex-gen/api";
import { updateTheme as apiUpdateTheme } from "@/lib/api";
import {
  DEFAULT_THEME_KEY,
  DEFAULT_THEME_MODE,
  googleFonts,
  themeByKey,
  type ThemeMode,
} from "@/lib/themes";

const STORAGE_KEY_THEME = "cg.theme";
const STORAGE_KEY_MODE = "cg.themeMode";

const loadedFonts = new Set<string>();

function loadFontFamily(family: string) {
  if (!googleFonts.has(family) || loadedFonts.has(family)) return;
  loadedFonts.add(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`;
  // If the request fails (offline, blocked, etc.) the CSS var's fallback chain
  // takes over so the page still renders. Log so devs see the failure.
  link.onerror = () => {
    console.warn(`Failed to load Google Font "${family}"`);
  };
  document.head.appendChild(link);
}

function firstFamily(value: string | undefined): string | null {
  if (!value) return null;
  const first = value.split(",")[0].trim().replace(/^["']|["']$/g, "");
  return first || null;
}

function applyTheme(key: string, mode: ThemeMode) {
  const theme = themeByKey[key] ?? themeByKey[DEFAULT_THEME_KEY];
  const root = document.documentElement;

  const isDark =
    mode === "dark" ||
    (mode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);

  const vars = { ...theme.shared, ...(isDark ? theme.dark : theme.light) };
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(`--${k}`, v);
  }

  for (const k of ["font-sans", "font-serif", "font-mono"] as const) {
    const fam = firstFamily(vars[k]);
    if (fam) loadFontFamily(fam);
  }
}

function readStoredMode(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY_MODE);
  return v === "light" || v === "dark" || v === "system"
    ? v
    : DEFAULT_THEME_MODE;
}

function readStoredTheme(): string {
  const v = localStorage.getItem(STORAGE_KEY_THEME);
  return v && themeByKey[v] ? v : DEFAULT_THEME_KEY;
}

interface ThemeContextValue {
  theme: string;
  mode: ThemeMode;
  setTheme: (key: string) => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Co-located with ThemeProvider for cohesion; the file is small. Splitting
// would gain perfect Fast Refresh at the cost of an extra file for one hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, getAccessToken } = useAuth();
  const convexUser = useQuery(api.users.getUser);

  const [theme, setThemeState] = useState<string>(readStoredTheme);
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);

  // Server is source of truth across devices. When Convex returns a value
  // that differs from local state (e.g. user changed it on another device),
  // adopt it. This is a legitimate "sync external system into React state"
  // use of useEffect — the only render-time alternative would lose the
  // user's ability to make optimistic local picks.
  useEffect(() => {
    if (!convexUser) return;
    if (convexUser.theme && themeByKey[convexUser.theme]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeState(convexUser.theme);
      localStorage.setItem(STORAGE_KEY_THEME, convexUser.theme);
    }
    if (convexUser.themeMode) {
      setModeState(convexUser.themeMode);
      localStorage.setItem(STORAGE_KEY_MODE, convexUser.themeMode);
    }
    // Deps are the primitive theme/mode values, not the convexUser object
    // itself, so we don't re-run on identity-only re-emits from Convex.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convexUser?.theme, convexUser?.themeMode]);

  useEffect(() => {
    applyTheme(theme, mode);
  }, [theme, mode]);

  // Track OS light/dark changes while mode is "system".
  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(theme, mode);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme, mode]);

  const persist = useCallback(
    async (patch: { theme?: string; themeMode?: ThemeMode }) => {
      if (!user) return;
      try {
        const token = await getAccessToken();
        if (!token) return;
        await apiUpdateTheme(token, patch);
      } catch (err) {
        // Best-effort: local + localStorage already updated, so the user keeps
        // their pick in-session. Log so devs can spot persistent sync issues.
        console.warn("Failed to persist theme preference:", err);
      }
    },
    [user, getAccessToken]
  );

  const setTheme = useCallback(
    (key: string) => {
      if (!themeByKey[key]) return;
      setThemeState(key);
      localStorage.setItem(STORAGE_KEY_THEME, key);
      void persist({ theme: key });
    },
    [persist]
  );

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      localStorage.setItem(STORAGE_KEY_MODE, next);
      void persist({ themeMode: next });
    },
    [persist]
  );

  return (
    <ThemeContext.Provider value={{ theme, mode, setTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
