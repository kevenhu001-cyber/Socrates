import assert from 'node:assert/strict';
import test from 'node:test';
import { useSettingsStore } from './index.ts';
import { createMemoryStore } from '../../platform/src/index.ts';
test('corrupt settings cannot crash startup or inject store methods', async () => {
  const store = useSettingsStore.getState();
  await store.hydrate(createMemoryStore({ 'socrates.settings': '{bad' }));
  await store.hydrate(createMemoryStore({ 'socrates.settings': JSON.stringify({ theme: 'invalid', language: 'fr', haptics: 'false', update: null }) }));
  assert.equal(typeof useSettingsStore.getState().update, 'function'); assert.equal(useSettingsStore.getState().language, 'en'); assert.equal(useSettingsStore.getState().haptics, true);
});
test('settings persist and hydrate only supported values', async () => {
  const storage = createMemoryStore(); await useSettingsStore.getState().update({ theme: 'light', language: 'zh', haptics: false }, storage);
  useSettingsStore.setState({ theme: 'dark', language: 'en', haptics: true }); await useSettingsStore.getState().hydrate(storage);
  assert.equal(useSettingsStore.getState().theme, 'light'); assert.equal(useSettingsStore.getState().language, 'zh'); assert.equal(useSettingsStore.getState().haptics, false);
});
