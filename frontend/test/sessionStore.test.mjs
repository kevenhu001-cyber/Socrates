import assert from 'node:assert/strict';
import test from 'node:test';

import { clearSessionRouteInURL, getVisibleSessions } from '../src/session/store.ts';

test('visible sessions sort pinned rows first without mutating the source list', () => {
  const sessions = [
    { id: 'recent', updated_at: 80 },
    { id: 'pinned-old', pinned: true, pinnedAt: 10 },
    { id: 'older', updatedAt: 20 },
    { id: 'pinned-new', pinned: true, pinnedAt: 30 },
  ];

  const visible = getVisibleSessions(sessions, 100);

  assert.deepEqual(visible.map((session) => session.id), [
    'pinned-new', 'pinned-old', 'recent', 'older',
  ]);
  assert.deepEqual(sessions.map((session) => session.id), [
    'recent', 'pinned-old', 'older', 'pinned-new',
  ]);
});


test('new chat clears every registered workspace route without reloading', async () => {
  const { DESTINATIONS } = await import('../src/sidebar/navigation.destinations.ts');
  const oldLocation = globalThis.location;
  const oldHistory = globalThis.history;
  try {
    for (const { path } of Object.values(DESTINATIONS)) {
      globalThis.location = { pathname: path };
      let target;
      globalThis.history = { replaceState(_state, _title, url) { target = url; } };
      clearSessionRouteInURL();
      assert.equal(target, '/', path);
    }
  } finally {
    if (oldLocation === undefined) delete globalThis.location; else globalThis.location = oldLocation;
    if (oldHistory === undefined) delete globalThis.history; else globalThis.history = oldHistory;
  }
});
