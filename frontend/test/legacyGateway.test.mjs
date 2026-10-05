import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = {
  _activeTemplate: null,
  webSearchOn: false,
  deepResearchOn: false,
  extensiveThinkingOn: false,
};

const {
  getActiveTemplateExtensionKey,
  isDeepResearchOn,
  isExtensiveThinkingOn,
  isWebSearchOn,
} = await import('../src/react/legacy/gateway.ts');

test('typed legacy accessors read active composer mode and toggle flags', () => {
  window._activeTemplate = { extensionKey: 'write' };
  window.webSearchOn = true;
  window.deepResearchOn = 1;
  window.extensiveThinkingOn = false;

  assert.equal(getActiveTemplateExtensionKey(), 'write');
  assert.equal(isWebSearchOn(), true);
  assert.equal(isDeepResearchOn(), true);
  assert.equal(isExtensiveThinkingOn(), false);
});

test('active template accessor safely handles absent or malformed legacy data', () => {
  window._activeTemplate = { extensionKey: 42 };
  assert.equal(getActiveTemplateExtensionKey(), null);

  window._activeTemplate = null;
  assert.equal(getActiveTemplateExtensionKey(), null);
});
