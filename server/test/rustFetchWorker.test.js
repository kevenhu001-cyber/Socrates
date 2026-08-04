import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';

const binaryName = process.platform === 'win32' ? 'socrates-fetchd.exe' : 'socrates-fetchd';
const binaryPath = path.resolve('..', 'tools-rust', 'target', 'release', binaryName);

test('native fetch worker rejects private URLs before network access', { skip: !existsSync(binaryPath) }, async () => {
  const previousEnabled = process.env.SOCRATES_RUST_FETCH;
  const previousPath = process.env.SOCRATES_FETCHD_PATH;
  process.env.SOCRATES_RUST_FETCH = '1';
  process.env.SOCRATES_FETCHD_PATH = binaryPath;

  try {
    const { fetchWithRust, stopRustFetchWorker } = await import('../src/services/rustFetchWorker.ts');
    const result = await fetchWithRust({ url: 'http://127.0.0.1/admin' });
    assert.equal(result?.ok, false);
    assert.match(result?.reason || '', /private IP/);
    await stopRustFetchWorker();
  } finally {
    if (previousEnabled === undefined) delete process.env.SOCRATES_RUST_FETCH;
    else process.env.SOCRATES_RUST_FETCH = previousEnabled;
    if (previousPath === undefined) delete process.env.SOCRATES_FETCHD_PATH;
    else process.env.SOCRATES_FETCHD_PATH = previousPath;
  }
});
