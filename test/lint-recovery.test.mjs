import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

function fixture(t, script) {
  const directory = mkdtempSync(join(tmpdir(), 'socrates-guard-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const write = (file, text) => {
    const path = join(directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  mkdirSync(dirname(join(directory, script)), { recursive: true });
  copyFileSync(new URL(`../${script}`, import.meta.url), join(directory, script));
  return {
    write,
    read: (file) => readFileSync(join(directory, file), 'utf8'),
    run: (...args) =>
      spawnSync(process.execPath, [script, ...args], { cwd: directory, encoding: 'utf8' }),
  };
}

test('CSP guard suggests read-only repairs and fixes stale or missing artifacts', (t) => {
  const { write, read, run } = fixture(t, 'scripts/gen-csp-hashes.mjs');
  const html = 'frontend/index.html';
  const ts = 'server/src/generated/cspInlineHashes.ts';
  const nginx = 'ops/nginx/csp-spa.conf';
  write(html, '<script>const ready = true;</script>\n');
  write(ts, 'stale\n');

  assert.equal(run().status, 1);
  const suggestion = run('--suggest');
  assert.equal(suggestion.status, 1);
  assert.ok(suggestion.stderr.includes(`${ts}:1: first differing line`));
  assert.ok(suggestion.stderr.includes(`${nginx} (missing)`));
  assert.equal(read(ts), 'stale\n');
  assert.throws(() => read(nginx), { code: 'ENOENT' });

  const result = run('--fix');
  assert.equal(result.status, 0, result.stderr);
  assert.match(read(ts), /sha256-/);
  assert.match(read(nginx), /add_header Content-Security-Policy/);
  assert.equal(run().status, 0);
  const secondFix = run('--fix');
  assert.equal(secondFix.status, 0, secondFix.stderr);
  assert.doesNotMatch(secondFix.stdout, /regenerated/);
});

test('locale guard points to missing keys in both locales without editing them', (t) => {
  const { write, read, run } = fixture(t, 'frontend/scripts/check-i18n-locales.mjs');
  const en = "export const en = {\n  'chat.send': 'Send',\n};\n";
  const zh = "export const zh = {\n  'chat.stop': '停止',\n};\n";
  write('frontend/src/i18n/en.ts', en);
  write('frontend/src/i18n/zh.ts', zh);

  const suggestion = run('--suggest');
  assert.equal(suggestion.status, 1);
  assert.match(suggestion.stderr, /en\.ts:2:.*'chat\.send'.*zh\.ts/);
  assert.match(suggestion.stderr, /zh\.ts:2:.*'chat\.stop'.*en\.ts/);
  assert.equal(read('frontend/src/i18n/en.ts'), en);
  assert.equal(read('frontend/src/i18n/zh.ts'), zh);
  assert.equal(run('--fix').status, 2);

  write('frontend/src/i18n/zh.ts', "export const zh = { 'chat.send': '发送' };\n");
  assert.equal(run().status, 0);
});
