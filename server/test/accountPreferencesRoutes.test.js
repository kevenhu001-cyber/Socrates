// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { appRouteFixture } from './_appRouteFixture.js';
import { notificationTokens, usageEvents } from '../src/db/schema/index.js';

const f = appRouteFixture();
let ownKey;
let ownNotification;

test('unauthenticated requests cannot read preferences, API keys, usage, or register notifications', async () => {
  for (const [path, options] of [
    ['/api/users/me/preferences', {}],
    ['/api/api-key/', {}],
    ['/api/usage/', {}],
    ['/api/notifications/register', { method: 'POST', body: { token: 'valid-notification-token', platform: 'web' } }],
  ]) {
    const response = await f.request(path, { ...options, as: null });
    assert.equal(response.status, 401, path);
  }
});

test('preferences default to empty and PATCH accepts valid values while ignoring unrecognized fields', async () => {
  const initial = await f.request('/api/users/me/preferences');
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.body.preferences, {});
  const saved = await f.request('/api/users/me/preferences', {
    method: 'PATCH', body: { theme: 'dark', language: 'zh', notifications: false, imageModel: 'model-x', voiceLanguage: 'zh-CN', ignored: 'not persisted' },
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.preferences, { theme: 'dark', language: 'zh', notifications: false, imageModel: 'model-x', voiceLanguage: 'zh-CN' });
  const reread = await f.request('/api/users/me/preferences');
  assert.deepEqual(reread.body.preferences, saved.body.preferences);
});

test('preference validation rejects invalid values without overwriting stored settings', async () => {
  for (const invalid of [
    { theme: 'sepia' }, { language: 'fr' }, { notifications: 'no' },
    { imageModel: 'x'.repeat(121) }, { voiceLanguage: 'fr-FR' },
  ]) {
    const response = await f.request('/api/users/me/preferences', { method: 'PATCH', body: invalid });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'INVALID_PREFERENCE');
  }
  const reread = await f.request('/api/users/me/preferences');
  assert.deepEqual(reread.body.preferences, { theme: 'dark', language: 'zh', notifications: false, imageModel: 'model-x', voiceLanguage: 'zh-CN' });
});

test('legacy profile PATCH updates allowed profile fields but does not expose credential fields', async () => {
  const response = await f.request('/api/users/me', { method: 'PATCH', body: {
    displayName: 'Preference Test', customInstructions: 'Keep answers concise', defaultModel: 'model-test', tier: 'euclid', email: 'attacker@invalid.test',
  } });
  assert.equal(response.status, 200);
  assert.equal(response.body.displayName, 'Preference Test');
  assert.equal(response.body.customInstructions, 'Keep answers concise');
  assert.equal(response.body.defaultModel, 'model-test');
  assert.equal(response.body.tier, f.owner.tier);
  assert.equal(response.body.email, f.owner.email);
  assert.equal('passwordHash' in response.body, false);
});

test('profile and preference data remain isolated between authenticated users', async () => {
  const otherPrefs = await f.request('/api/users/me/preferences', { as: f.other });
  assert.equal(otherPrefs.status, 200);
  assert.deepEqual(otherPrefs.body.preferences, {});
  const otherProfile = await f.request('/api/users/me', { as: f.other, method: 'PATCH', body: { displayName: 'Other User' } });
  assert.equal(otherProfile.status, 200);
  assert.equal(otherProfile.body.id, f.other.id);
  assert.equal(otherProfile.body.displayName, 'Other User');
  const ownerProfile = await f.request('/api/users/me', { method: 'PATCH', body: {} });
  assert.equal(ownerProfile.status, 200);
  assert.equal(ownerProfile.body.displayName, 'Preference Test');
});

test('API key creation and listing expose only safe metadata and isolate owners', async () => {
  const secret = 'secret-provider-key-12345';
  const created = await f.request('/api/api-key/', { method: 'POST', body: {
    label: 'Test provider', url: 'https://api.example.test/v1', model: 'test-model', key: secret, isMultimodal: true,
  } });
  assert.equal(created.status, 201);
  ownKey = created.body.id;
  assert.equal(created.body.hasKey, true);
  assert.equal(created.body.keyHint, secret.slice(0, 8));
  assert.equal(created.body.isMultimodal, true);
  for (const body of [created.body, JSON.stringify(created.body)]) {
    assert.equal(JSON.stringify(body).includes(secret), false);
  }
  assert.equal('keyCiphertext' in created.body, false);
  assert.equal('key' in created.body, false);
  /* P_model-capability-registry — the provider row carries what the model
     can do, so a client never has to guess from the model name. An
     undeclared model keeps Instant available and has no effort levels. */
  assert.deepEqual(created.body.capabilities, { isReasoning: true, supportsInstant: true, supportsEffort: false });
  const listed = await f.request('/api/api-key/');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.providers.length, 1);
  assert.equal(listed.body.providers[0].hasKey, true);
  assert.equal('keyCiphertext' in listed.body.providers[0], false);
  assert.deepEqual(listed.body.providers[0].capabilities, { isReasoning: true, supportsInstant: true, supportsEffort: false });
  /* The built-in provider is a system row: it is not in the caller's list,
     but its capabilities travel beside it. */
  assert.ok('builtInCapabilities' in listed.body);
  assert.equal((await f.request('/api/api-key/', { as: f.other })).body.providers.length, 0);
});

