import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!doctype html><html><body>
  <div id="sidebar" class="collapsed"></div>
  <div id="sidebarBackdrop"></div>
  <div id="confirmOverlay" class="hidden"></div>
  <div id="cmdKOverlay" class="hidden"></div>
  <div id="storageModalOverlay" class="hidden"></div>
  <div id="promptTemplatesOverlay" class="hidden"></div>
  <div id="cheatsheetOverlay" class="hidden"></div>
  <div id="shareOverlay" class="hidden"></div>
</body></html>`,
  { url: 'https://appassets.androidplatform.net/assets/spa/index.html' },
);

globalThis.window = dom.window;
globalThis.document = dom.window.document;

if (typeof navigator !== 'undefined' && typeof navigator.vibrate !== 'function') {
  Object.defineProperty(navigator, 'vibrate', {
    value: () => true,
    configurable: true,
    writable: true,
  });
}

const {
  initAndroidBridge,
  handleBackPress,
  onKeyboardHeight,
  setSystemInsets,
  triggerHaptic,
  isAndroidHybrid,
} = await import('../src/native/androidBridge.ts');

test('initAndroidBridge populates window.__socratesNative with core methods', () => {
  initAndroidBridge();
  assert.ok(window.__socratesNative, '__socratesNative should be on window');
  assert.equal(typeof window.__socratesNative.handleBackPress, 'function');
  assert.equal(typeof window.__socratesNative.onKeyboardHeight, 'function');
  assert.equal(typeof window.__socratesNative.setSystemInsets, 'function');
});

test('setSystemInsets sets CSS variables on root document', () => {
  setSystemInsets({ top: 32, bottom: 24, left: 12, right: 12 });
  assert.equal(document.documentElement.style.getPropertyValue('--app-safe-top'), '32px');
  assert.equal(document.documentElement.style.getPropertyValue('--app-safe-bottom'), '24px');
  assert.equal(document.documentElement.style.getPropertyValue('--app-safe-left'), '12px');
  assert.equal(document.documentElement.style.getPropertyValue('--app-safe-right'), '12px');
});

test('onKeyboardHeight sets --native-keyboard-inset and invokes lift', () => {
  let notifiedKind = null;
  let notifiedHeight = null;
  window.__socratesKeyboard = {
    notifyNativeKeyboard(kind, height) {
      notifiedKind = kind;
      notifiedHeight = height;
    },
  };

  onKeyboardHeight(280);
  assert.equal(document.documentElement.style.getPropertyValue('--native-keyboard-inset'), '280px');
  assert.equal(notifiedKind, 'show');
  assert.equal(notifiedHeight, 280);

  onKeyboardHeight(0);
  assert.equal(document.documentElement.style.getPropertyValue('--native-keyboard-inset'), '0px');
  assert.equal(notifiedKind, 'hide');
});

test('triggerHaptic delegates to SocratesAndroid when present', () => {
  let performed = null;
  window.SocratesAndroid = {
    performHaptic(type) {
      performed = type;
    },
  };

  assert.equal(isAndroidHybrid(), true);
  triggerHaptic('tick');
  assert.equal(performed, 'tick');

  triggerHaptic('success');
  assert.equal(performed, 'success');

  delete window.SocratesAndroid;
});

test('handleBackPress dismisses open overlays and returns true, or false if root', () => {
  // Initially nothing is open
  assert.equal(handleBackPress(), false);

  // When cmdK is visible
  const cmdK = document.getElementById('cmdKOverlay');
  cmdK.classList.remove('hidden');
  assert.equal(handleBackPress(), true);

  // When confirm overlay is visible
  const confirm = document.getElementById('confirmOverlay');
  confirm.classList.remove('hidden');
  assert.equal(handleBackPress(), true);

  // Reset hidden classes
  confirm.classList.add('hidden');
  cmdK.classList.add('hidden');
  assert.equal(handleBackPress(), false);
});


test('hybrid chrome follows the resolved theme and ignores unrelated changes', async () => {
  const modes = [];
  const root = document.documentElement;
  root.setAttribute('data-mode', 'dark');
  window.SocratesAndroid = { setThemeMode: (mode) => modes.push(mode) };
  try {
    initAndroidBridge();
    assert.deepEqual(modes, ['dark']);
    root.setAttribute('data-mode', 'light');
    await Promise.resolve();
    root.setAttribute('data-theme', 'philosophy');
    await Promise.resolve();
    assert.deepEqual(modes, ['dark', 'light']);
    root.setAttribute('data-mode', 'invalid');
    await Promise.resolve();
    assert.deepEqual(modes, ['dark', 'light']);
  } finally {
    delete window.SocratesAndroid;
    initAndroidBridge();
    root.removeAttribute('data-mode');
  }
});
