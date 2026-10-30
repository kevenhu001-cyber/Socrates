import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><main id="appShell"></main><div id="legacyModal"><button>First</button><button>Last</button></div><div id="managedModal"><button>Managed first</button><button>Managed last</button></div></body>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// The helper only needs to know which controls participate in layout.
dom.window.HTMLElement.prototype.getClientRects = () => [{}];
const { setModalOpen } = await import('../src/ui/modalA11y.ts');

test.afterEach(() => {
  setModalOpen('legacyModal', false);
  setModalOpen('managedModal', false);
});

function tabFromLast(id) {
  const [first, last] = document.getElementById(id).querySelectorAll('button');
  last.focus();
  const event = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  last.dispatchEvent(event);
  return { event, first, last };
}

test('legacy dialogs retain their Tab trap and release shell inertness', () => {
  setModalOpen('legacyModal', true);
  assert.equal(document.getElementById('appShell').hasAttribute('inert'), true);
  const { event, first } = tabFromLast('legacyModal');
  assert.equal(event.defaultPrevented, true);
  assert.equal(document.activeElement, first);
  setModalOpen('legacyModal', false);
  assert.equal(document.getElementById('appShell').hasAttribute('inert'), false);
});

test('a primitive-managed dialog keeps the shell inert without a second Tab trap', () => {
  setModalOpen('managedModal', true, null, { focusManaged: true });
  const { event, last } = tabFromLast('managedModal');
  assert.equal(document.getElementById('appShell').hasAttribute('inert'), true);
  assert.equal(event.defaultPrevented, false);
  assert.equal(document.activeElement, last);
});

test('closing a managed child restores the legacy parent trap and retains inertness', () => {
  setModalOpen('legacyModal', true);
  setModalOpen('managedModal', true, null, { focusManaged: true });
  assert.equal(tabFromLast('managedModal').event.defaultPrevented, false);
  setModalOpen('managedModal', false);
  setModalOpen('managedModal', false);
  assert.equal(document.getElementById('appShell').hasAttribute('inert'), true);
  const { event, first } = tabFromLast('legacyModal');
  assert.equal(event.defaultPrevented, true);
  assert.equal(document.activeElement, first);
});
