import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const sourceScript = fileURLToPath(new URL('../scripts/check-legacy-js.mjs', import.meta.url));

function createFixture(currentPaths, baselinePaths = ['src/old-a.js', 'src/old-b.js']) {
  const root = mkdtempSync(join(tmpdir(), 'socrates-legacy-js-'));
  const frontend = join(root, 'frontend');
  const scripts = join(frontend, 'scripts');
  const src = join(frontend, 'src');
  const baseline = join(scripts, 'legacy-js.baseline.json');
  const script = join(scripts, 'check-legacy-js.mjs');

  mkdirSync(scripts, { recursive: true });
  mkdirSync(src, { recursive: true });
  writeFileSync(script, readFileSync(sourceScript));
  writeFileSync(baseline, `${JSON.stringify({ count: baselinePaths.length, files: baselinePaths }, null, 2)}\n`);

  for (const path of currentPaths) {
    const file = join(frontend, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'export {};\n');
  }

  return {
    baseline,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    script,
  };
}

function runCheck(script, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { ...result, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

test('legacy JS guard rejects a new path even when it replaces a deleted path', (t) => {
  const fixture = createFixture(['src/old-a.js', 'src/new-c.js']);
  t.after(fixture.cleanup);

  const result = runCheck(fixture.script);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /src\/new-c\.js/);

  const update = runCheck(fixture.script, '--update');
  assert.equal(update.status, 1, update.output);
  assert.match(update.output, /new JS paths are not allowed/);
  assert.deepEqual(JSON.parse(readFileSync(fixture.baseline, 'utf8')), {
    count: 2,
    files: ['src/old-a.js', 'src/old-b.js'],
  });
});

test('legacy JS baseline can shrink but cannot absorb new paths', (t) => {
  const fixture = createFixture(['src/old-a.js']);
  t.after(fixture.cleanup);

  const beforeUpdate = runCheck(fixture.script);
  assert.equal(beforeUpdate.status, 1, beforeUpdate.output);
  assert.match(beforeUpdate.output, /src\/old-b\.js/);

  const update = runCheck(fixture.script, '--update');
  assert.equal(update.status, 0, update.output);
  assert.deepEqual(JSON.parse(readFileSync(fixture.baseline, 'utf8')), {
    count: 1,
    files: ['src/old-a.js'],
    generatedBy: 'check-legacy-js.mjs --update',
  });

  const afterUpdate = runCheck(fixture.script);
  assert.equal(afterUpdate.status, 0, afterUpdate.output);
});

for (const extension of ['mjs', 'cjs', 'jsx']) {
  test(`legacy guard rejects untyped ${extension} modules and baseline laundering`, (t) => {
    const fixture = createFixture([`src/new.${extension}`], []);
    t.after(fixture.cleanup);
    for (const args of [[], ['--update']]) {
      const result = runCheck(fixture.script, ...args);
      assert.equal(result.status, 1, result.output);
      assert.ok(result.output.includes(`src/new.${extension}`), result.output);
    }
    assert.equal(JSON.parse(readFileSync(fixture.baseline, 'utf8')).count, 0);
  });
}

test('third-party bundles are excluded while a zero baseline prevents regressions', (t) => {
  const fixture = createFixture(['src/vendor-files/library.js'], []);
  t.after(fixture.cleanup);
  const result = runCheck(fixture.script);
  assert.equal(result.status, 0, result.output);
});
