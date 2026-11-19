#!/usr/bin/env node
/* scripts/check-i18n-locales.mjs — locale key conservation gate.
 *
 * The locale dictionaries live outside the runtime boot module:
 * English in src/i18n/en.ts, Chinese in src/i18n/zh.ts (its own async chunk).
 * Nothing enforced that both carry the same key set, so a key added to one
 * locale silently falls back — `t()` returns the raw key or the other
 * language, and the mismatch only shows up in the UI nobody screenshots.
 *
 * P_composer-primary-split hit this live: `chat.stop` had to be added by
 * hand to src/i18n.ts and src/i18n/zh.ts, with no check that would have
 * caught a half-done edit.
 *
 * Parsing is deliberately static. Importing the runtime module would execute its
 * browser side effects (displayPrefs import, window globals, document
 * writes), so the dictionaries are read as text instead. Keys must contain
 * a dot (chrome.voiceInput, chat.send) which excludes plain object keys
 * like "utf8" that appear elsewhere in these files.
 *
 * Usage: node scripts/check-i18n-locales.mjs [--suggest]
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EN_PATH = fileURLToPath(new URL('../src/i18n/en.ts', import.meta.url));
const ZH_PATH = fileURLToPath(new URL('../src/i18n/zh.ts', import.meta.url));
const [mode, ...extraArgs] = process.argv.slice(2);
if (extraArgs.length || (mode && mode !== '--suggest')) {
  console.error('Usage: node scripts/check-i18n-locales.mjs [--suggest]');
  process.exit(2);
}

/* A locale key is a dotted identifier in quotes followed by a colon.
 * Requiring the dot keeps this from matching unrelated quoted object keys.
 * Both quote styles are accepted because the formatter normalizes them. */
const KEY_RE = /(['"])([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)\1\s*:/g;

function readKeys(label, path) {
  const source = readFileSync(path, 'utf8');
  const keys = new Map([...source.matchAll(KEY_RE)].map((match) => [match[2], match.index]));
  if (keys.size === 0) {
    console.error(
      `${label}: parsed 0 locale keys from ${path} — refusing to gate on an empty parse`,
    );
    process.exit(1);
  }
  return { source, keys };
}

const en = readKeys('en', EN_PATH);
const zh = readKeys('zh', ZH_PATH);

function reportMissing(from, fromLocale, to, toLocale) {
  const missing = [...from.keys.keys()].filter((key) => !to.keys.has(key)).sort();
  if (missing.length === 0) return;

  console.error(`  ${missing.length} key(s) in ${fromLocale} but not ${toLocale}:`);
  for (const key of missing) {
    if (mode === '--suggest') {
      const line = from.source.slice(0, from.keys.get(key)).split('\n').length;
      console.error(
        `    src/i18n/${fromLocale}.ts:${line}: add a translation for '${key}' in src/i18n/${toLocale}.ts`,
      );
    } else {
      console.error(`    - ${key}`);
    }
  }
}

if (en.keys.size !== zh.keys.size || [...en.keys.keys()].some((key) => !zh.keys.has(key))) {
  console.error('i18n locale check FAILED');
  reportMissing(en, 'en', zh, 'zh');
  reportMissing(zh, 'zh', en, 'en');
  console.error('  Both src/i18n/en.ts and src/i18n/zh.ts must carry the same key set.');
  if (!mode) console.error('  Run npm run lint:i18n-locales -- --suggest for source locations.');
  process.exit(1);
}

console.log(`i18n locale check passed (${en.keys.size} keys in en and zh).`);
