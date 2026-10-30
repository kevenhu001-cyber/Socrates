import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Mirrors `bundleToolRenderer` in apps/socrates-android/app/build.gradle.kts.
// The native Android build bundles the visualization renderer with plain
// esbuild, which cannot resolve Vite-only imports such as tldraw's `?url`
// fonts. This keeps a frontend change from breaking that build unnoticed.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const gradle = readFileSync(new URL('../../apps/socrates-android/app/build.gradle.kts', import.meta.url), 'utf8');
const externals = [...gradle.matchAll(/"--external:([^"]+)"/g)].map((match) => match[1]);

test('Android tool renderer bundles with esbuild and leaves tldraw out', async () => {
  assert.ok(externals.includes('./visualizationWhiteboard.ts'), 'gradle keeps the whiteboard module external');
  const result = await build({
    absWorkingDir: repoRoot,
    entryPoints: ['apps/socrates-android/renderer/toolRendererEntry.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    define: { 'process.env.NODE_ENV': '"production"' },
    external: externals,
    write: false,
    outdir: 'out',
    metafile: true,
    logLevel: 'silent',
  });
  assert.deepEqual(result.errors, []);
  const inputs = Object.keys(result.metafile.inputs);
  assert.deepEqual(inputs.filter((path) => /tldraw/.test(path)), []);
});
