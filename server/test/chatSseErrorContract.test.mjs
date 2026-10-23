/**
 * P_sse-error-contract — the chat SSE stream must report a deterministic
 * prelude rejection with its real status/code, not as an opaque 500.
 *
 * The SSE route commits a 200 + text/event-stream BEFORE the prelude runs, so
 * a rejection that wrote `res.status(...).json(...)` used to land a JSON body
 * on an SSE stream and then degrade into "Request preparation failed" with a
 * 500. The browser classifies a 500 as retryable, so a request that can never
 * succeed (quota exhausted, non-multimodal model, undecryptable key) was
 * replayed as a whole turn — re-running RAG, memory and key resolution each
 * time.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { initDb, closeDb } from '../src/db/index.js';
import { users, authSessions, sessions, apiKeys } from '../src/db/schema/index.js';
import { registerStreamRoute } from '../src/routes/chat/stream.js';
import { encrypt, encryptionKey } from '../src/lib/crypto.js';
import { getLlmDispatcher } from '../src/services/core/llm.js';
import { shutdownPubsub } from '../src/lib/pubsub.js';
import { errorHandler } from '../src/middleware/error.js';
import { buildSseErrorFrame } from '../src/lib/sseErrorFrame.js';
import { LlmProviderError } from '../src/services/core/llm.js';
import { ApiError } from '../src/lib/errors.js';
import { listen } from './_http.js';

const enabled = Boolean(process.env.DATABASE_URL);
let db;
let userId;
let server;
const sid = crypto.randomBytes(32).toString('hex');

before(async () => {
  if (!enabled) return;
  db = initDb(process.env.DATABASE_URL);
  const [user] = await db.insert(users).values({ email: `sse-error-contract-${crypto.randomUUID()}@test.invalid`, passwordHash: 'test-only', verifiedAt: new Date() }).returning();
  userId = user.id;
  await db.insert(authSessions).values({ token: sid, userId, expiresAt: new Date(Date.now() + 600000) });
  // A plain text model: not marked multimodal, so an image attachment is a
  // deterministic rejection that happens AFTER the SSE prime.
  await db.insert(apiKeys).values({
    userId, label: 'text-only', url: 'https://provider.invalid/v1', model: 'text-only-model',
    keyCiphertext: encrypt('test-only', encryptionKey()), isActive: true,
  });
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const streamRouter = express.Router();
  registerStreamRoute(streamRouter);
  app.use('/api/chat', streamRouter);
  app.use(errorHandler);
  server = await listen(app);
});
after(async () => {
  if (!enabled) return;
  await server?.close();
  if (userId) await db.delete(users).where(eq(users.id, userId));
  await shutdownPubsub();
  await closeDb();
  await getLlmDispatcher().close();
});

test('a deterministic prelude rejection reaches the client with its real status and code', { skip: !enabled }, async () => {
  const [session] = await db.insert(sessions).values({ userId, topic: 'error contract', mode: 'chat', phase: 'chat', kind: 'chat' }).returning();
  const response = await fetch(`${server.url}/api/chat/stream?sessionId=${session.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `sid=${sid}` },
    body: JSON.stringify({
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } }] }],
      clientTurn: { id: `sse-error-contract-${crypto.randomUUID()}` },
    }),
  });
  const text = await response.text();

  // The failure must be reported as a structured SSE error frame...
  assert.match(text, /event: error/);
  // ...with the real status and machine-readable code...
  assert.match(text, /"code":"MODEL_NOT_MULTIMODAL"/);
  assert.match(text, /"status":400/);
  // ...and an explicit "do not replay this" signal.
  assert.match(text, /"retryable":false/);
  // It must NOT be degraded into an opaque internal error.
  assert.doesNotMatch(text, /Request preparation failed/);
  assert.doesNotMatch(text, /"code":"INTERNAL"/);
  // The JSON body must not have been written raw onto the SSE stream.
  assert.doesNotMatch(text, /^\{"code":"MODEL_NOT_MULTIMODAL"/m);
});

test('the error frame never forwards a raw upstream provider body', () => {
  const upstream = new LlmProviderError(429, '{"base_resp":{"status_code":1002,"status_msg":"rate limit exceeded","quota_exceeded_error":"rpm exhausted"}}');
  const frame = buildSseErrorFrame(upstream);
  assert.equal(frame.status, 429);
  assert.equal(frame.code, 'LLM_UPSTREAM_ERROR');
  assert.equal(frame.retryable, false);
  // The provider's response text must not reach the client.
  assert.doesNotMatch(frame.message, /rate limit exceeded|rpm exhausted|base_resp/);
});

test('the error frame keeps a curated server message and honours an explicit retry decision', () => {
  const terminal = buildSseErrorFrame(new ApiError(429, 'MONTHLY_LIMIT', 'Monthly limit reached.', undefined, false));
  assert.equal(terminal.status, 429);
  assert.equal(terminal.code, 'MONTHLY_LIMIT');
  assert.equal(terminal.retryable, false);
  assert.equal(terminal.message, 'Monthly limit reached.');

  // A curated error without an explicit decision keeps the client's
  // status-based default, so a genuinely transient 503 stays retryable.
  const transient = buildSseErrorFrame(new ApiError(503, 'NO_PROVIDER', 'No active LLM provider configured'));
  assert.equal(transient.retryable, undefined);
  assert.equal(transient.status, 503);
});
