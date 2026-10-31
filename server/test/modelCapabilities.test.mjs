import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { callChatCompletion } from '../src/services/core/llm.js';
import {
  DEFAULT_CONTEXT_BUDGET_TOKENS,
  resolveContextBudget,
  resolveModelCapability,
  mapEffortLevel,
  summarizeModelCapabilities,
} from '../src/lib/modelCapabilities.js';

/**
 * P_model-capability-registry — the request builder used to guess a model's
 * capabilities from a brand substring (`/qwen|qwq/`, `/minimax|deepseek|glm|
 * kimi/`). The guesses were wrong in ways that produced 400s and, worse,
 * silent behaviour changes. These tests pin the declared behaviour of each
 * verified family and the explicit handling of an undeclared model.
 */

const fetchBefore = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchBefore; });

const opts = { apiBase: 'https://llm.example.com/v1', apiKey: 'test-secret', model: 'MiniMax-M3', messages: [{ role: 'user', content: 'hello' }] };
const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));

async function bodyFor(overrides) {
  let body;
  globalThis.fetch = async (_url, init) => { body = JSON.parse(init.body); return ok(); };
  await callChatCompletion({ ...opts, ...overrides });
  return body;
}

/* ── Registry resolution ────────────────────────────────────────────── */

test('the registry resolves a declared family and leaves an undeclared model unknown', () => {
  assert.equal(resolveModelCapability('MiniMax-M3.1-Flash').id, 'minimax-m3.1-flash');
  assert.equal(resolveModelCapability('MiniMax-M3').id, 'minimax-m3');
  assert.equal(resolveModelCapability('deepseek-chat').id, 'deepseek-legacy');
  assert.equal(resolveModelCapability('deepseek-flash').id, 'deepseek-v4');
  assert.equal(resolveModelCapability('glm-5.3').id, 'glm-5.3');
  assert.equal(resolveModelCapability('glm-4.7').id, 'glm-4');
  assert.equal(resolveModelCapability('kimi-k3').id, 'kimi-k3');
  assert.equal(resolveModelCapability('kimi-k2.6').id, 'kimi-k2.6');
  assert.equal(resolveModelCapability('Qwen/Qwen3-8B').id, 'qwen3-hybrid');
  assert.equal(resolveModelCapability('qwen3.8-2.4t-a95b').id, 'qwen3-thinking-only');
  assert.equal(resolveModelCapability('gpt-4o').id, 'gpt-4o');
  assert.equal(resolveModelCapability('gpt-4.1').id, 'gpt-4.1');
  assert.equal(resolveModelCapability('gpt-5.2').id, 'gpt-5.2');
  assert.equal(resolveModelCapability('gpt-5.1').id, 'gpt-5.2');
  assert.equal(resolveModelCapability('gpt-5-mini').id, 'gpt-5-mini');
  assert.equal(resolveModelCapability('gpt-5').id, 'gpt-5');
  assert.equal(resolveModelCapability('gpt-6-astra').id, 'gpt-6-astra');
  assert.equal(resolveModelCapability('gpt-6.1-sol').id, 'gpt-6.1-sol');
  assert.equal(resolveModelCapability('gpt-6-sol').id, 'gpt-6-sol');
  assert.equal(resolveModelCapability('gpt-5.6-terra').id, 'gpt-5.6');

  /* An undeclared model is UNKNOWN — a declared state, not a guess. */
  assert.equal(resolveModelCapability('claude-sonnet-4').id, 'unknown');
  assert.equal(resolveModelCapability('anthropic/claude-3-5-sonnet').id, 'unknown');
  assert.equal(resolveModelCapability('custom-model').id, 'unknown');
  assert.equal(resolveModelCapability('').id, 'unknown');
  /* A brand substring in the middle of a custom name is not the family. */
  assert.equal(resolveModelCapability('my-deepseek-proxy').id, 'unknown');
  assert.equal(resolveModelCapability('qwen-tuned-deepseek').id, 'unknown');
});

/* ── Instant: the encoding belongs to the model ─────────────────────── */

