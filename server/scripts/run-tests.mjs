import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testDir = resolve(serverDir, 'test');
const testFiles = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js') || name.endsWith('.test.mjs'))
  .sort();
for (const testFile of testFiles) {
  console.log(`\n[test] ${testFile}`);
  // Use Node's test runner instead of executing a `node:test` file as a
  // regular script.  The latter leaves the test runtime alive on Windows;
  // forcing it to exit can then trip a libuv assertion during teardown.
  const nodeArgs = ['--import', 'tsx', '--test'];
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
