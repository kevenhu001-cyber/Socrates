import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

/* The bridge imports the real nav module — openMobileTargetFromUrl() calls
   openNav() directly rather than probing window.openNav. Boot the whole
   module graph against a jsdom document and let jsdom's history carry the
   route change openNav('projects') pushes. */
const dom = new JSDOM(`<!doctype html><html><body>
  <div id="sidebar" class="collapsed"></div>
  <div id="sidebarBackdrop"></div>
  <div id="mainInner">
    <div id="topicSetup"></div>
    <div id="diagnosticView" class="hidden"></div>
    <div id="chatView" class="hidden"></div>
    <div id="chatPage" class="hidden"></div>
    <div id="libraryPanel" class="main-page hidden"></div>
    <div id="spacesPanel" class="main-page hidden"></div>
    <div id="scheduledPanel" class="main-page hidden"></div>
    <div id="pluginsPanel" class="main-page hidden"></div>
    <div id="imagesPanel" class="main-page hidden"></div>
    <div id="assistantsPanel" class="main-page hidden"></div>
    <div id="sitesPanel" class="main-page hidden"></div>
    <div id="adminPanel" class="main-page hidden"></div>
    <div id="examView" class="hidden"></div>
  </div>
</body></html>`, { url: 'https://app.example.test/' });

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.history = dom.window.history;
globalThis.localStorage = dom.window.localStorage;
window.apiFetch = async () => ({ projects: [] });
window.t = (key, fallback) => (fallback !== undefined ? fallback : key);

const { openMobileTargetFromUrl } = await import('../src/native/mobileWebSessionBridge.js');

function recordReplaceState() {
  const calls = [];
  const real = window.history.replaceState.bind(window.history);
  window.history.replaceState = (state, title, url) => {
    calls.push({ state, url });
    return real(state, title, url);
  };
  return { calls, restore: () => { window.history.replaceState = real; } };
}

test('mobile WebView target cleanup preserves the workspace route it just opened', async () => {
  window.history.replaceState({ from: 'mobile' }, '', '/?mobile_target=projects&chat=keep');
  const { calls, restore } = recordReplaceState();
  try {
    assert.equal(openMobileTargetFromUrl(), true);
    /* openNav('projects') pushes /projects itself; the cleanup must rewrite
       the CURRENT entry rather than the pre-navigation "/" URL. */
    assert.deepEqual(calls, [{ state: { workspace: 'projects' }, url: '/projects' }]);
    assert.equal(window.location.pathname + window.location.search, '/projects');
  } finally {
    restore();
  }
});

test('unknown mobile targets stay inert and do not rewrite history', async () => {
  window.history.replaceState({}, '', '/?mobile_target=https%3A%2F%2Fevil.example');
  const { calls, restore } = recordReplaceState();
  try {
    assert.equal(openMobileTargetFromUrl(), false);
    assert.deepEqual(calls, []);
  } finally {
    restore();
  }
});