test('Instant is encoded the way each family documents it', async () => {
  const m3 = await bodyFor({ model: 'MiniMax-M3', reasoning_effort: 'none' });
  assert.deepEqual(m3.thinking, { type: 'disabled' });
  assert.equal(m3.reasoning_effort, undefined);

  const deepseek = await bodyFor({ model: 'deepseek-chat', reasoning_effort: 'none' });
  assert.deepEqual(deepseek.thinking, { type: 'disabled' });
  assert.equal(deepseek.reasoning_effort, undefined);

  const glm = await bodyFor({ model: 'glm-4.7', reasoning_effort: 'none' });
  assert.deepEqual(glm.thinking, { type: 'disabled' });

  const kimi = await bodyFor({ model: 'kimi-k2.6', reasoning_effort: 'none' });
  assert.deepEqual(kimi.thinking, { type: 'disabled' });

  /* Model Studio documents the top-level `enable_thinking`; a self-hosted
     vLLM exposes the same switch as `chat_template_kwargs`. */
  const dashscope = await bodyFor({ model: 'Qwen3-32B', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1', reasoning_effort: 'none' });
  assert.equal(dashscope.enable_thinking, false);
  assert.equal(dashscope.chat_template_kwargs, undefined);

  const vllm = await bodyFor({ model: 'Qwen/Qwen3-8B', reasoning_effort: 'none' });
  assert.deepEqual(vllm.chat_template_kwargs, { enable_thinking: false });
  assert.equal(vllm.enable_thinking, undefined);

  /* An undeclared model gets the OpenAI-standard spelling and nothing
     vendor-specific. */
  const undeclared = await bodyFor({ model: 'custom-model', reasoning_effort: 'none' });
  assert.equal(undeclared.reasoning_effort, 'none');
  assert.equal(undeclared.thinking, undefined);
  assert.equal(undeclared.enable_thinking, undefined);
  assert.equal(undeclared.chat_template_kwargs, undefined);

  /* A model that never thinks needs no switch at all. */
  const gpt4o = await bodyFor({ model: 'gpt-4o', reasoning_effort: 'none' });
  assert.equal(gpt4o.reasoning_effort, undefined);
  assert.equal(gpt4o.thinking, undefined);

  /* OpenAI spells "no reasoning" with the standard field. */
  const gpt52 = await bodyFor({ model: 'gpt-5.2', reasoning_effort: 'none' });
  assert.equal(gpt52.reasoning_effort, 'none');
  assert.equal(gpt52.thinking, undefined);
});

test('a model that cannot turn thinking off fails locally, with no upstream call', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return ok(); };
  /* Each of these either rejects `thinking.type=disabled` outright or ignores
     it — which would silently resume thinking although the user asked for
     Instant. Both are refused before a request is made. */
  for (const model of ['kimi-k3', 'kimi-k2.7-code', 'glm-5.3', 'qwen3.8-2.4t-a95b', 'qwq-32b', 'MiniMax-M3.1-Flash', 'minimax-m2.5', 'gpt-5']) {
    await assert.rejects(
      () => callChatCompletion({ ...opts, model, reasoning_effort: 'none' }),
      { status: 400, code: 'MODEL_MODE_UNSUPPORTED' },
      model,
    );
  }
  assert.equal(calls, 0);
});

/* ── Effort levels ──────────────────────────────────────────────────── */

test('the effort level is translated into the provider vocabulary', async () => {
  const flash = await bodyFor({ model: 'MiniMax-M3.1-Flash', reasoning_effort: 'high' });
  assert.equal(flash.reasoning_effort, 'high');

  const flashMedium = await bodyFor({ model: 'MiniMax-M3.1-Flash', reasoning_effort: 'medium' });
  assert.equal(flashMedium.reasoning_effort, 'medium');

  /* DeepSeek has no `medium`: the provider maps it to `high`. Saying so
     explicitly keeps the app's Medium from silently becoming something else. */
  const deepseekMedium = await bodyFor({ model: 'deepseek-chat', reasoning_effort: 'medium' });
  assert.equal(deepseekMedium.reasoning_effort, 'high');

  const deepseekLow = await bodyFor({ model: 'deepseek-chat', reasoning_effort: 'low' });
  assert.equal(deepseekLow.reasoning_effort, 'low');

  const kimiK3 = await bodyFor({ model: 'kimi-k3', reasoning_effort: 'low' });
  assert.equal(kimiK3.reasoning_effort, 'low');

  const gpt52 = await bodyFor({ model: 'gpt-5.2', reasoning_effort: 'high' });
  assert.equal(gpt52.reasoning_effort, 'high');
});

test('a model that ignores or rejects effort levels is never sent one', async () => {
  /* MiniMax-M3 accepts the field but ignores it; Qwen has no effort levels;
     gpt-4o rejects the field outright; an undeclared model keeps the wire
     exactly as it was before the registry existed. */
  for (const model of ['MiniMax-M3', 'Qwen3-32B', 'gpt-4o', 'custom-model']) {
    const body = await bodyFor({ model, reasoning_effort: 'low' });
    assert.equal(body.reasoning_effort, undefined, model);
  }
  assert.equal(mapEffortLevel(resolveModelCapability('custom-model'), 'high'), undefined);
  assert.equal(mapEffortLevel(resolveModelCapability('deepseek-chat'), 'medium'), 'high');
});

/* ── Client-facing summary ───────────────────────────────────────────── */

test('the capability summary tells a client what the model can do', () => {
  /* MiniMax-M3 reasons, can switch thinking off, and ignores effort levels. */
  assert.deepEqual(
    summarizeModelCapabilities('MiniMax-M3'),
    { isReasoning: true, supportsInstant: true, supportsEffort: false },
  );
  /* M3.1 Flash always thinks but tunes its depth. */
  assert.deepEqual(
    summarizeModelCapabilities('MiniMax-M3.1-Flash'),
    { isReasoning: true, supportsInstant: false, supportsEffort: true },
  );
  /* Kimi-K3 always thinks and has effort levels of its own. */
  assert.deepEqual(
    summarizeModelCapabilities('kimi-k3'),
    { isReasoning: true, supportsInstant: false, supportsEffort: true },
  );
  /* A model that never thinks needs no switch and has no effort levels. */
  assert.deepEqual(
    summarizeModelCapabilities('gpt-4o'),
    { isReasoning: false, supportsInstant: true, supportsEffort: false },
  );
  /* An undeclared model keeps Instant: refusing it would block a request
     the upstream may well accept. */
  assert.deepEqual(
    summarizeModelCapabilities('custom-model'),
    { isReasoning: true, supportsInstant: true, supportsEffort: false },
  );
});

