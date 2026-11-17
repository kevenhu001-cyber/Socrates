import assert from 'node:assert/strict';
import test from 'node:test';
import { retryImport } from '../src/react/lib/boot/retryImport.ts';

test('transient module transport failures retry without reloading the document', async () => {
  let attempts = 0;
  const result = await retryImport(async () => {
    if (++attempts < 3)
      throw new TypeError('Failed to fetch dynamically imported module: /assets/editor.js');
    return { editor: true };
  });
  assert.deepEqual(result, { editor: true });
  assert.equal(attempts, 3);
});

test('evaluation errors are not retried and transport retries are bounded', async () => {
  let attempts = 0;
  const error = new ReferenceError('Cannot access editor before initialization');
  await assert.rejects(
    retryImport(async () => {
      attempts++;
      throw error;
    }),
    (actual) => actual === error,
  );
  assert.equal(attempts, 1);
  attempts = 0;
  await assert.rejects(
    retryImport(async () => {
      attempts++;
      throw new TypeError('Importing a module script failed.');
    }),
  );
  assert.equal(attempts, 3);
});
