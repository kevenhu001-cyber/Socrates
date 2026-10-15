import {
  pgTable, uuid, text, timestamp, boolean, integer, jsonb, uniqueIndex, index, vector,
} from 'drizzle-orm/pg-core';
import { users } from './auth.js';
import { projects } from './content.js';
import { agentRuns } from './agents.js';
import { bytea } from './common.js';

/* ──────────────────────────────────────────────
   Sessions
   ────────────────────────────────────────────── */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  topic: text('topic').notNull().default(''),
  mode: text('mode').notNull().default('chat'),    // tutor | chat
  phase: text('phase').notNull().default('topic'), // topic | diagnostic | chat
  /* P_exam-history — top-level session "shape". Default 'chat' so
   * every existing row stays the same; the chat service still uses
   * 'tutor' / 'chat'. Exam sessions carry their rendered questions,
   * answers, and language in exam_data (jsonb). The CHECK constraint
   * mirrors what the front-end passes so a typo like 'exmam' is
   * rejected at the DB boundary. */
  kind: text('kind').notNull().default('chat'),    // chat | tutor | exam
  examData: jsonb('exam_data'),
  domain: text('domain'),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  assistantId: uuid('assistant_id'),
  pinned: boolean('pinned').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  preview: text('preview'),
  totalQ: integer('total_q').notNull().default(0),
  currentNode: integer('current_node').notNull().default(0),
  kbNodes: jsonb('kb_nodes').default([]),
  mistakes: jsonb('mistakes').default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /* P_streaming-survival — when the client disconnects mid-stream
   * (browser close, network blip), the server saves the accumulated
   * partial text and reasoning content here. On reload the client
   * finds these non-null, renders the partial response, and offers
   * to resume/retry. finish() clears them back to null. */
  streamingText: text('streaming_text'),
  streamingReasoning: text('streaming_reasoning'),
  /* AUDIT-R1 — tutor teaching-state machine (Task 2.4). The client has
   * always sent these in the session payload and read them back in
   * loadSession, but they were never persisted (the Zod passthrough
   * silently dropped them), so teaching progress reset on every
   * reload. All nullable — the client defaults legacy rows to
   * motivate / 0 / 'foundation' / null. */
  teachingStage: text('teaching_stage'),          // motivate|define|develop|illustrate|exercise|check
  currentExampleIdx: integer('current_example_idx'),
  practiceAttempts: integer('practice_attempts'),
  practicePhase: text('practice_phase'),          // foundation|...
  teachingPlan: jsonb('teaching_plan'),
  boundariesHistory: jsonb('boundaries_history'),
  mistakeFilter: text('mistake_filter'),
  branchedFrom: jsonb('branched_from'),           // {sessionId, title, ...}
}, (table) => [
  index('sessions_user_id_idx').on(table.userId),
  /* The library hot path orders an owner's history by recency. This used to be
     partial (`WHERE archived_at IS NULL`), which the planner can only use when
     the query's WHERE implies that predicate — and the web client always sends
     `archived=true`, because one fetch feeds both the Recents list and the
     Storage modal's archived section. The partial form therefore never matched
     the request that actually runs. A full index serves both forms: the active
     list filters `archived_at IS NULL` on top of the ordered scan, and the
     archived-included list scans it outright. See migration
     0038_sessions_user_updated_all_idx. */
  index('sessions_user_updated_idx').on(table.userId, table.updatedAt.desc()),
  index('sessions_archived_at_idx').on(table.archivedAt),
  index('sessions_updated_at_idx').on(table.updatedAt),
  index('sessions_project_id_idx').on(table.projectId),
  index('sessions_assistant_id_idx').on(table.assistantId),
  index('sessions_kind_idx').on(table.kind),
]);