test('API key create validates public HTTPS provider URLs and required fields', async () => {
  for (const url of ['http://api.example.test', 'https://localhost/v1', 'https://127.0.0.1/v1', 'https://169.254.169.254/latest']) {
    const response = await f.request('/api/api-key/', { method: 'POST', body: { url, model: 'm', key: 'secret' } });
    assert.equal(response.status, 400, url);
  }
  const missing = await f.request('/api/api-key/', { method: 'POST', body: { url: 'https://api.example.test/v1', model: 'm' } });
  assert.equal(missing.status, 400);
});

test('API key patch rotates secret without disclosing it, and invalid or foreign ids are not found', async () => {
  const rotatedInput = 'test test test';
  const rotated = await f.request(`/api/api-key/${ownKey}`, { method: 'PATCH', body: { key: rotatedInput, label: 'Renamed' } });
  assert.equal(rotated.status, 200);
  assert.equal(rotated.body.label, 'Renamed');
  assert.equal(rotated.body.keyHint, rotatedInput.slice(0, 8));
  assert.equal(rotated.body.hasKey, true);
  assert.equal(JSON.stringify(rotated.body).includes(rotatedInput), false);
  assert.equal('keyCiphertext' in rotated.body, false);
  assert.equal((await f.request('/api/api-key/not-a-uuid', { method: 'PATCH', body: { label: 'x' } })).status, 404);
  assert.equal((await f.request(`/api/api-key/${ownKey}`, { as: f.other, method: 'PATCH', body: { label: 'stolen' } })).status, 404);
  assert.equal((await f.request(`/api/api-key/${ownKey}`, { as: f.other, method: 'DELETE' })).status, 404);
});

test('API key deletion removes the owner record', async () => {
  const deleted = await f.request(`/api/api-key/${ownKey}`, { method: 'DELETE' });
  assert.equal(deleted.status, 204);
  assert.equal((await f.request('/api/api-key/')).body.providers.length, 0);
});

test('usage totals and limits are authenticated and scoped to the requesting user', async () => {
  // Fixture setup has completed before tests run; this row is cleaned by user cascade.
  await f.db.insert(usageEvents).values({ userId: f.owner.id, source: 'chat', totalTokens: 37, promptTokens: 20, completionTokens: 17, usageSource: 'test' });
  const owner = await f.request('/api/usage/');
  assert.equal(owner.status, 200);
  assert.equal(owner.body.period, 'month');
  assert.equal(owner.body.totalTokens, 37);
  assert.equal(owner.body.messageCount, 1);
  const other = await f.request('/api/usage/', { as: f.other });
  assert.equal(other.body.totalTokens, 0);
  assert.equal(other.body.messageCount, 0);
  const limits = await f.request('/api/usage/limits');
  assert.equal(limits.status, 200);
  assert.equal(limits.body.plan, f.owner.tier);
  assert.equal(typeof limits.body.beagleUsed, 'number');
});

test('usage period selection and daily heatmap return expected shape', async () => {
  const day = await f.request('/api/usage/?period=day');
  assert.equal(day.body.period, 'day');
  assert.equal(day.body.totalTokens, 37);
  const allTime = await f.request('/api/usage/?period=unexpected');
  assert.equal(allTime.body.period, 'unexpected');
  assert.equal(allTime.body.totalTokens, 37);
  const daily = await f.request('/api/usage/daily?days=30');
  assert.equal(daily.status, 200);
  assert.equal(daily.body.days, 30);
  assert.equal(daily.body.entries.reduce((n, row) => n + row.tokens, 0), 37);
  assert.equal(daily.body.entries.reduce((n, row) => n + row.messages, 0), 1);
  assert.deepEqual((await f.request('/api/usage/daily?days=30', { as: f.other })).body.entries, []);
});

test('notification registration validates required shape, enum, size, and rejects unknown fields', async () => {
  const candidates = [
    {}, { token: 'short', platform: 'web' }, { token: 7, platform: 'web' },
    { token: 'long-enough-token', platform: 'desktop' },
    { token: 'x'.repeat(4097), platform: 'ios' },
    { token: 'valid-notification-token', platform: 'web', extra: true },
  ];
  for (const body of candidates) {
    const response = await f.request('/api/notifications/register', { method: 'POST', body });
    assert.equal(response.status, 400);
  }
});

