import assert from 'node:assert/strict';
import test from 'node:test';

import { syncQuickChips } from '../src/extensions/chipSync.ts';

function fakeEl() {
  const toggled = [];
  return {
    toggled,
    classList: { toggle: (name, on) => toggled.push([name, on]) },
  };
}

function fakeRoot({ research, deep } = {}) {
  return {
    getElementById: (id) => {
      if (id === 'quickResearchChip') return research ?? null;
      if (id === 'quickDeepResearchChip') return deep ?? null;
      return null;
    },
    querySelector: () => null,
  };
}

test('syncQuickChips mirrors webSearchOn/deepResearchOn onto chips', () => {
  const research = fakeEl();
  const deep = fakeEl();
  globalThis.window = { webSearchOn: true, deepResearchOn: false };
  syncQuickChips(fakeRoot({ research, deep }));
  assert.deepEqual(research.toggled, [['active', true]]);
  assert.deepEqual(deep.toggled, [['active', false]]);
  delete globalThis.window;
});

test('syncQuickChips tolerates missing chips', () => {
  globalThis.window = {};
  assert.doesNotThrow(() => syncQuickChips(fakeRoot()));
  delete globalThis.window;
});
