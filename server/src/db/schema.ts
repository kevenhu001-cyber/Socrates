import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, text, timestamp, boolean, integer, jsonb, varchar, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

/* ──────────────────────────────────────────────
   Auth sessions (sid cookie → user mapping)
   ────────────────────────────────────────────── */
export const authSessions = pgTable('auth_sessions', {
  token: text('token').primaryKey(),       // 64-char hex (sid cookie value)
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('auth_sessions_user_id_idx').on(table.userId),
  index('auth_sessions_expires_at_idx').on(table.expiresAt),
]);

/* ──────────────────────────────────────────────
   Pending registrations (account not created until email verified)
   ────────────────────────────────────────────── */
export const pendingRegistrations = pgTable('pending_registrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('pending_registrations_token_idx').on(table.token),
  index('pending_registrations_email_idx').on(table.email),
]);

/* ──────────────────────────────────────────────
   Verification tokens (email verify, password reset)
   ────────────────────────────────────────────── */
export const verificationTokens = pgTable('verification_tokens', {
  token: text('token').primaryKey(),        // 16-char hex
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),             // email_verify | password_reset
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('verification_tokens_user_id_idx').on(table.userId),
  index('verification_tokens_kind_idx').on(table.kind),
]);

/* ──────────────────────────────────────────────
   Users
   ────────────────────────────────────────────── */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  passwordHash: text('password_hash').notNull(),
  tier: text('tier').notNull().default('diophantus'),  // diophantus | riemann | descartes | euclid
  plan: text('plan'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  isGuest: boolean('is_guest').notNull().default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  customInstructions: text('custom_instructions'),
  defaultModel: text('default_model'),
  preferences: jsonb('preferences').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('users_email_idx').on(table.email)]);

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
  /* The library hot path filters an owner's active sessions and orders by
   * recency. The old independent indexes forced PostgreSQL to filter then
   * sort as a user's history grew. This partial index matches that query
   * without bloating archived-session writes. */
  index('sessions_active_user_updated_idx').on(table.userId, table.updatedAt.desc()).where(sql`${table.archivedAt} IS NULL`),
  index('sessions_archived_at_idx').on(table.archivedAt),
  index('sessions_updated_at_idx').on(table.updatedAt),
  index('sessions_project_id_idx').on(table.projectId),
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
  /* P_attachments — array of {id, kind, name, mime, dataUrl?, text?, size, truncated?}
     representing images (dataUrl inlined), text files (text body), and PDFs
     (server-extracted text). Persisted so a session reload restores the
     thumbnails and parsed text without re-uploading. */
  attachments: jsonb('attachments').default([]),
  /* P_tool-history — array of {id, name, input, output, isError, artifacts}
     representing tool calls the assistant made on this turn (web_search,
     code_interpreter, etc). Persisted so a session reload re-renders the
     tool cards under the message instead of silently dropping them after
     the live stream ends. Default to [] so existing rows read back as
     "no tool calls" without a migration rewrite. */
  toolCalls: jsonb('tool_calls').default([]),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('messages_session_id_idx').on(table.sessionId),
  index('messages_parent_id_idx').on(table.parentId),
  index('messages_created_at_idx').on(table.createdAt),
  /* P_message-dedup — unique constraint on (sessionId, clientId) so
     concurrent POST /api/sessions cannot create duplicate rows for the
     same logical message. clientId can be NULL (messages without a
     front-end generated id), and Postgres treats NULLs as distinct
     in unique indexes, so multiple NULL-clientId messages coexist. */
  uniqueIndex('messages_session_client_id_idx').on(table.sessionId, table.clientId),
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
   Projects
   ────────────────────────────────────────────── */
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color'),
  icon: text('icon'),
  systemPrompt: text('system_prompt'),
  workspaceId: uuid('workspace_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('projects_user_id_idx').on(table.userId),
]);

/* ──────────────────────────────────────────────
   API Keys / Providers
   ────────────────────────────────────────────── */
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  url: text('url').notNull(),
  model: text('model').notNull(),
  keyCiphertext: text('key_ciphertext'),    // AES-256-GCM encrypted
  keyHint: text('key_hint'),                // First 8 chars for UI display
  isActive: boolean('is_active').notNull().default(false),
  isBuiltIn: boolean('is_built_in').notNull().default(false),
  /* P_attachments-multimodal — user-controlled flag marking this
   * provider as vision-capable. Replaces the previous regex-based
   * detection in lib/multimodal.js. Built-in Beagle rows are seeded
   * with true; custom providers default to false and the user opts
   * in via the API key editor. */
  isMultimodal: boolean('is_multimodal').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('api_keys_user_id_idx').on(table.userId),
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
   Files / Attachments
   ────────────────────────────────────────────── */
