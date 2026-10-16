import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedProviderUrl } from '../src/lib/providerUrl.js';

test('isAllowedProviderUrl allows valid public HTTPS URLs', () => {
  assert.equal(isAllowedProviderUrl('https://api.openai.com/v1'), true);
  assert.equal(isAllowedProviderUrl('https://generativelanguage.googleapis.com/v1beta'), true);
  assert.equal(isAllowedProviderUrl('https://api.deepseek.com/v1'), true);
  assert.equal(isAllowedProviderUrl('https://93.184.216.34/v1'), true);
  assert.equal(isAllowedProviderUrl('https://[2606:4700:4700::1111]/v1'), true);
});

test('isAllowedProviderUrl rejects non-HTTPS protocols', () => {
  assert.equal(isAllowedProviderUrl('http://api.openai.com/v1'), false);
  assert.equal(isAllowedProviderUrl('ftp://api.openai.com/v1'), false);
  assert.equal(isAllowedProviderUrl('ws://api.openai.com/v1'), false);
  assert.equal(isAllowedProviderUrl('wss://api.openai.com/v1'), false);
  assert.equal(isAllowedProviderUrl('javascript:alert(1)'), false);
  assert.equal(isAllowedProviderUrl('file:///etc/passwd'), false);
});

test('isAllowedProviderUrl rejects URLs with credentials or fragments', () => {
  assert.equal(isAllowedProviderUrl('https://user:pass@api.openai.com/v1'), false);
  assert.equal(isAllowedProviderUrl('https://user@api.openai.com/v1'), false);
  assert.equal(isAllowedProviderUrl('https://api.openai.com/v1#section'), false);
});

test('isAllowedProviderUrl rejects localhost and internal domain names', () => {
  assert.equal(isAllowedProviderUrl('https://localhost/v1'), false);
  assert.equal(isAllowedProviderUrl('https://sub.localhost/v1'), false);
  assert.equal(isAllowedProviderUrl('https://myhost.local/v1'), false);
  assert.equal(isAllowedProviderUrl('https://test.local/v1'), false);
});

test('isAllowedProviderUrl rejects RFC1918 private IPv4 ranges', () => {
  // 10.0.0.0/8
  assert.equal(isAllowedProviderUrl('https://10.0.0.1/v1'), false);
  assert.equal(isAllowedProviderUrl('https://10.255.255.254/v1'), false);
  // 172.16.0.0/12
  assert.equal(isAllowedProviderUrl('https://172.16.0.1/v1'), false);
  assert.equal(isAllowedProviderUrl('https://172.24.1.1/v1'), false);
  assert.equal(isAllowedProviderUrl('https://172.31.255.254/v1'), false);
  // 192.168.0.0/16
  assert.equal(isAllowedProviderUrl('https://192.168.1.1/v1'), false);
  assert.equal(isAllowedProviderUrl('https://192.168.0.254/v1'), false);
});

test('isAllowedProviderUrl rejects loopback, zero, link-local metadata, CGNAT, and multicast', () => {
  // 127.0.0.0/8
  assert.equal(isAllowedProviderUrl('https://127.0.0.1/v1'), false);
  assert.equal(isAllowedProviderUrl('https://127.1.2.3/v1'), false);
  // 0.0.0.0/8
  assert.equal(isAllowedProviderUrl('https://0.0.0.0/v1'), false);
  // 169.254.0.0/16 (AWS / GCP metadata)
  assert.equal(isAllowedProviderUrl('https://169.254.169.254/latest/meta-data/'), false);
  assert.equal(isAllowedProviderUrl('https://169.254.1.1/v1'), false);
  // 100.64.0.0/10 (Carrier-grade NAT)
  assert.equal(isAllowedProviderUrl('https://100.64.0.1/v1'), false);
  assert.equal(isAllowedProviderUrl('https://100.100.1.1/v1'), false);
  assert.equal(isAllowedProviderUrl('https://100.127.255.254/v1'), false);
  // >= 224 (multicast / reserved)
  assert.equal(isAllowedProviderUrl('https://224.0.0.1/v1'), false);
  assert.equal(isAllowedProviderUrl('https://240.0.0.1/v1'), false);
});

test('isAllowedProviderUrl rejects private and loopback IPv6 addresses', () => {
  assert.equal(isAllowedProviderUrl('https://[::1]/v1'), false);
  assert.equal(isAllowedProviderUrl('https://[fe80::1]/v1'), false);
  assert.equal(isAllowedProviderUrl('https://[fc00::1]/v1'), false);
  assert.equal(isAllowedProviderUrl('https://[fd00::1]/v1'), false);
  // IPv4-mapped addresses
  assert.equal(isAllowedProviderUrl('https://[::ffff:127.0.0.1]/v1'), false);
  assert.equal(isAllowedProviderUrl('https://[::ffff:169.254.169.254]/v1'), false);
  assert.equal(isAllowedProviderUrl('https://[::ffff:10.0.0.1]/v1'), false);
  assert.equal(isAllowedProviderUrl('https://[::ffff:192.168.1.1]/v1'), false);
  // Multicast, discard, documentation, and deprecated IPv4-compatible
  assert.equal(isAllowedProviderUrl('https://[ff02::1]/v1'), false);
  assert.equal(isAllowedProviderUrl('https://[100::1]/v1'), false);
  assert.equal(isAllowedProviderUrl('https://[2001:db8::1]/v1'), false);
  assert.equal(isAllowedProviderUrl('https://[::127.0.0.1]/v1'), false);
  // Public IPv4-mapped address is allowed
  assert.equal(isAllowedProviderUrl('https://[::ffff:93.184.216.34]/v1'), true);
});

test('isAllowedProviderUrl rejects invalid inputs and oversized URLs', () => {
  assert.equal(isAllowedProviderUrl(null), false);
  assert.equal(isAllowedProviderUrl(undefined), false);
  assert.equal(isAllowedProviderUrl(12345), false);
  assert.equal(isAllowedProviderUrl({}), false);
  assert.equal(isAllowedProviderUrl(''), false);
  assert.equal(isAllowedProviderUrl('not a url'), false);
  assert.equal(isAllowedProviderUrl('https://' + 'a'.repeat(2048) + '.com'), false);
});
