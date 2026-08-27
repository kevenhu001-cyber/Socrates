/**
 * Unified Agent Runtime
 *
 * Native tools and Codex both surface through the same run/event/approval
 * contract. Native tools still execute in chat/stream.ts because they have
 * specialised streaming semantics; this module owns the durable, resumable
 * workspace-agent path and is also the shared API used by Chat, Tutor and
 * scheduled jobs.
 */

import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { asc, and, desc, eq, inArray, max } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import {
  agentApprovals,
  agentJobs,
  agentRunEvents,
  agentRuns,
  artifacts,
  codexThreads,
  codexWorkspaces,
  projects,
  scheduledTasks,
  sessions,
} from '../db/schema.js';
import { BadRequest, NotFound } from '../lib/errors.js';
import { codexHarness, CODEX_ENABLED } from './codexHarness.js';
import { mapCodexNotification } from './codexEvents.js';
import { CODEX_MCP_ENABLED, resolveCodexMcpConfig } from './codexMcp.js';
import { ensureProjectWorkspace, ensureWorkspaceInstructions, resolveCodexProvider } from './codexProvider.js';

export const UNIFIED_CODEX_ENABLED = CODEX_ENABLED && process.env.CODEX_UNIFIED_RUNTIME !== 'false';
export const CODEX_BACKGROUND_ENABLED = UNIFIED_CODEX_ENABLED && process.env.CODEX_BACKGROUND !== 'false';

const MAX_TASK_LENGTH = 20_000;
const MAX_EVENT_TEXT = 120_000;
const MAX_RUN_OUTPUT_CHARS = 2_000_000;
const TURN_TIMEOUT_MS = Math.max(60_000, Number(process.env.CODEX_TURN_TIMEOUT_MS || 15 * 60_000));

export const WORKSPACE_AGENT_TOOL = {
  type: 'function',
  function: {
    name: 'workspace_agent',
    description:
      'Runs the Socrates project workspace agent powered by Codex. Select it automatically when the user asks to create, edit, review, or inspect project files, implement/fix/refactor code, run commands or tests, explore a repository, perform an experiment, use MCP/project workspace context, or continue work across turns—even when only one file is involved. Do not wait for a manual Agent mode or worker start. Keep ordinary explanations, short calculations, and simple web research in native tools. The server owns the workspace, model, sandbox, MCP configuration, and approval policy. Read-only actions run automatically; file writes, commands, network side effects, and other risky actions may pause for an explicit user approval. After it finishes, summarize the result and mention any generated files or artifacts.',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          minLength: 1,
          maxLength: MAX_TASK_LENGTH,
          description: 'A precise multi-step task for the project workspace agent. Include the desired outcome and relevant constraints.',
        },
        mode: {
          type: 'string',
          enum: ['inspect', 'implement', 'experiment'],
          description: 'Optional intent hint. The server still applies its fixed sandbox and approval policy.',
        },
      },
      required: ['task'],
      additionalProperties: false,
    },
  },
} as const;

export type AgentRunStatus =
  | 'planning'
  | 'starting'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'disconnected';

export type AgentRunEventName =
  | 'run_started'
  | 'thread_started'
  | 'turn_started'
  | 'delta'
  | 'reasoning'
  | 'tool'
  | 'tool_output'
  | 'item_started'
  | 'item_completed'
  | 'approval_required'
  | 'approval_decided'
  | 'usage'
  | 'thread_status'
  | 'turn_completed'
  | 'run_completed'
  | 'run_waiting'
  | 'run_failed'
  | 'run_interrupted';

export interface AgentRuntimeEvent {
  runId: string;
  sequence: number;
  event: AgentRunEventName | string;
  data: Record<string, unknown>;
  createdAt?: string;
}

export interface CreateAgentRunInput {
  userId: string;
  task: string;
  sessionId?: string | null;
  projectId?: string | null;
  kind?: 'chat' | 'tutor' | 'scheduled' | 'retry';
  source?: 'chat' | 'tutor' | 'scheduled' | 'api';
  mode?: 'workspace';
  threadId?: string | null;
}

export interface AgentRunResult {
  runId: string;
  status: AgentRunStatus | string;
  output: string;
  summary?: string | null;
  artifacts: Array<Record<string, unknown>>;
  threadId?: string | null;
  workspaceId?: string | null;
  error?: string | null;
}

interface RuntimeSubscriber {
  (event: AgentRuntimeEvent): void;
}

const subscribers = new Map<string, Set<RuntimeSubscriber>>();
const sequenceQueues = new Map<string, Promise<unknown>>();
const activeTurns = new Map<string, { threadId: string; turnId: string | null; abort?: () => void }>();
const activeWatchers = new Set<string>();

