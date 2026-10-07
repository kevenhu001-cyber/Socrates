import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const register = fileURLToPath(new URL('./test-register.mjs', import.meta.url));
// Discover every shared-package test; run in separate processes so singleton
// stores cannot leak between files. Resolve runtime peers from the App install.
for (const pkg of readdirSync(`${root}/packages`)) {
  let files;
  try { files = readdirSync(`${root}/packages/${pkg}/src`); } catch { continue; }
  for (const file of files.filter((name) => name.endsWith('.test.ts')).sort()) {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '--import', register, `${root}/packages/${pkg}/src/${file}`], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
