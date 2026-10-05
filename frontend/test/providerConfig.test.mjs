import assert from 'node:assert/strict';
import test from 'node:test';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
globalThis.window = { CURRENT_USER: null, SERVER_HAS_BEAGLE_KEY: false, TIER_KEY_LIMITS: {} };
globalThis.document = { cookie: '' };

const store = await import('../src/config/providerConfig.store.ts');
const service = await import('../src/config/providerConfig.service.ts');
const { LAST_ACTIVE_ID_KEY } = service;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  };
}

function reset() {
  service.resetProviderConfigForUser();
  storage.clear();
  window.CURRENT_USER = { id: 'user-one' };
  window.SERVER_HAS_BEAGLE_KEY = false;
}

test('provider refresh honors saved selection before server active and omits credentials from snapshots', async () => {
  reset();
  window.SERVER_HAS_BEAGLE_KEY = true;
  storage.set(LAST_ACTIVE_ID_KEY, 'provider-local');
  const key = 'never-publish-this-secret';
  globalThis.fetch = async () => jsonResponse({ providers: [
    { id: 'provider-server', label: 'Server', url: 'https://server.example/v1', model: 'server', key: 'server-key', isActive: true },
    { id: 'provider-local', label: 'Local', url: 'https://local.example/v1', model: 'local', key, isActive: false },
  ] });

  const snapshot = await service.refreshProviderConfig();
  const selected = snapshot.providers.find((provider) => provider.id === 'provider-local');
  assert.equal(snapshot.activeId, 'provider-local');
  assert.equal(snapshot.providers[0].id, 'beagle-built-in');
  assert.equal(selected.hasKey, true);
  assert.equal('key' in selected, false);
  assert.equal(JSON.stringify(snapshot).includes(key), false);
});

test('provider active fallback uses server, built-in, then first custom row', async () => {
  reset();
  storage.set(LAST_ACTIVE_ID_KEY, 'provider-removed');
  let rows = [
    { id: 'provider-first', label: 'First', model: 'first' },
    { id: 'provider-server', label: 'Server', model: 'server', isActive: true },
  ];
  globalThis.fetch = async () => jsonResponse({ providers: rows });

  assert.equal((await service.refreshProviderConfig()).activeId, 'provider-server');

  service.resetProviderConfigForUser();
  storage.clear();
  window.SERVER_HAS_BEAGLE_KEY = true;
  rows = [
    { id: 'provider-first', label: 'First', model: 'first' },
    { id: 'provider-second', label: 'Second', model: 'second' },
  ];
  assert.equal((await service.refreshProviderConfig()).activeId, 'beagle-built-in');

  service.resetProviderConfigForUser();
  window.SERVER_HAS_BEAGLE_KEY = false;
  assert.equal((await service.refreshProviderConfig()).activeId, 'provider-first');
});

test('missing user and user-switch reset clear provider state and key drafts', async () => {
  reset();
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/api/v2/api-key?')) return jsonResponse({ providers: [
      { id: 'provider-one', label: 'Provider', url: 'https://provider.example/v1', model: 'model', hasKey: true },
    ] });
    return jsonResponse({ ok: true });
  };

  await service.refreshProviderConfig();
  service.updateProviderField('provider-one', 'key', 'user-one-secret');
  assert.equal(store.getProviderConfigSnapshot().providers.length, 1);

  window.CURRENT_USER = null;
  await service.refreshProviderConfig();
  assert.equal(store.getProviderConfigSnapshot().providers.length, 0);
  assert.equal(store.getProviderConfigSnapshot().activeId, null);
  const callsWithoutUser = calls.length;

  window.CURRENT_USER = { id: 'user-two' };
  await service.refreshProviderConfig();
  service.resetProviderConfigForUser();
  window.CURRENT_USER = { id: 'user-three' };
  await service.refreshProviderConfig();
  await service.saveProviderConfig();

  const update = calls.find((call) => call.options.method === 'PATCH');
  assert.equal(callsWithoutUser, 1);
  assert.ok(update);
  assert.equal('key' in JSON.parse(update.options.body), false);
  assert.equal(JSON.stringify(store.getProviderConfigSnapshot()).includes('user-one-secret'), false);
});
