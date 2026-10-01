import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = fileURLToPath(new URL('..', import.meta.url));
const tempDir = process.platform === 'win32'
  ? join(frontendDir, 'node_modules', '.socrates-build-temp')
  : null;

if (tempDir) mkdirSync(tempDir, { recursive: true });

const env = tempDir
  ? { ...process.env, TEMP: tempDir, TMP: tempDir, TMPDIR: tempDir }
  : process.env;
const options = { cwd: frontendDir, env, stdio: 'inherit' };

execFileSync(process.execPath, [join(frontendDir, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'], options);
execFileSync(process.execPath, [join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], options);