function safeText(value: unknown, workspacePath?: string): string {
  let text = String(value ?? '');
  if (workspacePath) text = text.split(workspacePath).join('[workspace]');
  // Do not persist or stream bearer tokens, common API-key formats, or
  // values that look like environment secrets in command/output events.
  text = text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-[redacted]');
  return text.length > MAX_EVENT_TEXT ? `${text.slice(0, MAX_EVENT_TEXT)}\n[…truncated…]` : text;
}

function appendBoundedOutput(current: string, chunk: unknown): string {
  if (current.length >= MAX_RUN_OUTPUT_CHARS) return current;
  const text = String(chunk ?? '');
  const remaining = MAX_RUN_OUTPUT_CHARS - current.length;
  return current + text.slice(0, remaining);
}

function redactForEvent(value: unknown, workspacePath?: string, depth = 0): unknown {
  if (depth > 5) return '[truncated]';
  if (typeof value === 'string') return safeText(value, workspacePath);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactForEvent(item, workspacePath, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/^(authorization|api[_-]?key|token|secret|password|env)$/i.test(key)) {
      out[key] = '[redacted]';
    } else {
      out[key] = redactForEvent(item, workspacePath, depth + 1);
    }
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function rpcId(value: string): number | string {
  return /^\d+$/.test(value) ? Number(value) : value;
}

function statusFromTurn(status: unknown): AgentRunStatus {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('interrupt') || normalized === 'cancelled') return 'interrupted';
  if (normalized === 'completed' || normalized === 'success' || normalized === 'succeeded') return 'completed';
  if (normalized === 'awaiting_approval') return 'awaiting_approval';
  if (normalized === 'failed' || normalized === 'error') return 'failed';
  return 'running';
}

function artifactLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
    '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
    '.css': 'css', '.html': 'html', '.svg': 'svg', '.json': 'json',
    '.yaml': 'yaml', '.yml': 'yaml', '.sql': 'sql', '.md': 'markdown',
    '.txt': 'text', '.csv': 'csv',
  };
  return map[ext] || null;
}

async function collectWorkspaceArtifacts(
  run: typeof agentRuns.$inferSelect,
  workspacePath: string,
): Promise<Array<Record<string, unknown>>> {
  const db = getDb();
  const candidates: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 5 || candidates.length >= 24) return;
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> = [];
    try { entries = readdirSync(dir, { withFileTypes: true }) as unknown as typeof entries; } catch { return; }
    for (const entry of entries) {
      if (candidates.length >= 24) break;
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.agents' || entry.name === '.socrates' || entry.name === 'AGENTS.md') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath, depth + 1);
      else if (entry.isFile() && artifactLanguage(fullPath)) candidates.push(fullPath);
    }
  };
  visit(workspacePath, 0);
  const collected: Array<Record<string, unknown>> = [];
  for (const filePath of candidates) {
    let source = '';
    try {
      const stat = statSync(filePath);
      if (stat.size <= 0 || stat.size > 250_000) continue;
      source = readFileSync(filePath, 'utf8');
      if (source.includes('\u0000')) continue;
    } catch { continue; }
    const relativeName = path.relative(workspacePath, filePath).replace(/\\/g, '/');
    const language = artifactLanguage(filePath);
    const type = language === 'markdown' || language === 'text' ? 'markdown' : language === 'svg' ? 'svg' : 'code';
    const [existing] = await db.select({ id: artifacts.id, title: artifacts.title, type: artifacts.type, language: artifacts.language })
      .from(artifacts)
      .where(and(eq(artifacts.agentRunId, run.id), eq(artifacts.title, relativeName)))
      .limit(1);
    if (existing) {
      collected.push({ id: existing.id, name: existing.title, type: existing.type, language: existing.language });
      continue;
    }
    const [artifact] = await db.insert(artifacts).values({
      userId: run.userId,
      type,
      title: relativeName,
      source: safeText(source, workspacePath),
      language,
      sessionId: run.sessionId,
      projectId: run.projectId,
      agentRunId: run.id,
    }).returning({ id: artifacts.id, title: artifacts.title, type: artifacts.type, language: artifacts.language });
    if (artifact) collected.push({ id: artifact.id, name: artifact.title, type: artifact.type, language: artifact.language });
  }
  return collected;
}

function publishToSubscribers(event: AgentRuntimeEvent) {
  const set = subscribers.get(event.runId);
  if (!set) return;
  for (const listener of [...set]) {
    try { listener(event); } catch (err) { console.warn('[agent-runtime] subscriber failed:', (err as Error).message); }
  }
}

/** Persist an event in sequence and notify live SSE subscribers. */
export function publishAgentEvent(
  runId: string,
  event: AgentRunEventName | string,
  data: Record<string, unknown> = {},
  workspacePath?: string,
): Promise<AgentRuntimeEvent> {
  const previous = sequenceQueues.get(runId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const db = getDb();
    const [last] = await db.select({ sequence: max(agentRunEvents.sequence) })
      .from(agentRunEvents)
      .where(eq(agentRunEvents.runId, runId));
    const sequence = Number(last?.sequence || 0) + 1;
    const safeData = asRecord(redactForEvent(data, workspacePath));
    await db.insert(agentRunEvents).values({ runId, sequence, event, payload: safeData });
    const runtimeEvent: AgentRuntimeEvent = { runId, sequence, event, data: safeData };
    publishToSubscribers(runtimeEvent);
    return runtimeEvent;
  });
  sequenceQueues.set(runId, next);
  void next.finally(() => {
    if (sequenceQueues.get(runId) === next) sequenceQueues.delete(runId);
  });
  return next;
}

