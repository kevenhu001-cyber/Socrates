// scripts/archive/audit-window-bridges.mjs
// One-shot audit helper for the M5 window-bridge decommission. Lists every
// `window.X =` binding in windowExports.js and main.js, then cross-references
// each against `window.X` reads across the frontend source tree. Bindings with
// zero external readers (other than the binding site, e2e mocks, and the
// windowExports.js export list itself) are reported as candidates for removal.
//
// Run: `node scripts/archive/audit-window-bridges.mjs`
// This is a read-only diagnostic — it does not modify any files.

import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";

const BINDING_FILES = [
  "frontend/src/windowExports.js",
  "frontend/src/main.js",
];

const EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  "playwright-report",
  "test-results",
  ".git",
  "frontend/src/windowExports.js.bak",
]);

const EXCLUDE_FILES = new Set([
  // Audit must not be poisoned by its own output or by the diagnostic we are
  // running.
  "scripts/archive/audit-window-bridges.mjs",
]);

// Files where reads are intentional and should not count as "external" — the
// bridge contract is that the window globals exist for these readers.
const READER_ALLOWLIST = new Set([
  // e2e specs use window.* to poke at the running app — those reads prove
  // the bridge is real, not dead.
  "frontend/e2e/_helpers/mockAuthedApp.mjs",
  "frontend/e2e/_helpers/waitForAppShell.mjs",
  "frontend/e2e/_helpers/gotoAndSettle.mjs",
  // index.html inline event handlers — first batch used these as evidence.
  "frontend/index.html",
  // Legacy React compat bridge consumers in src/react/* are intentional.
  "frontend/src/react/legacy/gateway.ts",
  "frontend/src/extensions/context.ts",
]);

// ──────────────────────────────────────────────────────────────────────────
// Pass 1: collect bindings (window.X = …) from the two defined source files.
// ──────────────────────────────────────────────────────────────────────────
const bindingRe = /^\s*window\.([A-Za-z_$][\w$]*)\s*=/gm;
const bindings = new Map(); // name -> { file, line }

for (const rel of BINDING_FILES) {
  const abs = join(ROOT, rel);
  const text = await readFile(abs, "utf8");
  let m;
  bindingRe.lastIndex = 0;
  while ((m = bindingRe.exec(text)) !== null) {
    const name = m[1];
    // main.js has a few duplicate names; keep the first definition site.
    if (!bindings.has(name)) {
      const upto = text.slice(0, m.index).split(/\r?\n/);
      bindings.set(name, { file: rel, line: upto.length });
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Pass 2: walk the source tree and count reads for each binding name.
// ──────────────────────────────────────────────────────────────────────────
const reads = new Map(); // name -> Set<file>
const readRe = /\bwindow\.([A-Za-z_$][\w$]*)\b/g;

async function walk(dir) {
  for (const entry of await readdir(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    const s = await stat(p);
    if (s.isDirectory()) {
      await walk(p);
      continue;
    }
    if (!/\.(mjs|cjs|js|ts|tsx|jsx|html|vue)$/.test(entry)) continue;
    const rel = relative(ROOT, p).replaceAll("\\", "/");
    if (EXCLUDE_FILES.has(rel)) continue;
    if (rel.startsWith("dist/")) continue;
    const text = await readFile(p, "utf8");
    let m;
    readRe.lastIndex = 0;
    while ((m = readRe.exec(text)) !== null) {
      const name = m[1];
      if (!bindings.has(name)) continue;
      // skip the binding site itself
      if (rel === BINDING_FILES[0] || rel === BINDING_FILES[1]) {
        const lineno = text.slice(0, m.index).split(/\r?\n/).length;
        const def = bindings.get(name);
        if (def.file === rel && Math.abs(lineno - def.line) <= 1) continue;
      }
      if (!reads.has(name)) reads.set(name, new Set());
      reads.get(name).add(rel);
    }
  }
}

await walk(join(ROOT, "frontend"));

// ──────────────────────────────────────────────────────────────────────────
// Pass 3: split bindings into (dead, kept) and emit a report.
// ──────────────────────────────────────────────────────────────────────────
const dead = [];
const kept = [];
const sortedNames = [...bindings.keys()].sort();
for (const name of sortedNames) {
  const def = bindings.get(name);
  const readers = reads.get(name) || new Set();
  // Filter allowlisted readers — they prove the bridge is real, not dead.
  const external = [...readers].filter((r) => !READER_ALLOWLIST.has(r));
  if (external.length === 0) {
    dead.push({ name, def, readers: [...readers] });
  } else {
    kept.push({ name, def, readers: external });
  }
}

console.log(`Bindings: ${bindings.size} unique`);
console.log(`  external readers: ${kept.length}`);
console.log(`  dead candidates : ${dead.length}`);
console.log("");
console.log("=== DEAD (no external reader in src/, index.html, or e2e helpers) ===");
for (const d of dead) {
  console.log(`  ${d.name.padEnd(38)} ${d.def.file}:${d.def.line}`);
}
console.log("");
console.log("=== KEPT (still read) ===");
for (const k of kept) {
  console.log(`  ${k.name.padEnd(38)} readers=${k.readers.length}`);
}
