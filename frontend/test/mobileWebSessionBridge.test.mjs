import assert from 'node:assert/strict';
import test from 'node:test';

const originalWindow = globalThis.window;

async function withBridgeWindow(windowValue, callback) {
  globalThis.window = windowValue;
  try {
    const moduleUrl = new URL('../src/native/mobileWebSessionBridge.js', import.meta.url);
    moduleUrl.searchParams.set('test', String(Math.random()));
    const bridge = await import(moduleUrl.href);
    await callback(bridge);
  } finally {
    globalThis.window = originalWindow;
  }
}

test('mobile WebView target cleanup preserves the workspace route it just opened', async () => {
  const calls = [];
  const windowValue = {
    location: { href: 'https://app.example.test/?mobile_target=projects&chat=keep' },
    openNav(target) {
      assert.equal(target, 'projects');
      this.location.href = 'https://app.example.test/projects?mobile_target=projects&chat=keep';
    },
    history: {
      state: { from: 'mobile' },
      replaceState(state, _title, url) { calls.push({ state, url }); },
    },
  };

  await withBridgeWindow(windowValue, async ({ openMobileTargetFromUrl }) => {
    assert.equal(openMobileTargetFromUrl(), true);
  });

  assert.deepEqual(calls, [{ state: { from: 'mobile' }, url: '/projects?chat=keep' }]);
});

test('unknown mobile targets stay inert and do not rewrite history', async () => {
  const calls = [];
  const windowValue = {
    location: { href: 'https://app.example.test/?mobile_target=https%3A%2F%2Fevil.example' },
    history: { state: null, replaceState(...args) { calls.push(args); } },
  };

  await withBridgeWindow(windowValue, async ({ openMobileTargetFromUrl }) => {
    assert.equal(openMobileTargetFromUrl(), false);
  });

  assert.deepEqual(calls, []);
});
