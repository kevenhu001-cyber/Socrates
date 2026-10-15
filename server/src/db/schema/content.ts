import {
  pgTable, uuid, text, timestamp, boolean, integer, jsonb, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import { users } from './auth.js';
import { sessions, messages } from './chat.js';
import { executions, agentRuns } from './agents.js';

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
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  /* P_code_interpreter — null for user uploads; set for files produced by the
     code-interpreter tool (PNG charts, CSV exports, etc). ON DELETE CASCADE
     so reaping an execution row drops its artifacts too. */
  executionId: uuid('execution_id').references(() => executions.id, { onDelete: 'cascade' }),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('files_user_id_idx').on(table.userId),
  index('files_sha256_idx').on(table.sha256),
  index('files_session_id_idx').on(table.sessionId),
  index('files_execution_id_idx').on(table.executionId),
  index('files_agent_run_id_idx').on(table.agentRunId),
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
  /* P_codex-runtime — generated files and reports stay attached to the
   * execution that produced them so a project/session can surface them
   * without scraping assistant prose. */
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
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
  index('artifacts_agent_run_id_idx').on(table.agentRunId),
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
   frames; the heatmap cares about magnitude, not precision.
   ────────────────────────────────────────────── */
export const usageEvents = pgTable('usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  model: text('model'),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  source: text('source').notNull().default('chat'),   /* chat | agent | title */
  /* Provenance of the token counts: 'provider' when the upstream reported a
     `usage` object (non-streaming response, or the final
     stream_options.include_usage frame), 'estimate' when they came from the
     chars/4 approximation in services/usageTracker.ts.

     Defaults to 'estimate' so the ~history that predates this column is
     labelled truthfully rather than being silently promoted to "measured".
     Any aggregate that presents cost must separate the two — mixing a
     measured total with a guessed one produces a number that is wrong in an
     unknowable direction. */
  usageSource: text('usage_source').notNull().default('estimate'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('usage_events_user_id_idx').on(table.userId),
  index('usage_events_user_created_idx').on(table.userId, table.createdAt),
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
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  agentKind: text('agent_kind').notNull().default('native'), // native | codex
  runPolicy: jsonb('run_policy').default({}),
  notificationConfig: jsonb('notification_config').default({}),
  lastRunId: uuid('last_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
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
  index('scheduled_tasks_project_id_idx').on(table.projectId),
  index('scheduled_tasks_last_run_id_idx').on(table.lastRunId),
]);

/* ──────────────────────────────────────────────
   Embedding configuration (admin-managed)
   ────────────────────────────────────────────── */
export const embeddingConfig = pgTable('embedding_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  /* The admin-managed embedding provider. Singleton-ish: the lookup
     helper takes the most recently-updated row so an operator can
     swap the config by re-inserting. */
  label: text('label').notNull(),
  url: text('url').notNull(),                 // OpenAI-compatible base, e.g. https://api.openai.com/v1
  model: text('model').notNull(),             // e.g. text-embedding-3-small
  keyCiphertext: text('key_ciphertext'),      // AES-256-GCM encrypted, same as api_keys
  keyHint: text('key_hint'),
  dimensions: integer('dimensions').notNull().default(1536),
  isActive: boolean('is_active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('embedding_config_active_idx').on(table.isActive),
]);