/* ── Context budget ─────────────────────────────────────────────────── */

test('the conversation budget follows the model window instead of one global constant', () => {
  /* A 1M-token model was compressed at the global 100 000-token budget. */
  const minimax = resolveContextBudget('MiniMax-M3', { reserveTokens: 8192 });
  assert.equal(minimax.source, 'model-window');
  assert.equal(minimax.contextWindow, 1_000_000);
  /* The window is shared between input and output, so the basis is the input
     limit: 1 000 000 total − 524 288 max output. */
  assert.equal(minimax.budget, 1_000_000 - 524_288 - 8192 - 8192);
  assert.ok(minimax.budget > DEFAULT_CONTEXT_BUDGET_TOKENS);

  const gpt4o = resolveContextBudget('gpt-4o', { reserveTokens: 16384 });
  assert.equal(gpt4o.source, 'model-window');
  assert.equal(gpt4o.budget, 128_000 - 16_384 - 16384 - 8192);

  /* A vendor that states the input limit directly is taken at its word. */
  const astra = resolveContextBudget('gpt-6-astra', { reserveTokens: 8192 });
  assert.equal(astra.source, 'model-window');
  assert.equal(astra.budget, 922_000 - 8192 - 8192);

  /* A model whose vendor publishes no window keeps the previous budget. */
  const legacy = resolveContextBudget('deepseek-chat', { reserveTokens: 8192 });
  assert.equal(legacy.source, 'fallback');
  assert.equal(legacy.budget, DEFAULT_CONTEXT_BUDGET_TOKENS);

  const unknown = resolveContextBudget('custom-model', {});
  assert.equal(unknown.source, 'fallback');
  assert.equal(unknown.budget, DEFAULT_CONTEXT_BUDGET_TOKENS);

  /* An operator override always wins. */
  const overridden = resolveContextBudget('MiniMax-M3', { overrideTokens: 12_345, reserveTokens: 8192 });
  assert.equal(overridden.source, 'override');
  assert.equal(overridden.budget, 12_345);
});

test('a provider that rejects temperature while reasoning gets none', async () => {
  /* The GPT-6 family documents: "when reasoning effort is not `none`, remove
     temperature, top_p, and top_logprobs". */
  const reasoning = await bodyFor({ model: 'gpt-6-sol', reasoning_effort: 'high', temperature: 0.3 });
  assert.equal(reasoning.temperature, undefined);
  assert.equal(reasoning.reasoning_effort, 'high');

  const instant = await bodyFor({ model: 'gpt-6-sol', reasoning_effort: 'none', temperature: 0.3 });
  assert.equal(instant.temperature, 0.3);
});

/* ── Per-provider override (P_provider-capability-override) ─────────── */

test('the per-provider instant encoding overrides the registry', async () => {
  /* Qwen's registry entry is the one case where the same model is served
     by two documented, incompatible endpoints, so the registry falls back
     to the endpoint host. The operator's own statement about their
     endpoint must win over that host guess. */
  const capability = resolveModelCapability('qwen3-8b');
  assert.ok(capability.instantEncodingByHost, 'the registry keeps its host-scoped entry');

  /* A neutral host takes the registry default (self-hosted vLLM). */
  const guessed = await bodyFor({ model: 'qwen3-8b', reasoning_effort: 'none' });
  assert.equal(guessed.enable_thinking, undefined);
  assert.deepEqual(guessed.chat_template_kwargs, { enable_thinking: false });

  /* A Model Studio host takes the host-scoped encoding. */
  const studio = await bodyFor({
    model: 'qwen3-8b',
    reasoning_effort: 'none',
    apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  });
  assert.equal(studio.enable_thinking, false);
  assert.equal(studio.chat_template_kwargs, undefined);

  /* The operator's own statement wins over BOTH the default and the host
     guess: a relay in front of Model Studio mis-detects the host, and
     the column is how the operator states the truth. */
  const overridden = await bodyFor({
    model: 'qwen3-8b',
    reasoning_effort: 'none',
    instantEncoding: 'enable_thinking_false',
  });
  assert.equal(overridden.enable_thinking, false);
  assert.equal(overridden.chat_template_kwargs, undefined);

  /* An unknown override value is ignored rather than sent verbatim: the
     server only ever sends an encoding it knows how to spell. */
  const bogus = await bodyFor({ model: 'qwen3-8b', reasoning_effort: 'none', instantEncoding: 'not-an-encoding' });
  assert.equal(bogus.enable_thinking, undefined);
  assert.deepEqual(bogus.chat_template_kwargs, { enable_thinking: false });
});
