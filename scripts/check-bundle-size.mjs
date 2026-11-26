#!/usr/bin/env node
/*
 * scripts/check-bundle-size.mjs — a size ceiling for the SPA bundle.
 *
 * WHY
 * ---
 * The repository had no bundle-size gate at all. Every other regression
 * had one: CSS debt, button sizes, z-index rungs, coverage floors. The
 * bundle was the one surface that could grow without limit and without a
 * red build — a dependency bump that doubled the entry chunk, a vendor
 * library that stopped being lazy, a barrel import that pulled a whole
 * editor into the initial payload.
 *
 * WHAT IS MEASURED
 * ----------------
 *   entryJsBytes   the initial JS payload (the `index-*.js` entry chunk).
 *                  This is what a first-time visitor downloads before the
 *                  app can render, so it is the number that matters most.
 *   totalJsBytes   every JS chunk, including the lazily loaded vendors.
 *   largestChunk   the single biggest chunk (plotly/mermaid/tldraw are
 *                  loaded on demand; a regression that pulls them into the
 *                  entry chunk shows up in entryJsBytes instead).
 *   totalCssBytes  every stylesheet.
 *
 * SIZES ARE COMPRESSED-SENSITIVE
 * ------------------------------
 * Both the raw and the gzip size of the entry chunk are measured: the raw
 * size is what the build produces, the gzip size is what the network
 * carries. Both are ceilings.
 *
 * WHY THIS IS A CEILING AND NOT A SHRINK-ONLY RATCHET
 * ---------------------------------------------------
 * The other guards in this repo freeze a count and may only go down. A
 * byte-exact ratchet on a content-hashed bundle is not actionable: the
 * chunk names change with every build, so "the same" bundle has different
 * numbers on a different machine. This guard therefore keeps an explicit
 * BUDGET with headroom, and `--update` is the explicit act that raises it
 * — the same discipline as the other guards, with the ratchet replaced by
 * a ceiling that a reviewer can see in the diff.
 *
 * Usage:  node scripts/check-bundle-size.mjs [--update]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = join(ROOT, 'scripts', 'bundle-size.baseline.json');
const DIST_ASSETS = join(ROOT, 'frontend', 'dist', 'assets');
const UPDATE = process.argv.includes('--update');

function listByExtension(ext) {
  try {
    return readdirSync(DIST_ASSETS, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(ext) &&
          !entry.name.endsWith('.gz') &&
          !entry.name.endsWith('.br'),
      )
      .map((entry) => entry.name);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function measure() {
  const jsFiles = listByExtension('.js');
  const cssFiles = listByExtension('.css');
  if (jsFiles.length === 0) return null;

  let totalJsBytes = 0;
  let largestChunkBytes = 0;
  let largestChunkName = '';
  let entryJsBytes = 0;
  let entryJsGzipBytes = 0;

  for (const name of jsFiles) {
    const path = join(DIST_ASSETS, name);
    /* Read each asset once so the size and gzip measurements refer to the
       same file contents rather than a path that could change between calls. */
    const content = readFileSync(path);
    totalJsBytes += content.length;
    if (content.length > largestChunkBytes) {
      largestChunkBytes = content.length;
      largestChunkName = name;
    }
    /* The entry chunk is what the browser downloads before the app can
     * render. Vite names it `index-<hash>.js`. */
    if (/^index-[^/]+\.js$/.test(name)) {
      entryJsBytes += content.length;
      entryJsGzipBytes += gzipSync(content).length;
    }
  }

  let totalCssBytes = 0;
  for (const name of cssFiles) {
    totalCssBytes += readFileSync(join(DIST_ASSETS, name)).length;
  }

  return {
    entryJsBytes,
    entryJsGzipBytes,
    totalJsBytes,
    largestChunkBytes,
    largestChunkName,
    totalCssBytes,
    jsChunkCount: jsFiles.length,
    cssFileCount: cssFiles.length,
  };
}

const measurement = measure();

if (!measurement) {
  console.log(
    'bundle size: frontend/dist/assets is empty — run the frontend build first.',
  );
  process.exit(1);
}

