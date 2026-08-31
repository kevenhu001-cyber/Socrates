import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testDir = resolve(serverDir, 'test');
const testFiles = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js') || name.endsWith('.test.mjs'))
  .sort();

const failures = [];
for (const testFile of testFiles) {
  console.log(`\n[test] ${testFile}`);
  // Use Node's test runner instead of executing a `node:test` file as a
  // regular script.  The latter leaves the test runtime alive on Windows;
  // forcing it to exit can then trip a libuv assertion during teardown.
  //
  // `dotenv/config` must come first so DATABASE_URL is present before any
  // module reads it.  Without it the DB-backed suites (oauthFlow,
  // middleware-auth, loginLockout, agentKeys, codexHarness, rustFetchWorker)
  // silently skip, leaving the OAuth and auth-middleware paths uncovered.
  // dotenv never overrides variables already present in the environment, so
  // CI can still pin NODE_ENV/DATABASE_URL explicitly.
  const nodeArgs = ['--import', 'dotenv/config', '--import', 'tsx', '--test'];
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
    // A timeout still runs every other suite; see the summary below.
    console.error(`[test] ${testFile}: ${result.error.message}`);
    failures.push(testFile);
    continue;
  }

  if (result.status !== 0) {
    console.error(`[test] ${testFile}: exit ${result.status}`);
    failures.push(testFile);
    continue;
  }
}

if (failures.length > 0) {
  console.error(`\n[test] ${failures.length} failing suite(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log(`\n[test] all ${testFiles.length} suites passed`);
