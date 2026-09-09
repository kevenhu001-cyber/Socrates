import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cloudProviderConfigId,
  cloudProviderSelector,
} from '../src/services/oomolProjectConnector.js';

function withEnv(value, fn) {
  const prev = process.env.OC_CLOUD_PROVIDER_CONFIG_IDS;
  try {
    if (value === undefined) delete process.env.OC_CLOUD_PROVIDER_CONFIG_IDS;
    else process.env.OC_CLOUD_PROVIDER_CONFIG_IDS = value;
    fn();
  } finally {
    if (prev === undefined) delete process.env.OC_CLOUD_PROVIDER_CONFIG_IDS;
    else process.env.OC_CLOUD_PROVIDER_CONFIG_IDS = prev;
  }
}

test('cloudProviderConfigId returns null without a map', () => {
  withEnv(undefined, () => {
    assert.equal(cloudProviderConfigId('linear'), null);
  });
});

test('cloudProviderConfigId ignores invalid JSON', () => {
  withEnv('{nope', () => {
    assert.equal(cloudProviderConfigId('linear'), null);
  });
  withEnv('["linear"]', () => {
    assert.equal(cloudProviderConfigId('linear'), null);
  });
});

test('cloudProviderConfigId matches case-insensitively, misses return null', () => {
  withEnv('{"linear":"pc-1","Slack":"pc-2"}', () => {
    assert.equal(cloudProviderConfigId('linear'), 'pc-1');
    assert.equal(cloudProviderConfigId('Linear'), 'pc-1');
    assert.equal(cloudProviderConfigId('SLACK'), 'pc-2');
    assert.equal(cloudProviderConfigId('amap'), null);
    assert.equal(cloudProviderConfigId(''), null);
  });
});

test('cloudProviderSelector passes exactly one selector shape', () => {
  withEnv('{"linear":"pc-1"}', () => {
    assert.deepEqual(cloudProviderSelector('linear'), { providerConfigId: 'pc-1' });
    const byService = cloudProviderSelector('amap');
    assert.deepEqual(byService, { service: 'amap' });
    assert.ok(!('providerConfigId' in byService));
  });
});