/* ──────────────────────────────────────────────
   Messages
   ────────────────────────────────────────────── */
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),     // user | assistant | system
  content: text('content').notNull(),
  rawText: text('raw_text'),
  html: text('html'),
  type: text('type'),              // streaming | paused | assistant | suggest
  sources: jsonb('sources').default([]),
  parentId: uuid('parent_id'),      // For branching / regeneration chains
  model: text('model'),
  tokenCount: integer('token_count'),
  clientId: text('client_id'),      // Front-end generated ID for DOM mapping
  /* P_reasoning-persist — chain-of-thought text from DeepSeek / QwQ /
     o1-style reasoning models. Stored alongside content so it survives
     session save/load and is included in the LLM context on the next
     chat turn. */
  reasoningContent: text('reasoning_content'),
  /* P_turn-summary — the model's own one-line retrospective of the work it
     did on this turn (what was found / run / concluded), which the Summary
     sheet and the status row render. Distinct from `rawText`: that is the
     ANSWER, this is a description OF the work. Generated off the response
     path by services/turnSummary.ts, so a failed generation leaves it null
     and the UI falls back to the answer's first sentence. */
  summary: text('summary'),
  /* P_attachments — array of {id, kind, name, mime, dataUrl?, text?, size, truncated?}
     representing images (dataUrl inlined), text files (text body), and PDFs
     (server-extracted text). Persisted so a session reload restores the
     thumbnails and parsed text without re-uploading. */
  attachments: jsonb('attachments').default([]),
  /* P_tool-history — array of {id, name, input, output, isError, artifacts}
     representing tool calls the assistant made on this turn (web_search, code_interpreter, etc). Persisted so a session reload re-renders the
     tool cards under the message instead of silently dropping them after
     the live stream ends. Default to [] so existing rows read back as
     "no tool calls" without a migration rewrite. */
  toolCalls: jsonb('tool_calls').default([]),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('messages_session_id_idx').on(table.sessionId),
  index('messages_parent_id_idx').on(table.parentId),
  index('messages_created_at_idx').on(table.createdAt),
  /* Audit P-M2 — transcript reads are all `WHERE session_id = ? ORDER BY
     created_at`: routes/messages.ts (history rebuild, edit truncation,
     regenerate), routes/publicShares.ts (/s/:token, LIMIT 200),
     routes/sessions.ts (GET /:id), routes/account.ts (export) and
     routes/suggestions.ts (DESC LIMIT).

     Measured on 3.08M messages / 2k sessions, target session 60k rows:
       ORDER BY created_at DESC LIMIT 20  →  2.7-9.1ms  becomes  0.05ms
       ORDER BY created_at LIMIT 200      →  ~0.1ms     unchanged
       full 60k-row transcript            →  ~34ms      unchanged
     So the win is concentrated in the bounded/DESC queries, where the
     planner can walk this index in order instead of scanning
     messages_created_at_idx and filtering. The unbounded transcript read
     stays a bitmap scan + sort either way (60k random index fetches would
     cost more than the sort), so this index is not a fix for that path —
     pagination would be.

     messages_created_at_idx is deliberately kept: routes/usage.ts
     aggregates by DATE(created_at) across all sessions and needs
     created_at leading. */
  index('messages_session_created_idx').on(table.sessionId, table.createdAt),
  /* P_message-dedup — unique constraint on (sessionId, clientId) so
     concurrent POST /api/sessions cannot create duplicate rows for the
     same logical message. clientId can be NULL (messages without a
     front-end generated id), and Postgres treats NULLs as distinct
     in unique indexes, so multiple NULL-clientId messages coexist. */
  uniqueIndex('messages_session_client_id_idx').on(table.sessionId, table.clientId),
  index('messages_agent_run_id_idx').on(table.agentRunId),
]);

/* ──────────────────────────────────────────────
   TTS results (M4 follow-up: per-message voice persistence)
   ────────────────────────────────────────────── */
export const ttsResults = pgTable('tts_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  voice: text('voice').notNull(),
  format: text('format').notNull(),         // 'mp3' | 'opus' | 'wav'
  lang: text('lang').notNull(),             // 2-letter; 'en' | 'zh' | …
  textHash: text('text_hash').notNull(),    // sha256 of trimmed text — change = stale
  audio: bytea('audio').notNull(),
  contentType: text('content_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  /* The same (message, voice, format, lang) is a single cell: the next
     read of the same message in the same shape must return the same
     bytes. A voice/lang/format change naturally produces a new row;
     the previous one stays correct. */
  uniqueIndex('tts_results_message_voice_format_lang_idx')
    .on(table.messageId, table.voice, table.format, table.lang),
  /* Drives stale-on-edit detection in PATCH /api/messages. */
  index('tts_results_message_id_idx').on(table.messageId),
]);

/* ──────────────────────────────────────────────
   Session chunks (M3 deferred; LobeHub-alignment M3)
   ────────────────────────────────────────────── */
