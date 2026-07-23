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
  const nodeArgs = ['--import', 'tsx'];
  if (testFile === 'fetchBatch.test.js') {
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
      timeout: 60_000,
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
