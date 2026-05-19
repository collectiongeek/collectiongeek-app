// Build-time version metadata for the frontend bundle. The three constants
// are replaced by Vite's `define:` substitution (see vite.config.ts) and end
// up as string literals in the compiled output.

export interface VersionInfo {
  version: string;
  commit: string;
  builtAt: string;
}

export const frontendVersion: VersionInfo = {
  version: __APP_VERSION__,
  commit: __APP_COMMIT__,
  builtAt: __APP_BUILT_AT__,
};
