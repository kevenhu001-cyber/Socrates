// scripts/check-packages-dom.mjs
// Guard for shared packages: they must stay DOM-free so the SPA can render
// them through react-native-web.
// Bans: document, window, localStorage, react-dom, and direct DOM APIs in
// packages/{core,contracts,theme,ui} src.
// UI package is allowed to use react-native only (no react-dom / DOM).
// Usage: node scripts/check-packages-dom.mjs [--update]
// Exit 1 on violation with file:line.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PACKAGES = ['core', 'contracts', 'theme', 'ui'];
const BANNED = [
  // Property access only (`.<ident>`) — prose like "a professional
  // document. You use …" in content strings must not trip the gate.
  /\bdocument\.[A-Za-z_$]/,
  /\bwindow\.[A-Za-z_$]/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /from\s+['"]react-dom['"]/,
  /require\(\s*['"]react-dom['"]\s*\)/,
  /\bgetElementById\b/,
  /\bquerySelector\b/,
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(e) && !/\.test\./.test(e)) out.push(p);
  }
  return out;
}

let violations = [];
for (const pkg of PACKAGES) {
  const src = join(ROOT, 'packages', pkg, 'src');
  for (const file of walk(src)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
      for (const re of BANNED) {
        if (re.test(line)) violations.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
}

// Allowlist: none currently. Host adapters may use localStorage, packages/ may not.
if (violations.length) {
  console.error('[check-packages-dom] DOM/ReactDOM usage in shared packages:');
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    '\nPlatform differences belong in host adapters (e.g. frontend/src/react/rn/), never in packages/.',
  );
  process.exit(1);
}
console.log('[check-packages-dom] OK — packages/ DOM-free.');
