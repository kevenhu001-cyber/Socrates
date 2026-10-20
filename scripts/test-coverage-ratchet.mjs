import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import test from 'node:test';

function runFixture(t, { status = 0, output = 'all files | 82.55 | 78.59 | 66.17 |', update = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'coverage-ratchet-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ['scripts', 'server', 'bin']) mkdirSync(join(root, directory));
  copyFileSync(new URL('./coverage-ratchet.mjs', import.meta.url), join(root, 'scripts/coverage-ratchet.mjs'));
  const baselinePath = join(root, 'scripts/coverage.baseline.json');
  const baseline = JSON.stringify({ server: { line: 82.55, branch: 78.59, func: 66.17, recorded: '2026-10-19' } });
  writeFileSync(baselinePath, baseline);
  // Stub only the subprocess boundary; exercise the real ratchet CLI and its baseline writes.
  const stub = join(root, 'bin/stub.cjs');
  writeFileSync(stub, `console.log(${JSON.stringify(output)}); process.exit(${status});\n`);
  const windows = process.platform === 'win32';
  const npm = join(root, 'bin', windows ? 'npm.cmd' : 'npm');
  writeFileSync(npm, windows
    ? `@"${process.execPath}" "${stub}"\r\n`
    : `#!/bin/sh\nexec "${process.execPath}" "${stub}"\n`, { mode: 0o755 });
  const result = spawnSync(process.execPath, [join(root, 'scripts/coverage-ratchet.mjs'), 'server', ...(update ? ['--update'] : [])], {
    encoding: 'utf8', env: { ...process.env, PATH: `${join(root, 'bin')}${delimiter}${process.env.PATH}` },
  });
  assert.ifError(result.error);
  return { ...result, baseline, after: readFileSync(baselinePath, 'utf8') };
}

for (const update of [false, true]) {
  test(`failed coverage cannot be masked by a summary (${update ? 'update' : 'gate'})`, (t) => {
    const result = runFixture(t, { status: 1, output: 'not ok 1 - fixture failure\nall files | 99.00 | 99.00 | 99.00 |', update });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /the test run itself failed/);
    assert.match(result.stderr, /not ok 1 - fixture failure/);
    assert.doesNotMatch(result.stderr, /coverage (regressed|improved)/);
    assert.equal(result.after, result.baseline, 'a failed run must never rewrite the floor');
  });
}

test('successful coverage still enforces the existing floor', (t) => {
  const result = runFixture(t);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /at or just above the floor/);
});

test('successful collection below the floor still fails', (t) => {
  const result = runFixture(t, { output: 'all files | 79.18 | 78.93 | 60.13 |' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /coverage regressed/);
});

test('a successful command without a summary cannot pass', (t) => {
  const result = runFixture(t, { output: 'no report' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not find/);
});
