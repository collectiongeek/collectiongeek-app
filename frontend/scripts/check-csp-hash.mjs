// Guards the SHA-256 hash hardcoded in nginx.conf's Content-Security-Policy
// against drifting away from the inline <script> in index.html.
//
// If someone edits the pre-paint theme-detection script without recomputing
// the hash, the production CSP will refuse the script and the app will fail
// to apply the dark-mode class on first paint — visible as a light-mode
// flash and a CSP violation in the console. This catches that before merge.
//
// Wired up via `prebuild` in package.json so every build runs it, locally
// and in CI. Exit code 1 fails the build with the corrected hash printed,
// ready to paste into nginx.conf.

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const htmlPath = resolve(root, "index.html");
const confPath = resolve(root, "nginx.conf");

// Fail closed: if either input is missing, the guard can't do its job and
// the build shouldn't proceed under the assumption that the CSP is fine. A
// renamed file or a misconfigured checkout should fail loudly, not silently
// disable the check.
if (!existsSync(htmlPath) || !existsSync(confPath)) {
  console.error(
    `[csp-hash] cannot verify CSP hash — expected both ${htmlPath} and ${confPath} to exist.`
  );
  process.exit(1);
}

const html = readFileSync(htmlPath, "utf8");
const conf = readFileSync(confPath, "utf8");

// The pre-paint theme script is the only inline <script> in index.html (i.e.
// the only <script> without a src attribute). If a second inline script is
// added later, this regex picks the first one — extend or refactor at that
// point.
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) {
  console.error("[csp-hash] no inline <script> found in index.html");
  process.exit(1);
}

const expected = createHash("sha256").update(match[1]).digest("base64");
const expectedDirective = `sha256-${expected}`;

if (!conf.includes(expectedDirective)) {
  console.error("\n[csp-hash] CSP hash drift detected.\n");
  console.error("  Inline <script> in index.html currently hashes to:");
  console.error(`    '${expectedDirective}'\n`);
  console.error(
    "  Update the script-src directive in frontend/nginx.conf so it includes"
  );
  console.error(
    "  this hash, then re-run the build. (See the comment block at the top"
  );
  console.error("  of nginx.conf for the recompute recipe.)\n");
  process.exit(1);
}

console.log(`[csp-hash] OK — '${expectedDirective}'`);
