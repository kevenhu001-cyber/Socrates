import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const DIST = resolve('dist');
const LIMITS = {
  js: 800 * 1024,
  css: 225 * 1024,
};

const html = await readFile(resolve(DIST, 'index.html'), 'utf8');
const refs = new Set();

for (const match of html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)=["']([^"']+)["'][^>]*>/g)) {
  const ref = match[1].replace(/^\.\//, '').replace(/^\//, '');
  if (ref.startsWith('assets/') && (ref.endsWith('.js') || ref.endsWith('.css'))) refs.add(ref);
}

const totals = { js: 0, css: 0 };
const rows = [];
for (const ref of [...refs].sort()) {
  const kind = ref.endsWith('.js') ? 'js' : 'css';
  const gzipBytes = gzipSync(await readFile(resolve(DIST, ref))).byteLength;
  totals[kind] += gzipBytes;
  rows.push(`${kind.toUpperCase().padEnd(3)} ${(gzipBytes / 1024).toFixed(1).padStart(7)} KiB  ${ref}`);
}

console.log(rows.join('\n'));
for (const kind of ['js', 'css']) {
  console.log(`${kind.toUpperCase()} initial gzip: ${(totals[kind] / 1024).toFixed(1)} KiB / ${(LIMITS[kind] / 1024).toFixed(0)} KiB`);
}

const failures = Object.entries(LIMITS).filter(([kind, limit]) => totals[kind] > limit);
if (failures.length) {
  for (const [kind, limit] of failures) {
    console.error(`${kind.toUpperCase()} budget exceeded by ${((totals[kind] - limit) / 1024).toFixed(1)} KiB`);
  }
  process.exitCode = 1;
}
