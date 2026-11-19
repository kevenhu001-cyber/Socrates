import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(__filename), '..');

test('run-affected-tests: dry-run on markdownBoundary.ts maps to frontend render tests', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/run-affected-tests.mjs', 'frontend/src/render/markdownBoundary.ts', '--dry-run'],
    { cwd: rootDir, encoding: 'utf8' },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Frontend \(\d+\):.*mathMarkdownBoundary\.test\.mjs/);
  assert.match(result.stdout, /Dry-run complete/);
});

test('run-affected-tests: dry-run on server file parser maps to server fileParsersFormats test', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/run-affected-tests.mjs', 'server/src/services/fileParsers/docx.ts', '--dry-run'],
    { cwd: rootDir, encoding: 'utf8' },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Server\s+\(\d+\):.*fileParsersFormats\.test\.js/);
});

test('run-affected-tests: dry-run on shared UI file maps to shared packages/ui test', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/run-affected-tests.mjs', 'packages/ui/src/artifactDocument.ts', '--dry-run'],
    { cwd: rootDir, encoding: 'utf8' },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Shared\s+\(\d+\):.*packages\/ui\/src\/artifacts\.test\.ts/);
});

test('run-affected-tests: dry-run on documentation file reports no test execution needed', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/run-affected-tests.mjs', 'README.md', '--dry-run'],
    { cwd: rootDir, encoding: 'utf8' },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Changed files do not affect test suites/);
});

test('run-affected-tests: file extraction route maps to parser and worker tests', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/run-affected-tests.mjs', 'server/src/routes/content/fileExtract.ts', '--dry-run'],
    { cwd: rootDir, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /fileParsersFormats\.test\.js/);
  assert.match(result.stdout, /fileParserWorker\.test\.mjs/);
});

test('run-affected-tests: maps both sides of a staged or committed cross-domain move', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'socrates-affected-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const routeBefore = 'server/src/routes/auth/示例 -> route.ts';
  const routeAfter = 'server/src/routes/media/示例 -> route.ts';
  const deletedTest = 'server/test/deleted.test.js';
  mkdirSync(join(cwd, 'scripts'));
  copyFileSync(
    join(rootDir, 'scripts/run-affected-tests.mjs'),
    join(cwd, 'scripts/run-affected-tests.mjs'),
  );
  for (const file of [
    routeBefore,
    routeAfter,
    deletedTest,
    'server/test/authHttpRoutes.test.js',
    'server/test/ttsRoute.test.js',
  ])
    mkdirSync(join(cwd, dirname(file)), { recursive: true });
  writeFileSync(join(cwd, routeBefore), 'export {};\n');
  writeFileSync(join(cwd, deletedTest), '');
  writeFileSync(join(cwd, 'server/test/authHttpRoutes.test.js'), '');
  writeFileSync(join(cwd, 'server/test/ttsRoute.test.js'), '');
  git('init', '-q');
  git('add', '.');
  const commit = () =>
    git('-c', 'user.name=Test', '-c', 'user.email=test@invalid.test', 'commit', '-qm', 'fixture');
  commit();
  const initial = git('rev-parse', 'HEAD');
  renameSync(join(cwd, routeBefore), join(cwd, routeAfter));
  rmSync(join(cwd, deletedTest));

  const verify = (...args) => {
    const result = spawnSync(
      process.execPath,
      ['scripts/run-affected-tests.mjs', '--dry-run', ...args],
      { cwd, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const output = result.stdout.split('\n').find((line) => line.includes('• Server'));
    assert.match(output, /authHttpRoutes\.test\.js/);
    assert.match(output, /ttsRoute\.test\.js/);
    assert.doesNotMatch(output, /deleted\.test\.js/);
  };
  verify();
  git('add', '-A');
  verify('--staged');
  commit();
  verify('--branch', initial);
});