export const sessionChunks = pgTable('session_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  /* session_id is denormalized off messages for one fast path: a
     session-scoped retrieval can scan the index on session_id alone
     and skip the join. Kept in sync via the chunkIndex service. */
  sessionId: uuid('session_id').notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  ordinal: integer('ordinal').notNull(),     // chunk index within the message
  text: text('text').notNull(),
  startOffset: integer('start_offset').notNull(),
  endOffset: integer('end_offset').notNull(),
  /* P_session-chunks-embedding — optional pgvector re-ranking column.
     Null when the chunk has not been embedded yet (provider not
     configured, upstream failure, or BM25-only mode). The HNSW index
     over cosine distance makes the re-ranking cheap; the null is
     safe — a chunk without an embedding is still a valid BM25 hit. */
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  /* A message's chunks are an ordered list; the (message, ordinal)
     pair is the natural key. A re-index of the same message
     upserts under this key, so chunking is idempotent. */
  uniqueIndex('session_chunks_message_ordinal_idx')
    .on(table.messageId, table.ordinal),
  /* Drives the session-scoped BM25 retrieval in chunkIndex.searchSessionChunks. */
  index('session_chunks_session_id_idx').on(table.sessionId),
]);

/* ──────────────────────────────────────────────
   Feedback
   ────────────────────────────────────────────── */
export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  rating: text('rating').notNull(),  // up | down | none
  reason: text('reason'),
  categories: jsonb('categories').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('feedback_message_id_idx').on(table.messageId),
]);

/* ──────────────────────────────────────────────
   Tags
   ────────────────────────────────────────────── */
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
}, (table) => [
  uniqueIndex('tags_user_name_idx').on(table.userId, table.name),
]);

export const sessionTags = pgTable('session_tags', {
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => [
  uniqueIndex('session_tags_pk').on(table.sessionId, table.tagId),
]);

/* ──────────────────────────────────────────────
   Shares
   ────────────────────────────────────────────── */
export const shares = pgTable('shares', {
  token: text('token').primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  visibility: text('visibility').notNull().default('unlisted'),  // public | unlisted | private
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('shares_session_id_idx').on(table.sessionId),
]);

/* ──────────────────────────────────────────────
   Prompt Templates
   ────────────────────────────────────────────── */
export const prompts = pgTable('prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  body: text('body').notNull(),
  icon: text('icon'),
  category: text('category').notNull().default('other'),
  shortcut: text('shortcut'),
  systemPrompt: text('system_prompt'),
  isBuiltin: boolean('is_builtin').notNull().default(false),
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('prompts_user_id_idx').on(table.userId),
]);

/* ──────────────────────────────────────────────
   Chat turns — detached async chat execution (M1).
   One row per user turn submitted to the chat surface. The LLM loop
   runs detached from the HTTP socket lifetime: POST creates the row
   (idempotent on clientTurnId), the worker appends sequenced events
   to chat_turn_events, and the client (re)subscribes with ?after=.
   Mirrors the agent_runs/agent_run_events pattern without sharing
   its Codex workspace semantics.
   status: queued | running | awaiting_approval | completed | failed | interrupted
   ────────────────────────────────────────────── */
export const chatTurns = pgTable('chat_turns', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  clientTurnId: text('client_turn_id').notNull(),
  status: text('status').notNull().default('queued'),
  model: text('model'),
  generation: integer('generation').notNull().default(1),
  inputSnapshot: jsonb('input_snapshot'),
  fullText: text('full_text'),
  fullReasoning: text('full_reasoning'),
  toolCalls: jsonb('tool_calls').default([]),
  usage: jsonb('usage').default({}),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('chat_turns_user_client_turn_idx').on(table.userId, table.clientTurnId),
  index('chat_turns_user_id_idx').on(table.userId),
  index('chat_turns_session_id_idx').on(table.sessionId),
  index('chat_turns_status_idx').on(table.status),
]);

export const chatTurnEvents = pgTable('chat_turn_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  turnId: uuid('turn_id').notNull().references(() => chatTurns.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  event: text('event').notNull(),
  payload: jsonb('payload').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('chat_turn_events_turn_sequence_idx').on(table.turnId, table.sequence),
  index('chat_turn_events_turn_id_idx').on(table.turnId),
]);

/* ──────────────────────────────────────────────
   Mistakes (错题本) — first-class entity
   ────────────────────────────────────────────── */
export const mistakes = pgTable('mistakes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  nodeName: text('node_name'),
  questionContent: text('question_content').notNull(),
  userAnswer: text('user_answer'),
  correctAnswer: text('correct_answer'),
  source: text('source').notNull().default('quiz'),  // quiz | practice | manual
  isResolved: boolean('is_resolved').notNull().default(false),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('mistakes_user_id_idx').on(table.userId),
  index('mistakes_user_resolved_idx').on(table.userId, table.isResolved),
]);
