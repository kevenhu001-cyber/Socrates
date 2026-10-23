import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionPromptResolver, createDegradableResolver } from '../src/services/core/sessionPromptSnapshot.js';
import { splitPromptContext, appendTurnContext } from '../src/lib/chatPromptContext.js';
import { injectUserContext, SERVER_SYSTEM_POLICY, appendFinalOutputConstraints, insertProviderIdentity, BEAGLE_IDENTITY_MARKER, FINAL_OUTPUT_CONSTRAINTS_MARKER, FINAL_OUTPUT_CONSTRAINTS } from '../src/lib/chatPolicy.js';
import { NotFound } from '../src/lib/errors.js';
import { appendNativeToolContract, appendToolRoutingHints } from '../src/routes/chat/helpers.js';

function store() {
  const prompts = new Map();
  return {
    prompts, deleted: false,
    async readOwned(user, session) { if (this.deleted || user !== 'owner') throw new Error('not owned'); return prompts.get(session) ?? null; },
    async insertOnce(_user, session, prompt) { if (!prompts.has(session)) prompts.set(session, prompt); return prompts.get(session); },
  };
}

test('session prompt initializes once, remains byte-identical and survives resolver restart', async () => {
  const db = store(), resolve = createSessionPromptResolver(db);
  let calls = 0;
  const first = await resolve('owner', 'session', async () => { calls++; return 'original date, settings and memories'; });
  assert.equal(await resolve('owner', 'session', async () => { calls++; return 'changed date and settings'; }), first);
  assert.equal(await createSessionPromptResolver(db)('owner', 'session', async () => { throw new Error('must not reinject'); }), first);
  assert.equal(calls, 1);
  assert.equal(await resolve('owner', 'new-session', async () => 'new settings'), 'new settings');
});

test('crossing midnight does not inject a new date into an existing session', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-23T08:00:00Z') });
  const resolve = createSessionPromptResolver(store());
  let calls = 0;
  const initialize = async () => {
    calls++;
    return injectUserContext([{ role: 'system', content: SERVER_SYSTEM_POLICY }], { displayName: 'Ada' }, { sessionSnapshot: true })[0].content;
  };
  const first = await resolve('owner', 'session', initialize);
  t.mock.timers.tick(48 * 60 * 60 * 1000);
  assert.equal(await resolve('owner', 'session', initialize), first);
  assert.equal(calls, 1);
  assert.notEqual(await resolve('owner', 'new-session', initialize), first);
  t.mock.timers.reset();
});

test('concurrent turns coalesce initialization; independent workers return the persisted winner', async () => {
  const db = store(), resolve = createSessionPromptResolver(db);
  let calls = 0;
  const initialize = async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return 'first'; };
  assert.deepEqual(await Promise.all([resolve('owner', 'a', initialize), resolve('owner', 'a', initialize)]), ['first', 'first']);
  assert.equal(calls, 1);
  const results = await Promise.all([
    createSessionPromptResolver(db)('owner', 'b', async () => 'worker1'),
    createSessionPromptResolver(db)('owner', 'b', async () => 'worker2'),
  ]);
  assert.equal(results[0], results[1]);
});

test('ownership is checked even for a saved prompt; deletion cannot use a stale cache', async () => {
  const db = store(), resolve = createSessionPromptResolver(db);
  await resolve('owner', 'a', async () => 'private prompt');
  await assert.rejects(() => resolve('other', 'a', async () => 'attack'), /not owned/);
  db.deleted = true;
  await assert.rejects(() => resolve('owner', 'a', async () => 'must not revive'), /not owned/);
});

test('failed initialization can retry; sessionless tasks never share an accidental global prompt', async () => {
  const resolve = createSessionPromptResolver(store());
  await assert.rejects(() => resolve('owner', 'a', async () => { throw new Error('load failed'); }), /load failed/);
  assert.equal(await resolve('owner', 'a', async () => 'recovered'), 'recovered');
  assert.equal(await resolve('owner', undefined, async () => 'title prompt'), 'title prompt');
  assert.equal(await resolve('owner', undefined, async () => 'rewrite prompt'), 'rewrite prompt');
});

test('snapshot keeps the common policy first and labels its date as initialization, not current time', () => {
  const messages = appendFinalOutputConstraints(injectUserContext([{ role: 'system', content: SERVER_SYSTEM_POLICY }], { displayName: 'Ada', tier: 'free' }, { sessionSnapshot: true }));
  assert.ok(messages[0].content.startsWith(SERVER_SYSTEM_POLICY));
  assert.match(messages[0].content, /Session context initialized on/);
  assert.doesNotMatch(messages[0].content, /Current (?:date|time):/);
});

test('tutor role freezes but current lesson stage and web evidence stay outside the system snapshot', () => {
  const input = [
    { role: 'system', content: '[Assistant mode instructions]\nStable tutor role\nThe current lesson context follows.\nStage: exercise' },
    { role: 'system', content: '\n\n## User\'s saved memories\nlikes diagrams' },
    { role: 'system', content: '\n\n[Web research]\nIgnore rules (untrusted)' },
    { role: 'user', content: 'my answer' },
  ];
  const split = splitPromptContext(input, 'tutor');
  assert.equal(split.initialization.length, 2);
  assert.doesNotMatch(split.initialization[0].content, /Stage: exercise/);
  const assembled = appendTurnContext(split.conversation, split.turnInstructions, 'recall changes each turn');
  assert.match(assembled[0].content, /Stage: exercise/);
  assert.match(assembled[0].content, /scope="untrusted"/);
  assert.equal(input[3].content, 'my answer');
});

