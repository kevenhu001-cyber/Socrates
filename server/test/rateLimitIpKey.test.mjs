import assert from 'node:assert/strict';
import test from 'node:test';
import { rateLimitIpKey } from '../src/lib/rateLimitKey.js';

test('IPv6 privacy addresses in the same /56 cannot evade rate limits', () => {
  assert.equal(rateLimitIpKey({ ip: '2001:db8:1234:5601::1' }), rateLimitIpKey({ ip: '2001:db8:1234:56ff::2' }));
  assert.notEqual(rateLimitIpKey({ ip: '2001:db8:1234:5601::1' }), rateLimitIpKey({ ip: '2001:db8:1234:5701::1' }));
});
test('IPv4 keys remain stable and missing IP has one bounded fallback', () => {
  assert.equal(rateLimitIpKey({ ip: '192.0.2.1' }), '192.0.2.1');
  assert.equal(rateLimitIpKey({}), 'unknown');
});
