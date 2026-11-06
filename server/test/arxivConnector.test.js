import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { searchArxivPapers } from '../src/services/integrations/arxivConnector.js';

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

test('arXiv retryability distinguishes transient transport errors from unknown and malformed responses', async () => {
  globalThis.fetch = async () => { throw new Error('invalid request setup'); };
  await assert.rejects(
    searchArxivPapers('unknown transport failure'),
    (error) => error.retryable === false,
  );

  const socketError = new Error('socket reset');
  Object.assign(socketError, { code: 'ECONNRESET' });
  globalThis.fetch = async () => { throw new Error('network request failed', { cause: socketError }); };
  await assert.rejects(
    searchArxivPapers('transient transport failure'),
    (error) => error.retryable === true,
  );

  globalThis.fetch = async () => new Response('<feed><entry>', { status: 200 });
  await assert.rejects(
    searchArxivPapers('malformed arxiv response'),
    (error) => error.retryable === false,
  );
});
