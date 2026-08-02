/**
 * scripts/build-wasm.mjs — builds the socrates mechanism library to WASM.
 *
 * Two steps (the same ones wasm-pack wraps, minus wasm-opt):
 *   1. cargo build --release --target wasm32-unknown-unknown -p socrates-wasm
 *   2. wasm-bindgen --target web --out-dir <frontend>/wasm
 *
 * Output lands in `frontend/wasm/` (gitignored) and is consumed lazily by
 * `src/lib/socratesWasm.js`. Run via `npm run build:wasm` from frontend/.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, '..');
const toolsRustDir = path.resolve(frontendDir, '..', 'tools-rust');
const outDir = path.join(frontendDir, 'wasm');

function findOnPathOrCargoBin(name) {
  const which = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(which, [name], { stdio: 'ignore' });
    return name;
  } catch {
    const cargoBin = path.join(os.homedir(), '.cargo', 'bin', process.platform === 'win32' ? `${name}.exe` : name);
    if (existsSync(cargoBin)) return cargoBin;
    return null;
  }
}

const wasmBindgen = process.env.WASM_BINDGEN || findOnPathOrCargoBin('wasm-bindgen');
if (!wasmBindgen) {
  console.error('wasm-bindgen CLI not found. Install it with:');
  console.error('  cargo install wasm-bindgen-cli --version 0.2.126');
  process.exit(1);
}

console.log('[build-wasm] building socrates-wasm (release, wasm32-unknown-unknown)…');
execFileSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown', '-p', 'socrates-wasm'], {
  cwd: toolsRustDir,
  stdio: 'inherit',
});

const wasmFile = path.join(
  toolsRustDir,
  'target',
  'wasm32-unknown-unknown',
  'release',
  'socrates_wasm.wasm',
);
if (!existsSync(wasmFile)) {
  console.error(`[build-wasm] expected wasm artifact missing: ${wasmFile}`);
  process.exit(1);
}

console.log(`[build-wasm] generating web bindings into ${path.relative(frontendDir, outDir)}/…`);
execFileSync(
  wasmBindgen,
  ['--target', 'web', '--out-dir', outDir, '--remove-name-section', wasmFile],
  { stdio: 'inherit' },
);

console.log('[build-wasm] done: frontend/wasm/socrates_wasm.js + socrates_wasm_bg.wasm');
