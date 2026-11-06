import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { deriveEncryptionKey, encrypt } from '../src/lib/crypto.js';
import { listZoteroItems, ZoteroConnectorError } from '../src/services/integrations/zoteroConnector.js';

const originalFetch = globalThis.fetch;
const originalSessionSecret = process.env.SESSION_SECRET;
after(() => {
  globalThis.fetch = originalFetch;
  if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSessionSecret;
});

test('Zotero retries transient HTTP errors, not malformed successful responses', async () => {
  process.env.SESSION_SECRET = 'zotero-test-secret';
  const connection = {
    externalAccountId: '12345',
    accessTokenCiphertext: encrypt('read-only-test-token', deriveEncryptionKey(process.env.SESSION_SECRET)),
  };

  globalThis.fetch = async () => new Response('not json', { status: 200 });
  await assert.rejects(
    listZoteroItems(connection),
    (error) => error instanceof ZoteroConnectorError && error.retryable === false,
  );

  globalThis.fetch = async () => new Response('upstream unavailable', { status: 503 });
  await assert.rejects(
    listZoteroItems(connection),
    (error) => error instanceof ZoteroConnectorError && error.retryable === true,
  );
});
