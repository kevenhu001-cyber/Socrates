#!/usr/bin/env node
/* scripts/check-i18n-locales.mjs — locale key conservation gate.
 *
 * The locale dictionaries live outside the runtime boot module:
 * English in src/i18n/en.js, Chinese in src/i18n/zh.js (its own async chunk).
 * Nothing enforced that both carry the same key set, so a key added to one
 * locale silently falls back — `t()` returns the raw key or the other
 * language, and the mismatch only shows up in the UI nobody screenshots.
 *
 * P_composer-primary-split hit this live: `chat.stop` had to be added by
 * hand to src/i18n.js and src/i18n/zh.js, with no check that would have
 * caught a half-done edit.
 *
 * Parsing is deliberately static. Importing the runtime module would execute its
 * browser side effects (displayPrefs import, window globals, document
 * writes), so the dictionaries are read as text instead. Keys must contain
 * a dot (chrome.voiceInput, chat.send) which excludes plain object keys
 * like "utf8" that appear elsewhere in these files.
 *
 * Usage: node scripts/check-i18n-locales.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EN_PATH = fileURLToPath(new URL('../src/i18n/en.js', import.meta.url));
const ZH_PATH = fileURLToPath(new URL('../src/i18n/zh.js', import.meta.url));

/* A locale key is a dotted identifier in quotes followed by a colon.
 * Requiring the dot keeps this from matching unrelated quoted object keys. */
const KEY_RE = /"([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)"\s*:/g;

function readKeys(label, path) {
  const source = readFileSync(path, 'utf8');
  const keys = new Set();
  let match;
  while ((match = KEY_RE.exec(source)) !== null) keys.add(match[1]);
  if (keys.size === 0) {
    console.error(`${label}: parsed 0 locale keys from ${path} — refusing to gate on an empty parse`);
    process.exit(1);
  }
  return keys;
}

const en = readKeys('en', EN_PATH);
const zh = readKeys('zh', ZH_PATH);

const missingInZh = [...en].filter((k) => !zh.has(k)).sort();
const missingInEn = [...zh].filter((k) => !en.has(k)).sort();

if (missingInZh.length || missingInEn.length) {
  console.error('i18n locale check FAILED');
  if (missingInZh.length) {
    console.error(`  ${missingInZh.length} key(s) in en but not zh:`);
    for (const k of missingInZh) console.error(`    - ${k}`);
  }
  if (missingInEn.length) {
    console.error(`  ${missingInEn.length} key(s) in zh but not en:`);
    for (const k of missingInEn) console.error(`    - ${k}`);
  }
  console.error('  Both src/i18n/en.js and src/i18n/zh.js must carry the same key set.');
  process.exit(1);
}

console.log(`i18n locale check passed (${en.size} keys in en and zh).`);
