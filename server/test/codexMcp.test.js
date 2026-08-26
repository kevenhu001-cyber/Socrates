import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CODEX_ENABLED = 'true';
process.env.CODEX_MCP = 'true';
process.env.CODEX_MCP_URL = '';
process.env.CODEX_MCP_SERVERS = JSON.stringify([
  { key: 'docs', name: 'Docs', url: 'https://mcp.example.test/docs', enabled: true },
  { key: 'local', url: 'http://127.0.0.1:8787/mcp', enabled: false },
  { key: 'bad', url: 'https://mcp.example.test/?token=should-not-pass' },
  { key: 'unsafe', url: 'http://example.test/mcp' },
]);

test('MCP catalog accepts only server-owned safe endpoints', async () => {
  const { getCodexMcpCatalog } = await import('../src/services/codexMcp.js');
  const catalog = getCodexMcpCatalog();
  assert.deepEqual(catalog.map((entry) => entry.key), ['docs', 'local']);
  assert.equal(catalog[0].enabledByDefault, true);
  assert.equal(catalog[1].enabledByDefault, false);
});