test('notifications register for the owner and unregister only that owner tokens', async () => {
  const created = await f.request('/api/notifications/register', { method: 'POST', body: {
    token: 'owner-notification-token-unique', platform: 'web',
  } });
  assert.equal(created.status, 201);
  ownNotification = created.body.id;
  assert.equal(created.body.userId, f.owner.id);
  assert.equal(created.body.platform, 'web');
  const otherToken = await f.request('/api/notifications/register', { as: f.other, method: 'POST', body: {
    token: 'other-notification-token-unique', platform: 'android',
  } });
  assert.equal(otherToken.status, 201);
  const removed = await f.request('/api/notifications/unregister', { method: 'DELETE' });
  assert.equal(removed.status, 204);
  const remaining = await f.db.select().from(notificationTokens).where(eq(notificationTokens.id, otherToken.body.id));
  assert.equal(remaining.length, 1);
  const removedOwner = await f.db.select().from(notificationTokens).where(eq(notificationTokens.id, ownNotification));
  assert.equal(removedOwner.length, 0);
  await f.request('/api/notifications/unregister', { as: f.other, method: 'DELETE' });
});

test('empty preference arrays cannot erase settings, while alternate valid choices are persisted', async () => {
  const previous = await f.request('/api/users/me/preferences');
  const ignored = await f.request('/api/users/me/preferences', { method: 'PATCH', body: [] });
  assert.equal(ignored.status, 200);
  assert.deepEqual(ignored.body.preferences, previous.body.preferences);
  for (const body of [{ theme: 'light', language: 'en', voiceLanguage: 'en-US', notifications: true }, { theme: 'system', voiceLanguage: 'auto' }]) {
    const updated = await f.request('/api/users/me/preferences', { method: 'PATCH', body });
    assert.equal(updated.status, 200);
    for (const [key, value] of Object.entries(body)) assert.equal(updated.body.preferences[key], value);
  }
  assert.equal((await f.request('/api/users/me/preferences', { method: 'PATCH', body: { imageModel: 7 } })).status, 400);
});

test('provider activation is exclusive, URL changes are validated, and plan limits are enforced', async () => {
  const provider = { url: 'https://api.example.test/v1', model: 'test-model', key: 'test-only-provider-secret' };
  const first = await f.request('/api/api-key', { method: 'POST', body: { ...provider, isMultimodal: 'truthy' } });
  const second = await f.request('/api/api-key', { method: 'POST', body: { ...provider, label: 'Second', isMultimodal: true } });
  assert.equal(first.status, 201);
  assert.equal(first.body.label, 'Default');
  assert.equal(first.body.isMultimodal, false);
  assert.equal(second.status, 201);
  const limited = await f.request('/api/api-key', { method: 'POST', body: provider });
  assert.equal(limited.status, 403);
  let listed = await f.request('/api/api-key');
  assert.deepEqual(listed.body.providers.filter((row) => row.isActive).map((row) => row.id), [second.body.id]);
  const selected = await f.request(`/api/api-key/${first.body.id}`, { method: 'PATCH', body: { isActive: true, isMultimodal: true, url: 'https://other.example.test/v1', model: 'new-model' } });
  assert.equal(selected.status, 200);
  assert.equal(selected.body.model, 'new-model');
  assert.equal(selected.body.isMultimodal, true);
  assert.equal((await f.request(`/api/api-key/${first.body.id}`, { method: 'PATCH', body: { url: 'https://127.0.0.1' } })).status, 400);
  const disabled = await f.request(`/api/api-key/${second.body.id}`, { method: 'PATCH', body: { isActive: false, isMultimodal: 'true' } });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.isMultimodal, false);
  listed = await f.request('/api/api-key');
  assert.deepEqual(listed.body.providers.filter((row) => row.isActive).map((row) => row.id), [first.body.id]);
  assert.equal(listed.body.providers.find((row) => row.id === first.body.id).url, 'https://other.example.test/v1');
  assert.equal((await f.request('/api/api-key/malformed', { method: 'DELETE' })).status, 404);
  for (const id of [first.body.id, second.body.id]) assert.equal((await f.request(`/api/api-key/${id}`, { method: 'DELETE' })).status, 204);
});

test('daily usage excludes non-chat events even though weekly account totals include them', async () => {
  await f.db.insert(usageEvents).values({ userId: f.owner.id, source: 'title', totalTokens: 3 });
  const weekly = await f.request('/api/usage?period=week');
  assert.equal(weekly.status, 200);
  assert.equal(weekly.body.totalTokens, 40);
  const daily = await f.request('/api/usage/daily?days=30');
  assert.equal(daily.status, 200);
  assert.equal(daily.body.entries.reduce((sum, row) => sum + row.tokens, 0), 37);
});
