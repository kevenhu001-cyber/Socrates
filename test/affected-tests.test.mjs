import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

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
