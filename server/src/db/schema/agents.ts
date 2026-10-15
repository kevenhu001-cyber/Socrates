import {
  pgTable, uuid, text, timestamp, boolean, integer, jsonb, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import { users } from './auth.js';
import { sessions } from './chat.js';
import { projects } from './content.js';

/* ──────────────────────────────────────────────
   Codex workspaces

   The filesystem path is deliberately not exposed to clients. `workspaceKey`
   is a server-owned stable identifier that lets the runtime derive the path
   below CODEX_WORKSPACE_ROOT. New runs use `session:<uuid>` keys so every
   conversation gets an isolated working tree; project/user keys remain for
   legacy and session-less scheduled runs.
   ────────────────────────────────────────────── */
export const codexWorkspaces = pgTable('codex_workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  workspaceKey: text('workspace_key').notNull(),
  status: text('status').notNull().default('active'), // active | archived | expired
  policy: jsonb('policy').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('codex_workspaces_user_key_idx').on(table.userId, table.workspaceKey),
  index('codex_workspaces_user_id_idx').on(table.userId),
  index('codex_workspaces_project_id_idx').on(table.projectId),
]);

/* ──────────────────────────────────────────────
   Agent Runs
   ────────────────────────────────────────────── */
export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  threadId: text('thread_id'),
  workspaceId: uuid('workspace_id').references(() => codexWorkspaces.id, { onDelete: 'set null' }),
  task: text('task').notNull(),
  status: text('status').notNull().default('planning'),
  mode: text('mode').notNull().default('workspace'), // workspace | native
  kind: text('kind').notNull().default('chat'), // chat | tutor | scheduled | retry
  source: text('source').notNull().default('chat'), // chat | tutor | scheduled | api
  providerMode: text('provider_mode'), // user | server
  model: text('model'),
  summary: text('summary'),
  error: text('error'),
  usage: jsonb('usage').default({}),
  plan: jsonb('plan').default([]),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('agent_runs_user_id_idx').on(table.userId),
  index('agent_runs_session_id_idx').on(table.sessionId),
  index('agent_runs_project_id_idx').on(table.projectId),
  index('agent_runs_thread_id_idx').on(table.threadId),
  index('agent_runs_status_idx').on(table.status),
]);

export const codexThreads = pgTable('codex_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  workspaceId: uuid('workspace_id').notNull().references(() => codexWorkspaces.id, { onDelete: 'cascade' }),
  threadId: text('thread_id').notNull().unique(),
  status: text('status').notNull().default('active'), // active | paused | completed | disconnected
  model: text('model'),
  providerMode: text('provider_mode'),
  lastTurnId: text('last_turn_id'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('codex_threads_user_id_idx').on(table.userId),
  index('codex_threads_project_id_idx').on(table.projectId),
  index('codex_threads_session_id_idx').on(table.sessionId),
  index('codex_threads_workspace_id_idx').on(table.workspaceId),
]);

export const agentRunEvents = pgTable('agent_run_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  event: text('event').notNull(),
  payload: jsonb('payload').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('agent_run_events_run_sequence_idx').on(table.runId, table.sequence),
  index('agent_run_events_run_id_idx').on(table.runId),
]);

export const agentApprovals = pgTable('agent_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  threadId: text('thread_id').notNull(),
  requestId: text('request_id').notNull(),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('pending'), // pending | accepted | accepted_for_session | declined | cancelled
  decision: text('decision'),
  payload: jsonb('payload').default({}),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('agent_approvals_run_request_idx').on(table.runId, table.requestId),
  index('agent_approvals_user_status_idx').on(table.userId, table.status),
  index('agent_approvals_thread_id_idx').on(table.threadId),
]);

export const agentJobs = pgTable('agent_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('run'), // run | resume | retry
  status: text('status').notNull().default('queued'), // queued | leased | running | awaiting_approval | completed | failed
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_jobs_status_available_idx').on(table.status, table.availableAt),
  index('agent_jobs_user_id_idx').on(table.userId),
  index('agent_jobs_run_id_idx').on(table.runId),
]);

/* ──────────────────────────────────────────────
   Codex MCP settings — server-owned MCP catalog selections.
   The URL and transport come from the server catalog; users can only
   enable/disable a known server globally or for one of their projects.
   `scopeKey` avoids PostgreSQL's nullable-column unique-index semantics for
   the global (projectId = null) scope.
   ────────────────────────────────────────────── */
export const agentMcpSettings = pgTable('agent_mcp_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  scopeKey: text('scope_key').notNull(), // global | project:<uuid>
  serverKey: text('server_key').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  healthStatus: text('health_status').notNull().default('unknown'), // unknown | reachable | unavailable
  lastError: text('last_error'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('agent_mcp_settings_scope_server_idx').on(table.userId, table.scopeKey, table.serverKey),
  index('agent_mcp_settings_user_id_idx').on(table.userId),
  index('agent_mcp_settings_project_id_idx').on(table.projectId),
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
  /* running | completed | failed | timeout | cancelled | skipped | rejected
     ('rejected' = refused before execution, e.g. syntax error — excluded
     from the daily execution quota) */
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