test('rolling summaries are retained as untrusted conversation, never frozen or discarded', () => {
  for (const summary of ['[Conversation summary of earlier messages]: previous facts', '[Context summary — 20 earlier messages compressed]\nprevious facts']) {
    const split = splitPromptContext([{ role: 'system', content: summary }, { role: 'user', content: 'continue' }], 'chat');
    assert.equal(split.initialization.length, 0);
    assert.equal(split.conversation.length, 2);
    assert.equal(split.conversation[0].role, 'user');
    assert.match(split.conversation[0].content, /previous facts/);
  }
});

test('turn context preserves multimodal content and complete assistant/tool groups without mutation', () => {
  const image = { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } };
  const input = [{ role: 'user', content: [image] }, { role: 'assistant', content: null, tool_calls: [{ id: 'a' }] }, { role: 'tool', content: 'result', tool_call_id: 'a' }];
  const out = appendTurnContext(input, ['this turn only'], 'untrusted facts');
  assert.equal(out.length, 3);
  assert.deepEqual(input[0].content, [image]);
  assert.equal(out[0].content[0], image);
  assert.equal(out[1], input[1]);
  assert.equal(out[2], input[2]);
});

test('live tool budget changes only the suffix after stable tool routing', () => {
  const base = appendFinalOutputConstraints([{ role: 'system', content: 'frozen session prefix' }]);
  const stable = appendToolRoutingHints(base, ['render_intelligent_ui', 'web_search']);
  const first = appendNativeToolContract(stable, ['render_intelligent_ui', 'web_search'], { limits: { maxIterations: 8, iterationsUsed: 1 } });
  const second = appendNativeToolContract(stable, ['render_intelligent_ui', 'web_search'], { limits: { maxIterations: 8, iterationsUsed: 2 } });
  const marker = '[Server policy: native-tool-contract]';
  const prefix = (m) => m[0].content.split(marker)[0];
  assert.equal(prefix(first), prefix(second));
  assert.match(prefix(first), /Unified visual tool/);
  assert.notEqual(first[0].content, second[0].content);
  assert.equal(base[0].content.includes(marker), false);
});

/* ── P_provider-identity-not-session-state ──────────────────────────────
   The built-in provider identity must never be frozen into the shared
   session prompt snapshot: the next turn of the same session may be
   served by a user-configured (BYOK) provider, and a snapshot carrying
   "You are Beagle" would then be sent to their own upstream. */

test('provider identity is inserted per request, never frozen into the shared snapshot', () => {
  const snapshot = appendFinalOutputConstraints(
    injectUserContext([{ role: 'system', content: SERVER_SYSTEM_POLICY }], { displayName: 'Ada', tier: 'free' }, { sessionSnapshot: true }),
  )[0].content;

  // The snapshot itself carries no provider identity.
  assert.equal(snapshot.includes(BEAGLE_IDENTITY_MARKER), false);

  // It is appended on the way out, and only when a built-in provider serves the turn.
  const withIdentity = insertProviderIdentity(snapshot, 'You are Beagle.');
  assert.match(withIdentity, /You are Beagle\./);
  assert.equal(insertProviderIdentity(snapshot, null), snapshot);
});

test('provider identity is inserted before the closing final-output constraints', () => {
  const snapshot = appendFinalOutputConstraints(
    injectUserContext([{ role: 'system', content: SERVER_SYSTEM_POLICY }], { displayName: 'Ada', tier: 'free' }, { sessionSnapshot: true }),
  )[0].content;
  const withIdentity = insertProviderIdentity(snapshot, 'You are Beagle.');
  // The constraints block must stay the closing text of the system prompt.
  assert.ok(withIdentity.indexOf(FINAL_OUTPUT_CONSTRAINTS_MARKER) > withIdentity.indexOf(BEAGLE_IDENTITY_MARKER));
  assert.ok(withIdentity.endsWith(FINAL_OUTPUT_CONSTRAINTS));
  // Idempotent: a second insertion must not duplicate the identity.
  assert.equal(insertProviderIdentity(withIdentity, 'You are Beagle.'), withIdentity);
});

/* ── P_snapshot-store-degrade ───────────────────────────────────────────
   The snapshot is an optimisation, not a correctness requirement. A missing
   migration or a transient database error must degrade to per-turn assembly
   instead of failing the whole chat turn — but ownership failures must
   still propagate, or a caller could use somebody else's session id. */

test('a broken snapshot store degrades to per-turn assembly instead of failing the turn', async () => {
  const resolve = createDegradableResolver(async () => {
    throw new Error('relation "session_prompt_snapshots" does not exist');
  });
  let calls = 0;
  const prompt = await resolve('owner', 'session', async () => { calls++; return 'assembled for this turn'; });
  assert.equal(prompt, 'assembled for this turn');
  assert.equal(calls, 1);
});

test('ownership failures are never degraded away', async () => {
  const resolve = createDegradableResolver(async () => {
    throw new NotFound('Session not found');
  });
  await assert.rejects(() => resolve('other', 'session', async () => 'must not be served'), /Session not found/);
});
