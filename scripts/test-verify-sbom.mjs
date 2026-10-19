import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const verifier = join(root, 'scripts/verify-sbom.mjs');
const names = ['frontend.cdx.json', 'server.cdx.json', 'apps-socrates.cdx.json'];

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'socrates-sbom-test-'));
  for (const name of names) writeFileSync(join(dir, name), JSON.stringify({
    metadata: { component: { name: 'fixture' } },
    components: [{ name: 'dependency' }],
  }));
  return dir;
}
function run(dir) {
  return spawnSync(process.execPath, [verifier, dir], { encoding: 'utf8' });
}

test('verifier accepts all expected non-empty dependency graphs', () => {
  const dir = fixture();
  try {
    const result = run(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /frontend\.cdx\.json: 1 components/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('verifier rejects missing, empty, malformed, and structurally empty SBOMs', () => {
  const dir = fixture();
  try {
    rmSync(join(dir, names[0]));
    writeFileSync(join(dir, names[1]), '');
    writeFileSync(join(dir, names[2]), JSON.stringify({ metadata: { component: {} }, components: [] }));
    const result = run(dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing/);
    assert.match(result.stderr, /empty or non-file/);
    assert.match(result.stderr, /no components/);
    writeFileSync(join(dir, names[0]), '{broken');
    assert.match(run(dir).stderr, /invalid JSON/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('security workflow invokes this verifier from repository root', () => {
  const workflow = readFileSync(join(root, '.github/workflows/security.yml'), 'utf8');
  assert.match(workflow, /node scripts\/verify-sbom\.mjs sbom/);
});
