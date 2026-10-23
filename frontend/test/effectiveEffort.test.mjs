import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * P_model-capability-registry — the browser states the user's intent; the
 * server resolves it against the real model. The server also publishes what
 * the active model supports, so the browser never puts a request on the wire
 * that the model is bound to reject.
 *
 * The rule that matters: an ABSENT capability summary means "nothing is
 * known" and must not change what is sent. Only an explicit "no" does.
 */

const { resolveEffortRequest, resolveEffectiveEffort } = await import('../src/config/effectiveEffort.ts');

test('without a capability summary the intent is forwarded unchanged', () => {
  for (const caps of [undefined, null, {}]) {
    assert.equal(resolveEffortRequest('instant', caps), 'none', String(caps));
    assert.equal(resolveEffortRequest('high', caps), 'high', String(caps));
    assert.equal(resolveEffortRequest('medium', caps), 'medium', String(caps));
    assert.equal(resolveEffortRequest('low', caps), 'low', String(caps));
    assert.equal(resolveEffectiveEffort('instant', caps), 'instant', String(caps));
  }
});

test('a model that cannot switch thinking off never receives an Instant request', () => {
  const caps = { isReasoning: true, supportsInstant: false, supportsEffort: true };
  /* Low is the closest level the app has. */
  assert.equal(resolveEffortRequest('instant', caps), 'low');
  /* The UI shows what is actually in effect, so the picker cannot claim
     Instant while the request asks for something else. */
  assert.equal(resolveEffectiveEffort('instant', caps), 'low');
  /* The other levels are unaffected. */
  assert.equal(resolveEffortRequest('high', caps), 'high');
  assert.equal(resolveEffectiveEffort('high', caps), 'high');
});

test('a model with neither Instant nor effort levels takes no effort parameter', () => {
  const caps = { isReasoning: true, supportsInstant: false, supportsEffort: false };
  assert.equal(resolveEffortRequest('instant', caps), undefined);
  assert.equal(resolveEffortRequest('high', caps), undefined);
  assert.equal(resolveEffectiveEffort('instant', caps), 'medium');
});

test('a model that supports Instant receives the standard no-thinking field', () => {
  const caps = { isReasoning: true, supportsInstant: true, supportsEffort: true };
  assert.equal(resolveEffortRequest('instant', caps), 'none');
  assert.equal(resolveEffectiveEffort('instant', caps), 'instant');
  assert.equal(resolveEffortRequest('low', caps), 'low');
});

test('a model without effort levels receives no level', () => {
  const caps = { isReasoning: true, supportsInstant: true, supportsEffort: false };
  assert.equal(resolveEffortRequest('high', caps), undefined);
  /* Instant still works — it is a different mechanism. */
  assert.equal(resolveEffortRequest('instant', caps), 'none');
});
