import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkRetiredArchitecture } from '../scripts/check-retired-architecture.mjs';

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'socrates-retired-architecture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return root;
}

for (const extension of ['js', 'mjs', 'cjs', 'jsx']) {
  test('rejects first-party ' + extension + ' without a mutable baseline', (t) => {
    const name = 'frontend/src/new.' + extension;
    const root = fixture(t, { [name]: 'export {};' });
    assert.deepEqual(checkRetiredArchitecture(root).map((item) => item.file), [name]);
  });
}

test('permits vendor bundles and ordinary typed source', (t) => {
  const root = fixture(t, {
    'frontend/src/vendor-files/library.js': 'export {};',
    'frontend/src/current.ts': 'export const example = "window.stateStore";',
  });
  assert.deepEqual(checkRetiredArchitecture(root), []);
});

test('rejects retired facade imports, global access and recreation', (t) => {
  const root = fixture(t, {
    'frontend/src/state/store.ts': 'export {};',
    'frontend/src/current.ts': [
      "import './state/store.js';",
      "void import('@/state/store');",
      "window['stateStore'];",
      "type Old = typeof import('./state/store.ts');",
    ].join('\n'),
  });
  assert.equal(checkRetiredArchitecture(root, ['state-facade']).length, 5);
});

test('rejects RN shim recreation, import variants and runtime dependencies', (t) => {
  const root = fixture(t, {
    'packages/ui/src/react-web.tsx': 'export {};',
    'packages/ui/src/current.ts': 'import "./react-web";',
    'frontend/package.json': JSON.stringify({ dependencies: { 'react-native-web': '1' } }),
  });
  assert.equal(checkRetiredArchitecture(root, ['rn-shim']).length, 3);
});
