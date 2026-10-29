import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="modelPicker">
    <button id="modelPickerTrigger" aria-expanded="false"></button>
    <span id="modelPickerLabel"></span>
    <div id="modelPickerMenu"></div>
  </div>
  <div id="chatModelWrap">
    <button id="chatModel"><span class="chat-model-glyph"></span></button>
    <span id="chatModelLabel"></span>
    <div id="chatModelMenu"></div>
  </div>
  <div id="extensionsPicker"></div>
</body></html>`, { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.CustomEvent = dom.window.CustomEvent;

const { publishProviderConfig, getProviderConfigSnapshot, resetProviderConfig } = await import(
  '../src/config/providerConfig.store.ts'
);
const { openModelPicker, syncModelPills, syncChatModel } = await import('../src/pickers.js');

test('model picker selects the configured built-in fallback and renders it accessibly', async () => {
  resetProviderConfig();
  publishProviderConfig({
    providers: [
      { id: 'beagle-built-in', label: 'Beagle', model: 'beagle-1', url: '', isBuiltIn: true },
      { id: 'custom', label: 'Custom', model: 'custom-1', url: 'https://custom.example/v1', isBuiltIn: false },
    ],
    activeId: null,
    fetched: true,
  });

  syncModelPills();
  await openModelPicker();

  assert.equal(document.getElementById('modelPickerLabel').textContent, 'Beagle');
  assert.equal(document.getElementById('modelPickerTrigger').classList.contains('has-model'), true);
  assert.match(document.getElementById('modelPickerMenu').innerHTML, /data-id="beagle-built-in"[^>]+aria-selected="true"/);
  assert.equal(getProviderConfigSnapshot().activeId, 'beagle-built-in');
  assert.equal(document.getElementById('chatModelLabel').textContent, 'Beagle');
  assert.equal(document.getElementById('chatModel').getAttribute('aria-label'), 'Model: Beagle. Click to switch.');
  assert.match(document.querySelector('.chat-model-glyph').innerHTML, /<svg/);
});

test('chat model header follows a custom active provider and syncs its title', () => {
  publishProviderConfig({
    providers: [{ id: 'custom', label: 'Custom', model: 'custom-1', url: 'https://custom.example/v1', isBuiltIn: false }],
    activeId: 'custom',
    fetched: true,
  });

  syncChatModel();

  assert.equal(document.getElementById('chatModelLabel').textContent, 'Custom');
  assert.equal(document.getElementById('chatModelLabel').title, 'custom-1');
  assert.ok(document.getElementById('chatModel').getAttribute('data-glyph'));
  assert.equal(document.getElementById('chatModel').classList.contains('has-model'), true);
});
