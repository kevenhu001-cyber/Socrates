import assert from 'node:assert/strict';
import test from 'node:test';
import { setDeepResearchEnabled } from '../src/config/deepResearchMode.ts';
import { setWebSearchOn, setExtensiveThinkingOn } from '../src/config/providers.ts';
import { configureTemplateSystemPrompt } from '../src/chat/templateSystemPrompt.ts';

globalThis.window = {
  _activeTemplate: { extensionKey: 'stale' },
  webSearchOn: false,
  deepResearchOn: false,
  extensiveThinkingOn: true,
};

const { getActiveTemplateExtensionKey, isDeepResearchOn, isExtensiveThinkingOn, isWebSearchOn } =
  await import('../src/react/legacy/gateway.ts');

test('composer accessors use canonical module state, not stale browser globals', (t) => {
  t.after(() => {
    configureTemplateSystemPrompt({ getActiveTemplate: () => null });
    setWebSearchOn(false);
    setDeepResearchEnabled(false);
    setExtensiveThinkingOn(false);
  });
  configureTemplateSystemPrompt({ getActiveTemplate: () => ({ extensionKey: 'write' }) });
  setWebSearchOn(true);
  setDeepResearchEnabled(true);
  setExtensiveThinkingOn(false);

  assert.equal(getActiveTemplateExtensionKey(), 'write');
  assert.equal(isWebSearchOn(), true);
  assert.equal(isDeepResearchOn(), true);
  assert.equal(isExtensiveThinkingOn(), false);
});

test('active template accessor safely handles absent or malformed template data', (t) => {
  t.after(() => configureTemplateSystemPrompt({ getActiveTemplate: () => null }));
  configureTemplateSystemPrompt({ getActiveTemplate: () => ({ extensionKey: 42 }) });
  assert.equal(getActiveTemplateExtensionKey(), null);

  configureTemplateSystemPrompt({ getActiveTemplate: () => null });
  assert.equal(getActiveTemplateExtensionKey(), null);
});
