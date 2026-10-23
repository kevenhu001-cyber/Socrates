import test from 'node:test';
import assert from 'node:assert/strict';
import { missingScheduledTaskForeignKeys } from '../src/lib/deploySchema.js';
import { assertTestDatabaseUrl } from '../src/lib/testDatabaseSafety.js';

const keys = [
  { source_column: 'user_id', target_table: 'users', target_column: 'id', on_delete: 'c', validated: true },
  { source_column: 'session_id', target_table: 'sessions', target_column: 'id', on_delete: 'n', validated: true },
];
test('deployment schema requires validated owner/session FK semantics, independent of names', () => {
  assert.deepEqual(missingScheduledTaskForeignKeys(keys), []);
  assert.equal(missingScheduledTaskForeignKeys([]).length, 2);
  assert.equal(missingScheduledTaskForeignKeys(keys.map((k) => ({ ...k, validated: false }))).length, 2);
  assert.equal(missingScheduledTaskForeignKeys([{ ...keys[0], on_delete: 'a' }, keys[1]]).length, 1);
});
test('test DB guard accepts only explicitly named test/qa targets and never leaks credentials', () => {
  for (const name of ['socrates_test', 'test_socrates', 'socrates-test-latency', 'socrates_qa']) {
    assert.doesNotThrow(() => assertTestDatabaseUrl(`postgres://u:secret@localhost/${name}`));
  }
  for (const name of ['socrates', 'postgres', 'production', 'latest', 'contest']) {
    assert.throws(() => assertTestDatabaseUrl(`postgres://u:secret@localhost/${name}`), (error) => !error.message.includes('secret') && /Refusing/.test(error.message));
  }
  assert.doesNotThrow(() => assertTestDatabaseUrl(undefined));
});
