import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { Agent, EnvHttpProxyAgent } from 'undici';

// LLM, embeddings, warm-up and pinned web fetch all pass an npm Undici
// dispatcher to Node's native fetch. Undici 8 cannot speak Node 22/24's
// handler protocol (invalid onRequestStart); keep this an actual I/O test.
test('installed dispatchers remain compatible with Node native fetch', async t => {
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end('{"ok":true}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/`;
  for (const dispatcher of [new Agent(), new EnvHttpProxyAgent({ noProxy: '*' })]) {
    try {
      const result = await globalThis.fetch(url, { dispatcher, signal: AbortSignal.timeout(5000) });
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), { ok: true });
    } finally { await dispatcher.close(); }
  }
});
