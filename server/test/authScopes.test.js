import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as contract from '../src/lib/authScopes.js';
import * as middleware from '../src/middleware/scopes.js';
import { buildAuthorizationServerMetadata } from '../src/lib/oauthMeta.js';

test('HTTP compatibility exports share the neutral permission contract', () => {
  for (const name of ['ALL_SCOPES', 'ALL_SCOPES_SET', 'SCOPE_DESCRIPTIONS', 'parseScopes', 'parseScopeParam']) {
    assert.equal(middleware[name], contract[name], name);
  }
});

test('OAuth discovery advertises exactly the shared permission vocabulary', () => {
  const metadata = buildAuthorizationServerMetadata();
  assert.deepEqual(metadata.scopes_supported, [...contract.ALL_SCOPES]);
  // Discovery returns a copy; consumers cannot mutate the shared array.
  metadata.scopes_supported.push('untrusted:write');
  assert.equal(contract.ALL_SCOPES_SET.has('untrusted:write'), false);
  assert.equal(contract.parseScopes(['untrusted:write']), null);
});