export function subscribeToAgentRun(runId: string, listener: RuntimeSubscriber): () => void {
  let set = subscribers.get(runId);
  if (!set) {
    set = new Set();
    subscribers.set(runId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) subscribers.delete(runId);
  };
}

async function resolveContext(input: CreateAgentRunInput) {
  const db = getDb();
  let session: typeof sessions.$inferSelect | null = null;
  if (input.sessionId != null) {
    if (!isValidUuid(input.sessionId)) throw new BadRequest('Invalid sessionId');
    const [row] = await db.select().from(sessions)
      .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, input.userId))).limit(1);
    if (!row) throw new NotFound('Session not found');
    session = row;
  }

  const requestedProjectId = input.projectId || session?.projectId || null;
  let project: typeof projects.$inferSelect | null = null;
  if (requestedProjectId != null) {
    if (!isValidUuid(requestedProjectId)) throw new BadRequest('Invalid projectId');
    const [row] = await db.select().from(projects)
      .where(and(eq(projects.id, requestedProjectId), eq(projects.userId, input.userId))).limit(1);
    if (!row) throw new NotFound('Project not found');
    project = row;
  }
  return { session, project, projectId: project?.id || null };
}

async function getOrCreateWorkspace(userId: string, projectId: string | null, workspacePolicy: Record<string, unknown>) {
  const db = getDb();
  const workspaceKey = projectId ? `project:${projectId}` : 'user:default';
  const [existing] = await db.select().from(codexWorkspaces)
    .where(and(eq(codexWorkspaces.userId, userId), eq(codexWorkspaces.workspaceKey, workspaceKey))).limit(1);
  if (existing) {
    await db.update(codexWorkspaces).set({ lastUsedAt: new Date(), updatedAt: new Date(), status: 'active' })
      .where(eq(codexWorkspaces.id, existing.id));
    return { row: existing, path: ensureProjectWorkspace(userId, workspaceKey) };
  }
  const [created] = await db.insert(codexWorkspaces).values({
    userId,
    projectId,
    workspaceKey,
    policy: workspacePolicy,
  }).returning();
  if (!created) throw new Error('Unable to create Codex workspace');
  return { row: created, path: ensureProjectWorkspace(userId, workspaceKey) };
}

const DEFAULT_POLICY = {
  approvalPolicy: 'on-request',
  sandbox: 'workspace-write',
  unattended: 'read-only',
  maxDurationMs: TURN_TIMEOUT_MS,
  maxOutputBytes: 2_000_000,
};

async function startCodexThread(
  run: typeof agentRuns.$inferSelect,
  context: { projectId: string | null; project: typeof projects.$inferSelect | null },
  workspace: { row: typeof codexWorkspaces.$inferSelect; path: string },
) {
  await codexHarness.ensureStarted();
  const provider = await resolveCodexProvider(run.userId);
  const mcpConfig = CODEX_MCP_ENABLED
    ? await resolveCodexMcpConfig(run.userId, context.projectId)
    : null;
  const requestedThreadId = run.threadId;
  let thread: any = null;

  // A persisted thread may survive a web-server restart. Ask the app-server
  // to resume it when possible; older Codex builds can reject this method,
  // in which case the run remains auditable and the caller gets a clear
  // disconnected state instead of silently starting a new conversation.
  if (requestedThreadId) {
    try {
      const resumed = await codexHarness.request('thread/resume', {
        threadId: requestedThreadId,
        cwd: workspace.path,
        approvalPolicy: DEFAULT_POLICY.approvalPolicy,
        sandbox: DEFAULT_POLICY.sandbox,
        ...((provider.config || mcpConfig) ? { config: { ...(provider.config || {}), ...(mcpConfig || {}) } } : {}),
      });
      thread = resumed?.thread || { id: requestedThreadId };
    } catch (err) {
      if (codexHarness.isThreadOwner(requestedThreadId, run.userId)) {
        thread = { id: requestedThreadId };
      } else {
        throw new Error(`Codex thread could not be resumed: ${(err as Error).message}`);
      }
    }
  }

  if (!thread) {
    const params: Record<string, unknown> = {
      cwd: workspace.path,
      approvalPolicy: DEFAULT_POLICY.approvalPolicy,
      sandbox: DEFAULT_POLICY.sandbox,
      // Unlike the legacy compatibility route, unified threads are durable.
      ephemeral: false,
      sessionStartSource: 'socrates',
    };
    const config = { ...(provider.config || {}), ...(mcpConfig || {}) };
    if (Object.keys(config).length) params.config = config;
    if (provider.model) params.model = provider.model;
    const result = await codexHarness.request('thread/start', params);
    thread = result?.thread;
  }
  if (!thread?.id) throw new Error('Codex thread/start returned no thread id');

  codexHarness.claimThread(thread.id, run.userId, String(thread.model ?? provider.model ?? ''));
  const db = getDb();
  ensureWorkspaceInstructions(workspace.path, context.project?.systemPrompt);
  const [existing] = await db.select().from(codexThreads).where(eq(codexThreads.threadId, String(thread.id))).limit(1);
  if (!existing) {
    await db.insert(codexThreads).values({
      userId: run.userId,
      projectId: context.projectId,
      sessionId: run.sessionId,
      workspaceId: workspace.row.id,
      threadId: String(thread.id),
      status: 'active',
      model: thread.model ?? provider.model,
      providerMode: provider.mode,
    });
  } else {
    await db.update(codexThreads).set({ status: 'active', updatedAt: new Date(), lastTurnId: run.threadId ? existing.lastTurnId : null })
      .where(eq(codexThreads.id, existing.id));
  }
  await db.update(agentRuns).set({
    threadId: String(thread.id),
    workspaceId: workspace.row.id,
    providerMode: provider.mode,
    model: thread.model ?? provider.model,
    status: 'running',
  }).where(eq(agentRuns.id, run.id));
  await publishAgentEvent(run.id, 'thread_started', {
    threadId: String(thread.id),
    workspaceId: workspace.row.id,
    providerMode: provider.mode,
    model: thread.model ?? provider.model,
  }, workspace.path);
  return { threadId: String(thread.id), provider, workspacePath: workspace.path };
}

