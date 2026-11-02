import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

// Mirrors `bundleToolRenderer` in apps/socrates-android/app/build.gradle.kts.
// The native Android build deliberately uses a pinned esbuild CLI instead of
// relying on Vite/Rolldown to expose esbuild as a transitive dependency. Keep
// this smoke test on the same execution path so dependency-layout changes
// cannot make CI disagree with the actual Gradle build.
const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const frontendNodeModules = fileURLToPath(new URL('../node_modules/', import.meta.url));
const gradle = readFileSync(new URL('../../apps/socrates-android/app/build.gradle.kts', import.meta.url), 'utf8');
const externals = [...gradle.matchAll(/"--external:([^"]+)"/g)].map((match) => match[1]);
const resolveExtensions = '.web.tsx,.web.ts,.web.mjs,.web.js,.mjs,.js,.mts,.ts,.jsx,.tsx,.json';

test('Android tool renderer bundles with frontend web resolution and leaves optional assets out', async () => {
  assert.ok(externals.includes('./visualizationWhiteboard.ts'), 'gradle keeps the whiteboard module external');
  assert.ok(externals.includes('../../wasm/socrates_wasm.js'), 'gradle intentionally uses the pure-TS WASM fallback on Android');
  assert.match(gradle, /environment\("NODE_PATH", repositoryRoot\.resolve\("frontend\/node_modules"\)/, 'gradle resolves shared-package dependencies from frontend');
  assert.match(gradle, /"--alias:react-native=react-native-web"/, 'gradle compiles shared RN components through RN Web');
  assert.match(gradle, /"--resolve-extensions=\.web\.tsx,\.web\.ts,\.web\.mjs,\.web\.js,\.mjs,\.js,\.mts,\.ts,\.jsx,\.tsx,\.json"/, 'gradle prefers web platform files');
  assert.match(gradle, /"--loader:\.svg=text"/, 'gradle preserves Vite ?raw SVG semantics');
  assert.match(gradle, /"--loader:\.png=dataurl"/, 'gradle keeps connector PNGs self-contained');
  assert.match(gradle, /"esbuild@0\.25\.12"/, 'gradle pins the renderer bundler version');

  const scratch = mkdtempSync(join(tmpdir(), 'socrates-android-renderer-'));
  const outfile = join(scratch, 'tool-renderer.js');
  const metafile = join(scratch, 'meta.json');
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  try {
    await execFileAsync(npx, [
      '--yes',
      'esbuild@0.25.12',
      'apps/socrates-android/renderer/toolRendererEntry.ts',
      '--bundle',
      '--minify',
      '--format=esm',
      '--platform=browser',
      '--target=es2020',
      '--define:process.env.NODE_ENV="production"',
      '--alias:react-native=react-native-web',
      `--resolve-extensions=${resolveExtensions}`,
      '--loader:.svg=text',
      '--loader:.png=dataurl',
      ...externals.map((entry) => `--external:${entry}`),
      `--outfile=${outfile}`,
      `--metafile=${metafile}`,
      '--log-level=silent',
    ], {
      cwd: repoRoot,
      env: { ...process.env, NODE_PATH: frontendNodeModules },
      maxBuffer: 10 * 1024 * 1024,
    });

    const metadata = JSON.parse(readFileSync(metafile, 'utf8'));
    const inputs = Object.keys(metadata.inputs);
    assert.deepEqual(inputs.filter((path) => /tldraw/.test(path)), []);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
