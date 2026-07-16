// @ts-check
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { requireOwnedArtifact } from '../src/services/artifactOwnership.js';
import { NotFound } from '../src/lib/errors.js';

function fakeDbReturning(rows) {
  const calls = [];
  const db = {
    calls,
    select(selection) {
      calls.push({ op: 'select', selection });
      return {
        from(table) {
          calls.push({ op: 'from', table });
          return {
            where(condition) {
              calls.push({ op: 'where', condition });
              return {
                limit(n) {
                  calls.push({ op: 'limit', n });
                  return Promise.resolve(rows);
                },
              };
            },
          };
        },
      };
    },
  };
  return db;
}

describe('requireOwnedArtifact', () => {
  test('returns the artifact when the current user owns it', async () => {
    const db = fakeDbReturning([{ id: 'artifact-1' }]);

    const artifact = await requireOwnedArtifact(db, 'artifact-1', 'user-1');

    assert.deepEqual(artifact, { id: 'artifact-1' });
    assert.equal(db.calls.some((call) => call.op === 'where'), true);
    assert.equal(db.calls.some((call) => call.op === 'limit' && call.n === 1), true);
  });

  test('throws NotFound when the artifact is missing or belongs to another user', async () => {
    const db = fakeDbReturning([]);

    await assert.rejects(
      () => requireOwnedArtifact(db, 'artifact-2', 'user-1'),
      (err) => err instanceof NotFound && err.message === 'Artifact not found',
    );
  });
});