export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  kind: text('kind').notNull(),             // image | video | audio | pdf | text | code | csv | chart | other
  width: integer('width'),
  height: integer('height'),
  pages: integer('pages'),
  sha256: text('sha256').notNull(),
  storagePath: text('storage_path').notNull(),
  thumbnailPath: text('thumbnail_path'),
  sessionId: uuid('session_id'),
  /* P_code_interpreter — null for user uploads; set for files produced by the
     code-interpreter tool (PNG charts, CSV exports, etc). ON DELETE CASCADE
     so reaping an execution row drops its artifacts too. */
  executionId: uuid('execution_id').references(() => executions.id, { onDelete: 'cascade' }),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('files_user_id_idx').on(table.userId),
  index('files_sha256_idx').on(table.sha256),
  index('files_session_id_idx').on(table.sessionId),
  index('files_execution_id_idx').on(table.executionId),
]);

/* ──────────────────────────────────────────────
   Memories
   ────────────────────────────────────────────── */
export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  scope: text('scope').notNull().default('global'),  // global | project
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  source: text('source').notNull().default('user'),   // user | extracted
  enabled: boolean('enabled').notNull().default(true),
  confidence: integer('confidence'),                   // 0-100
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('memories_user_id_idx').on(table.userId),
  index('memories_project_id_idx').on(table.projectId),
]);

/* ──────────────────────────────────────────────
   Artifacts
   ────────────────────────────────────────────── */
export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),             // html | react | svg | mermaid | code | markdown
  title: text('title').notNull().default(''),
  source: text('source').notNull(),
  language: text('language'),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  visibility: text('visibility').notNull().default('private'),
  shareToken: text('share_token'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('artifacts_user_id_idx').on(table.userId),
  index('artifacts_session_id_idx').on(table.sessionId),
  index('artifacts_message_id_idx').on(table.messageId),
  index('artifacts_project_id_idx').on(table.projectId),
]);

export const artifactVersions = pgTable('artifact_versions', {
  artifactId: uuid('artifact_id').notNull().references(() => artifacts.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  source: text('source').notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('artifact_versions_pk').on(table.artifactId, table.version),
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
  isBuiltin: boolean('is_builtin').notNull().default(false),
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('prompts_user_id_idx').on(table.userId),
]);

/* ──────────────────────────────────────────────
   Import Jobs
   ────────────────────────────────────────────── */
export const importJobs = pgTable('import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  source: text('source').notNull(),          // chatgpt | claude | socrates | jsonl
  status: text('status').notNull().default('queued'),
  progress: jsonb('progress').default({}),   // {total, processed, errors}
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('import_jobs_user_id_idx').on(table.userId),
]);

/* ──────────────────────────────────────────────
   Workspaces
   ────────────────────────────────────────────── */
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  plan: text('plan').notNull().default('team'),  // team | business
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable('workspace_members', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),  // owner | admin | member | viewer
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('workspace_members_pk').on(table.workspaceId, table.userId),
]);

/* ──────────────────────────────────────────────
   Notifications
   ────────────────────────────────────────────── */
export const notificationTokens = pgTable('notification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),  // web | android | ios
  token: text('token').notNull(),
  deviceId: text('device_id'),
  channels: jsonb('channels').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('notification_tokens_user_id_idx').on(table.userId),
]);

/* ──────────────────────────────────────────────
   Agent Runs
   ────────────────────────────────────────────── */
export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  task: text('task').notNull(),
  status: text('status').notNull().default('planning'),
  plan: jsonb('plan').default([]),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('agent_runs_user_id_idx').on(table.userId),
  index('agent_runs_session_id_idx').on(table.sessionId),
]);

/* ──────────────────────────────────────────────
   Executions — Code Interpreter sandbox runs
   One row per code_interpreter tool call. Captures the source code, the
   status, stdout/stderr, exit code, runtime duration, and how many
   artifact files (charts, CSVs, etc) were emitted. Artifact files are
   stored in the `files` table with executionId set so they cascade-
   delete with this row and so the existing /api/files serving path
   picks them up unchanged.
   ────────────────────────────────────────────── */
export const executions = pgTable('executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  language: text('language').notNull().default('python'),
  code: text('code').notNull(),
  /* running | completed | failed | timeout | cancelled | skipped */
  status: text('status').notNull().default('running'),
  exitCode: integer('exit_code'),
  durationMs: integer('duration_ms'),
  stdout: text('stdout'),
  stderr: text('stderr'),
  artifactCount: integer('artifact_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('executions_user_id_idx').on(table.userId),
  index('executions_session_id_idx').on(table.sessionId),
  index('executions_started_at_idx').on(table.startedAt),
]);

