// @ts-check
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mobileRouter, { buildMobileBootstrapConfig, normalizePublicAppUrl } from '../src/routes/mobile.js';
import { httpRequest, listen } from './_http.js';

describe('mobile bootstrap contract', () => {
  test('derives both API prefixes from one normalized web origin', () => {
    assert.equal(normalizePublicAppUrl('https://staging.example.test/some/path'), 'https://staging.example.test');
    assert.deepEqual(buildMobileBootstrapConfig('https://staging.example.test/'), {
      ok: true,
      contractVersion: 1,
      product: 'socrates',
      platform: 'android',
      webBaseUrl: 'https://staging.example.test',
      apiBaseUrl: 'https://staging.example.test/api/v2',
      canonicalApiBaseUrl: 'https://staging.example.test/api',
      healthPath: '/api/v2/health',
    });
  });

  test('falls back safely when APP_URL is malformed', () => {
    assert.equal(normalizePublicAppUrl('javascript:alert(1)'), 'https://app.topodrive.top');
  });

  describe('GET /api/mobile/bootstrap', () => {
    let server;
    const previousAppUrl = process.env.APP_URL;

    before(async () => {
      process.env.APP_URL = 'https://mobile.example.test/';
      const app = express();
      app.use('/api/mobile', mobileRouter);
      server = await listen(app);
    });

    after(async () => {
      await server.close();
      if (previousAppUrl === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previousAppUrl;
    });

    test('is public, non-cacheable, and reports the server contract', async () => {
      const response = await httpRequest(`${server.url}/api/mobile/bootstrap`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.body.contractVersion, 1);
      assert.equal(response.body.webBaseUrl, 'https://mobile.example.test');
      assert.equal(response.body.apiBaseUrl, 'https://mobile.example.test/api/v2');
    });
  });
});