// The 44-byte bootstrap shim is not the actual cold entry payload.
// Recompute the static graph closure from the production HTML and disk bytes;
// do not rely on the generated entry flag or the filename convention.
const dist = join(ROOT, 'frontend', 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const graph = JSON.parse(readFileSync(join(dist, '.vite', 'entry-graph.json'), 'utf8'));
const chunks = new Map(graph.chunks.map(chunk => [chunk.file, chunk]));
const scripts = new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+\.js)"/g)].map(match => match[1]));
const styles = new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+\.css)"/g)].map(match => match[1]));
if (!scripts.size || !styles.size) throw new Error('Missing production HTML entry assets');
for (const file of scripts) {
  const chunk = chunks.get(file);
  if (!chunk) throw new Error('Missing entry graph chunk: ' + file);
  for (const dependency of chunk.imports) scripts.add(dependency);
}
const sumGzip = files => [...files].reduce((sum, file) => sum + gzipSync(readFileSync(join(dist, file))).length, 0);
const entry = {
  htmlGzipBytes: gzipSync(Buffer.from(html)).length,
  staticJsGzipBytes: sumGzip(scripts),
  linkedCssGzipBytes: sumGzip(styles),
};
for (const [key, value] of Object.entries(entry)) {
  if (graph.metrics[key] !== value) throw new Error('Entry graph disagrees with production bytes: ' + key);
}
const staticTotal = Object.values(entry).reduce((sum, bytes) => sum + bytes, 0);
console.log('Production static entry (gzip bytes): ' + JSON.stringify({ ...entry, staticTotal, staticJsChunks: scripts.size }));
// Same limits as performance-loading.spec.mjs, surfaced before the long E2E run.
const limits = { htmlGzipBytes: 19000, staticJsGzipBytes: 360000, linkedCssGzipBytes: 210000 };
for (const [key, limit] of Object.entries(limits)) {
  if (entry[key] >= limit) { console.error(key + ': ' + entry[key] + ' >= ' + limit); process.exitCode = 1; }
}
if (staticTotal >= 588000) { console.error('Static entry exceeds 588000 gzip bytes'); process.exitCode = 1; }
if (process.exitCode) process.exit(process.exitCode);

// Dist inventory: include nested assets and files outside assets/ (fonts,
// WASM, PDF support, etc.). Precompressed siblings are separate storage,
// not additional uncompressed payload; report them independently.
function inventory(directory, result = { rawBytes: 0, gzipSidecarBytes: 0, brotliSidecarBytes: 0, files: 0, byExtension: {} }) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, item.name);
    if (item.isDirectory()) { inventory(file, result); continue; }
    if (!item.isFile()) continue;
    const bytes = statSync(file).size;
    if (item.name.endsWith('.gz')) { result.gzipSidecarBytes += bytes; continue; }
    if (item.name.endsWith('.br')) { result.brotliSidecarBytes += bytes; continue; }
    const ext = item.name.includes('.') ? item.name.slice(item.name.lastIndexOf('.')).toLowerCase() : '(none)';
    result.rawBytes += bytes;
    result.files++;
    result.byExtension[ext] = (result.byExtension[ext] || 0) + bytes;
  }
  return result;
}
console.log('Production dist inventory (bytes): ' + JSON.stringify(inventory(dist)));

let budget = null;
try {
  budget = JSON.parse(readFileSync(BASELINE, 'utf8'));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

function writeBudget(next) {
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
}

if (!budget) {
  writeBudget({
    ...measurement,
    note: 'Ceiling for the built SPA bundle. Raise with --update in the same commit as an intentional growth.',
    generatedBy: 'check-bundle-size.mjs --update',
  });
  console.log(
    'bundle size: no budget found — wrote scripts/bundle-size.baseline.json from the current build.',
  );
  process.exit(0);
}

const ceilings = [
  ['entryJsBytes', 'initial JS payload'],
  ['entryJsGzipBytes', 'initial JS payload (gzip)'],
  ['totalJsBytes', 'total JS'],
  ['largestChunkBytes', 'largest chunk'],
  ['totalCssBytes', 'total CSS'],
];

const over = ceilings.filter(([key]) => measurement[key] > budget[key]);

if (UPDATE) {
  const raised = ceilings.filter(([key]) => measurement[key] > budget[key]);
  const next = { ...measurement };
  writeBudget({
    ...next,
    note: budget.note,
    generatedBy: 'check-bundle-size.mjs --update',
  });
  if (raised.length === 0) {
    console.log('bundle size: budget unchanged (the current build fits).');
  } else {
    console.log('bundle size: budget raised for:');
    for (const [key, label] of raised) {
      console.log(`  ${key} (${label}): ${budget[key]} -> ${measurement[key]} bytes`);
    }
  }
  process.exit(0);
}

if (over.length > 0) {
  console.error('bundle size check FAILED — the build is over budget:');
  for (const [key, label] of over) {
    console.error(`  ${key} (${label}): ${measurement[key]} bytes > budget ${budget[key]} bytes`);
  }
  console.error(
    'Reduce the payload, or run `node scripts/check-bundle-size.mjs --update` in the same commit as an intentional growth.',
  );
  process.exitCode = 1;
} else {
  const pct = (value, cap) => `${Math.round((value / cap) * 100)}%`;
  console.log(
    `bundle size check passed (entry ${measurement.entryJsBytes}/${budget.entryJsBytes} B ` +
      `(${pct(measurement.entryJsBytes, budget.entryJsBytes)}), ` +
      `total JS ${measurement.totalJsBytes}/${budget.totalJsBytes} B, ` +
      `CSS ${measurement.totalCssBytes}/${budget.totalCssBytes} B).`,
  );
}
