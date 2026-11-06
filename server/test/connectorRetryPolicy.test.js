import assert from 'node:assert/strict';
import test from 'node:test';

import { isRetryableConnectorFailure } from '../src/services/integrations/connectorRetryPolicy.js';
import {
  connectorErrorPayload,
  isRetryableConnectorStatus,
} from '../src/services/integrations/oomolProjectConnector.js';
import {
  getOpenConnectorChatTool,
  isOpenConnectorActionRetryable,
} from '../src/services/integrations/openConnectorChatTools.js';

test('connector retry policy distinguishes transient HTTP failures from configuration errors', () => {
  for (const status of [408, 425, 429, 500, 502, 503, 504]) {
    assert.equal(isRetryableConnectorStatus(status), true, `${status} should be retryable`);
  }
  for (const status of [200, 400, 401, 403, 404, 501, 505]) {
    assert.equal(isRetryableConnectorStatus(status), false, `${status} should not be retryable`);
  }
});

test('connector retry policy only retries known transient failures', () => {
  assert.equal(isRetryableConnectorFailure({ message: 'unexpected programming error' }), false);
  assert.equal(isRetryableConnectorFailure({ status: 401, cause: { code: 'ECONNRESET' } }), false);
  assert.equal(isRetryableConnectorFailure({ status: 503 }), true);
  assert.equal(isRetryableConnectorFailure({ cause: { code: 'ECONNRESET' } }), true);
  assert.equal(isRetryableConnectorFailure({ status: 0, cause: { code: 'ECONNRESET' } }), true);
  assert.equal(isRetryableConnectorFailure({ status: 0, code: 'client_timeout' }), true);
  assert.equal(isRetryableConnectorFailure({ status: 0, code: 'client_network_error' }), true);
  assert.equal(isRetryableConnectorFailure({ status: 409, code: 'request_in_progress' }), true);
  assert.equal(isRetryableConnectorFailure({ status: 0, code: 'client_wait_timeout' }), false);
  assert.equal(isRetryableConnectorFailure({ name: 'TimeoutError' }), true);
  assert.equal(isRetryableConnectorFailure({ name: 'AbortError' }), false);
  assert.equal(isRetryableConnectorFailure({ name: 'AbortError', status: 503, code: 'ECONNRESET', retryable: true }), false);
});

test('unknown connector exceptions do not invite blind retries', () => {
  assert.equal(connectorErrorPayload(new Error('unexpected programming error')).retryable, false);
  const networkError = new Error('fetch failed');
  networkError.cause = { code: 'ECONNRESET' };
  assert.equal(connectorErrorPayload(networkError).retryable, true);
});

test('non-idempotent image generation is excluded from automatic retries', () => {
  const imageSubmission = getOpenConnectorChatTool('oc_jimeng_ai_submit_image_generation_4_6');
  const imageResult = getOpenConnectorChatTool('oc_jimeng_ai_get_image_generation_4_6_result');

  assert.equal(imageSubmission?.retryableOnTransientError, false);
  assert.notEqual(imageResult?.retryableOnTransientError, false);
  assert.equal(isOpenConnectorActionRetryable(imageSubmission?.tool), false);
  assert.equal(isOpenConnectorActionRetryable(imageResult?.tool), true);
  assert.equal(isOpenConnectorActionRetryable('oc_unknown_action'), false);
});