export async function createAgentRun(input: CreateAgentRunInput) {
  if (!UNIFIED_CODEX_ENABLED) throw new NotFound('Unified Codex runtime is disabled');
  const task = String(input.task || '').trim();
  if (!task) throw new BadRequest('task is required');
  if (task.length > MAX_TASK_LENGTH) throw new BadRequest('task is too long');
  const context = await resolveContext({ ...input, task });
  const db = getDb();
  const [run] = await db.insert(agentRuns).values({
    userId: input.userId,
    sessionId: context.session?.id || null,
    projectId: context.projectId,
    task,
    status: 'starting',
    mode: 'workspace',
    kind: input.kind || 'chat',
    source: input.source || 'api',
    threadId: input.threadId || null,
  }).returning();
  if (!run) throw new Error('Unable to create agent run');
  await db.insert(agentJobs).values({ runId: run.id, userId: input.userId, kind: input.kind === 'retry' ? 'retry' : 'run', status: 'queued' });
  await publishAgentEvent(run.id, 'run_started', {
    task,
    kind: run.kind,
    source: run.source,
    projectId: context.projectId,
  });
  return { run, context };
}

async function loadRun(runId: string, userId: string) {
  const db = getDb();
  const [run] = await db.select().from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.userId, userId))).limit(1);
  if (!run) throw new NotFound('Agent run not found');
  return run;
}

async function workspaceForRun(run: typeof agentRuns.$inferSelect) {
  if (!run.workspaceId) throw new Error('Agent run has no workspace');
  const db = getDb();
  const [workspace] = await db.select().from(codexWorkspaces).where(eq(codexWorkspaces.id, run.workspaceId)).limit(1);
  if (!workspace) throw new NotFound('Agent workspace not found');
  return { row: workspace, path: ensureProjectWorkspace(run.userId, workspace.workspaceKey) };
}

function projectForRun(run: typeof agentRuns.$inferSelect) {
  return (async () => {
    const db = getDb();
    if (!run.projectId) return null;
    const [project] = await db.select().from(projects).where(eq(projects.id, run.projectId)).limit(1);
    return project || null;
  })();
}

async function updateRunStatus(runId: string, status: AgentRunStatus, patch: Record<string, unknown> = {}) {
  const db = getDb();
  await db.update(agentRuns).set({ status, ...patch, ...(status === 'completed' || status === 'failed' || status === 'interrupted' ? { completedAt: new Date() } : {}) })
    .where(eq(agentRuns.id, runId));
  if (['completed', 'failed', 'interrupted', 'disconnected'].includes(status)) {
    await db.update(agentJobs).set({ status: status === 'completed' ? 'completed' : 'failed', updatedAt: new Date(), error: typeof patch.error === 'string' ? patch.error : null })
      .where(eq(agentJobs.runId, runId));
  } else if (status === 'awaiting_approval') {
    await db.update(agentJobs).set({ status: 'awaiting_approval', updatedAt: new Date() }).where(eq(agentJobs.runId, runId));
  }
}