/* ──────────────────────────────────────────────
   Classroom
   ────────────────────────────────────────────── */
export const classroomClasses = pgTable('classroom_classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  teacherId: uuid('teacher_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  subject: text('subject'),
  gradeLevel: text('grade_level'),
  joinCode: text('join_code').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const classStudents = pgTable('class_students', {
  classId: uuid('class_id').notNull().references(() => classroomClasses.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('class_students_pk').on(table.classId, table.userId),
]);

/* ──────────────────────────────────────────────
   Token Usage Events
   One row per chat completion. Aggregated by the heatmap endpoint
   into hourly buckets (date_trunc('hour', createdAt)). Each row
   records the user, the source model, and the estimated token
   counts. We use estimation (chars / 4) for portability across
   providers that don't return `usage` in their streaming SSE
   frames; the heatmap cares about magnitude, not precision. */
export const usageEvents = pgTable('usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  model: text('model'),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  source: text('source').notNull().default('chat'),   /* chat | agent | title */
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('usage_events_user_id_idx').on(table.userId),
  index('usage_events_user_created_idx').on(table.userId, table.createdAt),
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

/* ──────────────────────────────────────────────
   Audit Events — user action log
   Tracks who did what and when. Insert-only;
   records are never updated or deleted.
   ────────────────────────────────────────────── */
export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),         // register | login | logout | chat | create_api_key | delete_api_key | etc.
  detail: jsonb('detail').default({}),       // request-specific metadata
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('audit_events_user_id_idx').on(table.userId),
  index('audit_events_created_at_idx').on(table.createdAt),
  index('audit_events_action_idx').on(table.action),
]);

/* ──────────────────────────────────────────────
   Login Failures — per-email brute-force tracking
   Persists failure counts and lockout timestamps so
   the lockout is process-global (safe under
   multi-worker / cluster deployments).
   One row per email; UPSERTed on each failure.
   ────────────────────────────────────────────── */
export const loginFailures = pgTable('login_failures', {
  email: text('email').primaryKey(),        // lowercased email
  count: integer('count').notNull().default(0),
  firstAt: timestamp('first_at', { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
}, (table) => [
  index('login_failures_locked_until_idx').on(table.lockedUntil),
]);

/* ──────────────────────────────────────────────
   Plugins — user-installed extensions / tools
   Builtin plugins are seeded with isBuiltin=true for the global
   marketplace catalog. User-installed plugins have isBuiltin=false
   and are scoped to the user. The config column stores arbitrary
   JSON for the plugin's settings.
   ────────────────────────────────────────────── */
export const plugins = pgTable('plugins', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  type: text('type').notNull().default('extension'),  // extension | tool | agent | integration
  config: jsonb('config').default({}),
  isBuiltin: boolean('is_builtin').notNull().default(false),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('plugins_user_id_idx').on(table.userId),
  index('plugins_builtin_idx').on(table.isBuiltin),
]);

/* ──────────────────────────────────────────────
   Scheduled Tasks — recurring tasks / reminders
   One row per scheduled task. The task runs at the next scheduled
   time (nextRunAt) and is rescheduled according to cronExpression.
   The scheduler daemon (src/services/scheduler.js) polls for
   overdue tasks, runs them, and updates nextRunAt.
   ────────────────────────────────────────────── */
export const scheduledTasks = pgTable('scheduled_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  prompt: text('prompt').notNull().default(''),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  cronExpression: text('cron_expression'),
  /* once | hourly | daily | weekly | monthly | custom */
  frequency: text('frequency').notNull().default('once'),
  /* pending | active | paused | completed | failed */
  status: text('status').notNull().default('pending'),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  runCount: integer('run_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('scheduled_tasks_user_id_idx').on(table.userId),
  index('scheduled_tasks_next_run_at_idx').on(table.nextRunAt),
  index('scheduled_tasks_status_idx').on(table.status),
]);

/* ──────────────────────────────────────────────
   Status monitor events — self-hosted uptime tracking.
   One row per component state transition, recorded by the
   background monitor (src/services/statusMonitor.js). History is
   derived from these rows: a component is "down"/"degraded" for the
   interval between a transition INTO that state and the next
   transition OUT. Uptime over a window = 1 − (down+degraded time)/window.
   ────────────────────────────────────────────── */
export const statusMonitorEvents = pgTable('status_monitor_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  component: text('component').notNull(),    // e.g. "Database", "API Gateway"
  fromState: text('from_state'),             // previous state (null on first record)
  toState: text('to_state').notNull(),       // ok | warn | down
  detail: jsonb('detail').default({}),       // probe metadata / error message
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('status_monitor_events_component_idx').on(table.component),
  index('status_monitor_events_created_at_idx').on(table.createdAt),
  index('status_monitor_events_component_created_at_idx').on(table.component, table.createdAt),
]);

