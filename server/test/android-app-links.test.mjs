import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import app from '../src/app.js';
import { listen, httpRequest } from './_http.js';
import { shutdownPubsub } from '../src/lib/pubsub.js';

let server;
const priorPackage = process.env.ANDROID_APP_LINKS_PACKAGE_NAME;
const priorFingerprints = process.env.ANDROID_APP_LINKS_SHA256_FINGERPRINTS;
before(async () => { server = await listen(app); });
after(async () => {
  if (priorPackage === undefined) delete process.env.ANDROID_APP_LINKS_PACKAGE_NAME;
  else process.env.ANDROID_APP_LINKS_PACKAGE_NAME = priorPackage;
  if (priorFingerprints === undefined) delete process.env.ANDROID_APP_LINKS_SHA256_FINGERPRINTS;
  else process.env.ANDROID_APP_LINKS_SHA256_FINGERPRINTS = priorFingerprints;
  await server.close();
  await shutdownPubsub();
});
async function association() {
  const response = await httpRequest(server.url + '/.well-known/assetlinks.json');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  return response.body;
}

test('missing or malformed association configuration fails closed', async () => {
  delete process.env.ANDROID_APP_LINKS_PACKAGE_NAME;
  delete process.env.ANDROID_APP_LINKS_SHA256_FINGERPRINTS;
  assert.deepEqual(await association(), []);
  process.env.ANDROID_APP_LINKS_PACKAGE_NAME = 'com.socrates.android';
  process.env.ANDROID_APP_LINKS_SHA256_FINGERPRINTS = 'not-a-sha256-fingerprint';
  assert.deepEqual(await association(), []);
  process.env.ANDROID_APP_LINKS_PACKAGE_NAME = 'com.socrates.android/invalid';
  process.env.ANDROID_APP_LINKS_SHA256_FINGERPRINTS = Array(32).fill('AB').join(':');
  assert.deepEqual(await association(), []);
});

test('valid release fingerprints produce only the expected package association and deduplicate', async () => {
  process.env.ANDROID_APP_LINKS_PACKAGE_NAME = 'com.socrates.android';
  const fingerprint = Array(32).fill('AB').join(':');
  process.env.ANDROID_APP_LINKS_SHA256_FINGERPRINTS = ` ${fingerprint.toLowerCase()},bad,${fingerprint} `;
  assert.deepEqual(await association(), [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: 'com.socrates.android', sha256_cert_fingerprints: [fingerprint] },
  }]);
});
