import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testDir = resolve(serverDir, 'test');
const testFiles = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js') || name.endsWith('.test.mjs'))
  .sort();
const strictMode = process.argv.includes('--strict');

for (const testFile of testFiles) {
  console.log(`\n[test] ${testFile}`);
  const nodeArgs = ['--import', 'tsx'];
  if (!strictMode) {
    nodeArgs.push('--test-force-exit');
  }
  nodeArgs.push(resolve(testDir, testFile));

  const result = spawnSync(
    process.execPath,
    nodeArgs,
    {
      cwd: serverDir,
      env: process.env,
      stdio: 'inherit',
      // Worker-backed suites can pay a cold loader/antivirus cost on Windows.
      // Keep a hard bound, but do not turn transient process startup pressure
      // into a false test failure.
      timeout: 120_000,
    },
  );

  if (result.error) {
    console.error(`[test] ${testFile}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