/* ──────────────────────────────────────────────
   Status Subscribers — email addresses subscribed to
   status.topodrive.top notifications. One row per email.
   confirmedAt is set when the subscriber clicks the
   confirmation link in the verification email.
   ────────────────────────────────────────────── */
export const statusSubscribers = pgTable('status_subscribers', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  token: text('token').notNull().unique(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('status_subscribers_email_idx').on(table.email),
  index('status_subscribers_token_idx').on(table.token),
]);

/* OAuth connector credentials. Ciphertext fields are never returned by APIs. */
export const connectorConnections = pgTable('connector_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  externalAccountId: text('external_account_id'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  accessTokenCiphertext: text('access_token_ciphertext').notNull(),
  refreshTokenCiphertext: text('refresh_token_ciphertext'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scopes: text('scopes'),
  installationIds: jsonb('installation_ids').notNull().default([]),
  status: text('status').notNull().default('connected'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('connector_connections_user_provider_idx').on(table.userId, table.provider),
  index('connector_connections_user_id_idx').on(table.userId),
  index('connector_connections_provider_idx').on(table.provider),
]);

/* ──────────────────────────────────────────────
   Agent API keys (Phase D) — long-lived scoped credentials for headless agents.
   The plaintext secret is shown exactly once at creation; only the SHA-256 of
   "<keyId>.<secret>" is persisted. keyId is public (it prefixes the bearer).
   ────────────────────────────────────────────── */
export const agentApiKeys = pgTable('agent_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /* SHA-256 of "<keyId>.<secret>" — never store the plaintext secret. */
  secretHash: text('secret_hash').notNull(),
  keyId: text('key_id').notNull().unique(),               // "ak_<base32>" — public identifier
  label: text('label').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull(),    // ["chat:read", ...]
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [
  index('agent_api_keys_owner_idx').on(table.ownerUserId),
]);

/* ──────────────────────────────────────────────
   OAuth 2.0 authorization server (Phase D)
   First-party client registry for the authorization-code + PKCE flow.
   ────────────────────────────────────────────── */
export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  clientSecretHash: text('client_secret_hash').notNull(),
  name: text('name').notNull(),
  homepageUrl: text('homepage_url'),
  logoUrl: text('logo_url'),
  redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
  allowedScopes: jsonb('allowed_scopes').$type<string[]>().notNull(),
  requirePkce: boolean('require_pkce').notNull().default(true),
  requireConsent: boolean('require_consent').notNull().default(true),
  /* Null for dynamically registered clients (RFC 7591) — they have no
   * account-holder owner until an operator adopts them. */
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const oauthAuthorizationCodes = pgTable('oauth_authorization_codes', {
  codeHash: text('code_hash').primaryKey(),
  clientId: text('client_id').notNull().references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  codeChallenge: text('code_challenge'),
  codeChallengeMethod: text('code_challenge_method').default('S256'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('oauth_authorization_codes_user_idx').on(table.userId),
]);

export const oauthAccessTokens = pgTable('oauth_access_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  clientId: text('client_id').notNull().references(() => oauthClients.clientId, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  refreshTokenHash: text('refresh_token_hash'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('oauth_access_tokens_user_idx').on(table.userId),
  index('oauth_access_tokens_refresh_idx').on(table.refreshTokenHash),
]);

/* Metadata for OOMOL ProjectConnector accounts. OAuth tokens deliberately do
 * not appear here: they are held, refreshed, and isolated by OOMOL's gateway.
 * This table lets Socrates render a user's connection state and resume a
 * pending OAuth request after a browser navigation or server restart. */
export const projectConnectorConnections = pgTable('project_connector_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  connectionName: text('connection_name').notNull().default('socrates'),
  requestId: text('request_id'),
  connectedAccountId: text('connected_account_id'),
  displayName: text('display_name'),
  status: text('status').notNull().default('disconnected'),
  scopes: jsonb('scopes').notNull().default([]),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('project_connector_connections_user_provider_idx').on(table.userId, table.provider),
  index('project_connector_connections_user_id_idx').on(table.userId),
  index('project_connector_connections_request_id_idx').on(table.requestId),
]);