async function recordApproval(run: typeof agentRuns.$inferSelect, data: Record<string, unknown>, workspacePath: string) {
  const db = getDb();
  const requestId = String(data.requestId ?? '');
  if (!requestId) return;
  const kind = String(data.kind || 'unknown');
  let [existing] = await db.select().from(agentApprovals)
    .where(and(eq(agentApprovals.runId, run.id), eq(agentApprovals.requestId, requestId))).limit(1);
  if (!existing) {
    [existing] = await db.insert(agentApprovals).values({
      runId: run.id,
      userId: run.userId,
      threadId: String(data.threadId || run.threadId || ''),
      requestId,
      kind,
      payload: redactForEvent(data, workspacePath) as Record<string, unknown>,
    }).returning();
  }
  await updateRunStatus(run.id, 'awaiting_approval');
  await publishAgentEvent(run.id, 'approval_required', { ...data, approvalId: existing?.id || requestId }, workspacePath);
}

function approvalDataFromPending(pending: { rpcId: number | string; method: string; threadId: string; turnId: string | null; itemId: string | null; params: Record<string, unknown> }) {
  const mapped = mapCodexNotification(pending.method, pending.params, pending.rpcId);
  return mapped?.event === 'approval_required' ? mapped.data : null;
}

export async function runAgentTurn(
  runId: string,
  userId: string,
  taskOverride?: string,
  signal?: AbortSignal,
  options: { stopOnApproval?: boolean } = {},
): Promise<AgentRunResult> {
  let run = await loadRun(runId, userId);
  let threadInfo: Awaited<ReturnType<typeof startCodexThread>> | null = null;
  if (taskOverride != null) {
    const task = String(taskOverride).trim();
    if (!task || task.length > MAX_TASK_LENGTH) throw new BadRequest('Invalid task');
    await getDb().update(agentRuns).set({ task }).where(eq(agentRuns.id, runId));
    run = { ...run, task };
  }
  if (!run.threadId || !run.workspaceId) {
    const workspace = await getOrCreateWorkspace(userId, run.projectId, DEFAULT_POLICY);
    const project = await projectForRun(run);
    const started = await startCodexThread(run, { projectId: run.projectId, project }, workspace);
    threadInfo = started;
    run = (await loadRun(runId, userId));
    run = { ...run, threadId: started.threadId, workspaceId: workspace.row.id };
  }

  const workspace = await workspaceForRun(run);
  const project = await projectForRun(run);
  if (!threadInfo) threadInfo = await startCodexThread(run, { projectId: run.projectId, project }, workspace);
  const threadId = threadInfo.threadId;
  let output = '';
  let usage: unknown = null;
  let turnId: string | null = null;
  let approvalPersistence: Promise<unknown> | null = null;
  let settled = false;
  let resolveDone: (result: { status: AgentRunStatus; error?: string | null }) => void = () => undefined;
  let rejectDone: (error: Error) => void = () => undefined;
  const done = new Promise<{ status: AgentRunStatus; error?: string | null }>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const finish = (result: { status: AgentRunStatus; error?: string | null }) => {
    if (settled) return;
    settled = true;
    resolveDone(result);
  };
  const onEvent = (method: string, params: Record<string, any>, meta?: { rpcId: number | string }) => {
    const mapped = mapCodexNotification(method, params, meta?.rpcId);
    if (!mapped) return;
    const data = mapped.data;
    if (mapped.event === 'delta') output = appendBoundedOutput(output, data.delta);
    if (mapped.event === 'usage') usage = data.usage || null;
    if (mapped.event === 'turn_started') {
      turnId = data.turnId ? String(data.turnId) : turnId;
      void publishAgentEvent(runId, 'turn_started', { ...data, turnId }, workspace.path);
    } else if (mapped.event === 'turn_completed') {
      const status = statusFromTurn(data.status);
      void publishAgentEvent(runId, 'turn_completed', data, workspace.path);
      finish({ status, error: data.error ? String(data.error) : null });
    } else if (mapped.event === 'approval_required') {
      approvalPersistence = recordApproval(run, data, workspace.path);
      if (options.stopOnApproval) finish({ status: 'awaiting_approval' });
    } else {
      void publishAgentEvent(runId, mapped.event, data, workspace.path);
    }
  };

  const unsubscribe = codexHarness.onThreadEvent(threadId, onEvent);
  for (const pending of codexHarness.listApprovals(threadId)) {
    const pendingData = approvalDataFromPending(pending);
    if (pendingData) void recordApproval(run, pendingData, workspace.path);
  }

  const abortTurn = () => {
    const activeTurnId = turnId || activeTurns.get(runId)?.turnId;
    if (activeTurnId) void codexHarness.request('turn/interrupt', { threadId, turnId: activeTurnId }).catch(() => undefined);
  };
  activeTurns.set(runId, { threadId, turnId, abort: abortTurn });
  const onAbort = () => abortTurn();
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    await updateRunStatus(runId, 'running');
    const prompt = project?.systemPrompt
      ? `[Project instructions]\n${String(project.systemPrompt).slice(0, 50_000)}\n\n[Task]\n${run.task}`
      : run.task;
    const turnResult = await codexHarness.request('turn/start', {
      threadId,
      clientUserMessageId: randomUUID(),
      input: [{ type: 'text', text: prompt }],
    });
    turnId = turnResult?.turn?.id ? String(turnResult.turn.id) : turnId;
    activeTurns.set(runId, { threadId, turnId, abort: abortTurn });
    if (turnId) {
      await getDb().update(codexThreads).set({ lastTurnId: turnId, updatedAt: new Date(), status: 'active' }).where(eq(codexThreads.threadId, threadId));
    }
    const timeout = setTimeout(() => {
      abortTurn();
      finish({ status: 'failed', error: 'Codex turn timed out' });
    }, TURN_TIMEOUT_MS);
    timeout.unref?.();
    const completed = await done;
    if (approvalPersistence) await approvalPersistence;
    clearTimeout(timeout);
    const finalStatus = completed.status;
    const finalError = completed.error || null;
    const summary = output.trim().slice(0, 12_000) || (finalError ? null : 'Codex completed the workspace task.');
    let artifactsFound: Array<Record<string, unknown>> = [];
    if (finalStatus === 'completed') {
      try { artifactsFound = await collectWorkspaceArtifacts(run, workspace.path); }
      catch (err) { console.warn('[agent-runtime] artifact collection failed:', (err as Error).message); }
    }
    await updateRunStatus(runId, finalStatus, {
      summary,
      error: finalError,
      usage: usage && typeof usage === 'object' ? usage : {},
    });
    await publishAgentEvent(runId, finalStatus === 'completed' ? 'run_completed' : finalStatus === 'interrupted' ? 'run_interrupted' : finalStatus === 'awaiting_approval' ? 'run_waiting' : 'run_failed', {
      status: finalStatus,
      summary,
      error: finalError,
      usage,
    }, workspace.path);
    return {
      runId,
      status: finalStatus,
      output,
      summary,
      artifacts: artifactsFound,
      threadId,
      workspaceId: workspace.row.id,
      error: finalError,
    };
  } catch (err) {
    const message = safeText((err as Error).message || err, workspace.path);
    await updateRunStatus(runId, 'failed', { error: message, summary: null });
    await publishAgentEvent(runId, 'run_failed', { status: 'failed', error: message }, workspace.path);
    rejectDone(err as Error);
    throw err;
  } finally {
    unsubscribe();
    activeTurns.delete(runId);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export async function runWorkspaceAgent(input: CreateAgentRunInput, signal?: AbortSignal) {
  const { run } = await createAgentRun(input);
  return runAgentTurn(run.id, input.userId, undefined, signal);
}

export async function getAgentRun(userId: string, runId: string) {
  const run = await loadRun(runId, userId);
  const db = getDb();
  const approvals = await db.select().from(agentApprovals)
    .where(and(eq(agentApprovals.runId, run.id), eq(agentApprovals.userId, userId), eq(agentApprovals.status, 'pending')))
    .orderBy(desc(agentApprovals.createdAt));
  const generatedArtifacts = await db.select({
    id: artifacts.id,
    name: artifacts.title,
    type: artifacts.type,
    language: artifacts.language,
    createdAt: artifacts.createdAt,
  }).from(artifacts)
    .where(and(eq(artifacts.agentRunId, run.id), eq(artifacts.userId, userId)))
    .orderBy(asc(artifacts.createdAt));
  return { run, approvals, artifacts: generatedArtifacts };
}

/**
 * Continue observing a Codex turn that was intentionally detached from a
 * scheduled request while it waited for approval. Approval itself is a
 * short HTTP transaction; this watcher keeps the underlying turn durable and
 * finalizes the run after the user decides, even when no browser SSE stream
 * is open anymore.
 */
async function watchAgentTurn(runId: string, userId: string, threadId: string) {
  if (activeWatchers.has(runId) || activeTurns.has(runId)) return;
  activeWatchers.add(runId);
  let unsubscribe: (() => void) | null = null;
  try {
    const run = await loadRun(runId, userId);
    const db = getDb();
    const workspace = await workspaceForRun(run);
    await codexHarness.ensureStarted();
    codexHarness.claimThread(threadId, userId, run.model || '');
    let output = '';
    let usage: unknown = null;
    let approvalPersistence: Promise<unknown> | null = null;
    let settled = false;
    let resolveDone: (result: { status: AgentRunStatus; error?: string | null }) => void = () => undefined;
    const done = new Promise<{ status: AgentRunStatus; error?: string | null }>((resolve) => { resolveDone = resolve; });
    const finish = (result: { status: AgentRunStatus; error?: string | null }) => {
      if (settled) return;
      settled = true;
      resolveDone(result);
    };
    const onEvent = (method: string, params: Record<string, any>, meta?: { rpcId: number | string }) => {
      const mapped = mapCodexNotification(method, params, meta?.rpcId);
      if (!mapped) return;
      if (mapped.event === 'delta') output = appendBoundedOutput(output, mapped.data.delta);
      if (mapped.event === 'usage') usage = mapped.data.usage || null;
      if (mapped.event === 'approval_required') {
        approvalPersistence = recordApproval(run, mapped.data, workspace.path);
      } else if (mapped.event === 'turn_completed') {
        void publishAgentEvent(runId, 'turn_completed', mapped.data, workspace.path);
        finish({ status: statusFromTurn(mapped.data.status), error: mapped.data.error ? String(mapped.data.error) : null });
      } else {
        void publishAgentEvent(runId, mapped.event, mapped.data, workspace.path);
      }
    };
    unsubscribe = codexHarness.onThreadEvent(threadId, onEvent);
    const timeout = setTimeout(() => finish({ status: 'failed', error: 'Codex approval continuation timed out' }), TURN_TIMEOUT_MS);
    timeout.unref?.();
    const completed = await done;
    if (approvalPersistence) await approvalPersistence;
    clearTimeout(timeout);
    const summary = output.trim().slice(0, 12_000) || completed.error || null;
    if (completed.status === 'completed') {
      try { await collectWorkspaceArtifacts(run, workspace.path); }
      catch (err) { console.warn('[agent-runtime] resumed artifact collection failed:', (err as Error).message); }
    }
    await updateRunStatus(runId, completed.status, { summary, error: completed.error || null, usage: usage || {} });
    await publishAgentEvent(runId, completed.status === 'completed' ? 'run_completed' : completed.status === 'interrupted' ? 'run_interrupted' : 'run_failed', {
      status: completed.status,
      summary,
      error: completed.error || null,
      usage,
    }, workspace.path);
    if (run.source === 'scheduled') {
      const [task] = await db.select().from(scheduledTasks).where(eq(scheduledTasks.lastRunId, runId)).limit(1);
      if (task) {
        const recurring = ['hourly', 'daily', 'weekly', 'monthly'].includes(String(task.frequency));
        let nextRunAt: Date | null = null;
        if (recurring) {
          nextRunAt = new Date();
          if (task.frequency === 'hourly') nextRunAt.setHours(nextRunAt.getHours() + 1);
          if (task.frequency === 'daily') nextRunAt.setDate(nextRunAt.getDate() + 1);
          if (task.frequency === 'weekly') nextRunAt.setDate(nextRunAt.getDate() + 7);
          if (task.frequency === 'monthly') nextRunAt.setMonth(nextRunAt.getMonth() + 1);
        }
        await db.update(scheduledTasks).set({
          status: completed.status === 'completed' ? (recurring ? 'active' : 'completed') : 'failed',
          nextRunAt,
          updatedAt: new Date(),
        }).where(eq(scheduledTasks.id, task.id));
      }
    }
  } catch (err) {
    const message = safeText((err as Error).message || err);
    await updateRunStatus(runId, 'failed', { error: message, summary: null }).catch(() => undefined);
    await publishAgentEvent(runId, 'run_failed', { status: 'failed', error: message }).catch(() => undefined);
  } finally {
    unsubscribe?.();
    activeWatchers.delete(runId);
  }
}

export async function listAgentRuns(userId: string, filters: { sessionId?: string; projectId?: string; limit?: number } = {}) {
  const db = getDb();
  const predicates = [eq(agentRuns.userId, userId)];
  if (filters.sessionId) predicates.push(eq(agentRuns.sessionId, filters.sessionId));
  if (filters.projectId) predicates.push(eq(agentRuns.projectId, filters.projectId));
  return db.select().from(agentRuns).where(and(...predicates)).orderBy(desc(agentRuns.startedAt)).limit(Math.min(100, Math.max(1, filters.limit || 30)));
}

export async function listAgentEvents(userId: string, runId: string, after = 0, limit = 500) {
  await loadRun(runId, userId);
  const db = getDb();
  return db.select().from(agentRunEvents)
    .where(and(eq(agentRunEvents.runId, runId)))
    .orderBy(asc(agentRunEvents.sequence)).limit(Math.min(2_000, Math.max(1, limit)))
    .then((rows) => rows.filter((row) => row.sequence > after).map((row) => ({
      runId: row.runId,
      sequence: row.sequence,
      event: row.event,
      data: asRecord(row.payload),
      createdAt: row.createdAt.toISOString(),
    })));
}

export async function decideAgentApproval(userId: string, runId: string, approvalId: string, decision: string) {
  const allowed = new Set(['accept', 'acceptForSession', 'decline', 'cancel']);
  if (!allowed.has(decision)) throw new BadRequest('Invalid approval decision');
  await loadRun(runId, userId);
  const db = getDb();
  const [approval] = await db.select().from(agentApprovals)
    .where(and(eq(agentApprovals.id, approvalId), eq(agentApprovals.runId, runId), eq(agentApprovals.userId, userId))).limit(1);
  if (!approval) throw new NotFound('Approval not found');
  if (approval.status !== 'pending') return { ok: true, status: approval.status, idempotent: true };
  const ok = codexHarness.respondToRequest(rpcId(approval.requestId), { decision });
  if (!ok) throw new NotFound('Approval request is no longer pending');
  const status = decision === 'accept' ? 'accepted' : decision === 'acceptForSession' ? 'accepted_for_session' : decision === 'decline' ? 'declined' : 'cancelled';
  await db.update(agentApprovals).set({ status, decision, decidedAt: new Date() }).where(eq(agentApprovals.id, approval.id));
  await updateRunStatus(runId, status.startsWith('accepted') ? 'running' : 'failed', status.startsWith('accepted') ? {} : { error: `Approval ${status}` });
  await publishAgentEvent(runId, 'approval_decided', { approvalId: approval.id, decision, status });
  if (status.startsWith('accepted') && !activeTurns.has(runId)) {
    void watchAgentTurn(runId, userId, approval.threadId);
  }
  return { ok: true, status, idempotent: false };
}

export async function interruptAgentRun(userId: string, runId: string) {
  const run = await loadRun(runId, userId);
  const active = activeTurns.get(runId);
  const threadId = run.threadId || active?.threadId;
  const turnId = active?.turnId || null;
  if (!threadId || !turnId) {
    await updateRunStatus(runId, 'interrupted', { summary: 'Stopped before the turn started.' });
    return { ok: true, status: 'interrupted' };
  }
  await codexHarness.request('turn/interrupt', { threadId, turnId });
  await publishAgentEvent(runId, 'run_interrupted', { turnId });
  return { ok: true, status: 'interrupt_requested' };
}

export async function resumeAgentRun(userId: string, runId: string, task?: string, signal?: AbortSignal) {
  const run = await loadRun(runId, userId);
  if (!run.threadId) throw new BadRequest('Run has no resumable Codex thread');
  return runAgentTurn(run.id, userId, task, signal);
}

export async function retryAgentRun(userId: string, runId: string, signal?: AbortSignal) {
  const run = await loadRun(runId, userId);
  const { run: retry } = await createAgentRun({
    userId,
    task: run.task,
    sessionId: run.sessionId,
    projectId: run.projectId,
    kind: 'retry',
    source: run.source === 'scheduled' ? 'scheduled' : 'api',
  });
  return runAgentTurn(retry.id, userId, undefined, signal);
}

export async function rehydrateAgentThread(userId: string, runId: string) {
  const run = await loadRun(runId, userId);
  if (!run.threadId) throw new BadRequest('Run has no Codex thread');
  const workspace = await workspaceForRun(run);
  await startCodexThread(run, { projectId: run.projectId, project: await projectForRun(run) }, workspace);
  await updateRunStatus(runId, 'disconnected', { summary: 'Codex thread reconnected; ready to resume.' });
  return getAgentRun(userId, runId);
}

/**
 * On a server restart the in-memory harness ownership table is empty. Probe
 * unfinished persisted runs so the application either reclaims their thread
 * or marks them explicitly disconnected for a user-driven resume.
 */
export async function recoverAgentRunsOnStartup(): Promise<{ checked: number; recovered: number; disconnected: number }> {
  if (!UNIFIED_CODEX_ENABLED) return { checked: 0, recovered: 0, disconnected: 0 };
  const db = getDb();
  const rows = await db.select().from(agentRuns)
    .where(inArray(agentRuns.status, ['starting', 'running', 'awaiting_approval']))
    .orderBy(asc(agentRuns.startedAt)).limit(100);
  let recovered = 0;
  let disconnected = 0;
  for (const run of rows) {
    if (!run.threadId || !run.workspaceId) {
      await updateRunStatus(run.id, 'disconnected', { error: 'Run was interrupted by a server restart.' });
      disconnected++;
      continue;
    }
    try {
      const workspace = await workspaceForRun(run);
      await startCodexThread(run, { projectId: run.projectId, project: await projectForRun(run) }, workspace);
      if (run.status === 'awaiting_approval') await updateRunStatus(run.id, 'awaiting_approval');
      else await updateRunStatus(run.id, 'disconnected', { summary: 'Thread reconnected after restart; resume to continue.' });
      await publishAgentEvent(run.id, 'thread_status', {
        status: run.status === 'awaiting_approval' ? 'awaiting_approval' : 'disconnected',
        recovered: true,
      }, workspace.path);
      recovered++;
    } catch (err) {
      await updateRunStatus(run.id, 'disconnected', { error: safeText((err as Error).message || err) });
      await publishAgentEvent(run.id, 'thread_status', { status: 'disconnected', recovered: false }).catch(() => undefined);
      disconnected++;
    }
  }
  return { checked: rows.length, recovered, disconnected };
}
