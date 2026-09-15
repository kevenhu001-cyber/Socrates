/**
 * Unified Agent Runtime
 *
 * Native tools and the Pi workspace agent both surface through the same
 * run/event contract. Native tools still execute in chat/stream.ts because
 * they have specialised streaming semantics; this module owns the durable
 * workspace-agent path used by Chat, Tutor and scheduled jobs.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { asc, and, desc, eq, inArray, max } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import {
  agentJobs,
  agentRunEvents,
  agentRuns,
  artifacts,
  codexWorkspaces,
  projects,
  sessions,
} from '../db/schema.js';
import { BadRequest, NotFound } from '../lib/errors.js';
import {
  ensureProjectWorkspace,
  ensureSessionWorkspace,
  ensureWorkspaceForKey,
  ensureWorkspaceInstructions,
  removeSessionWorkspace,
  sessionWorkspaceKey,
} from './workspacePaths.js';
import {
  PI_AGENT_ENABLED,
  runPiAgentTask,
  type PiAgentEvent,
  type PiAgentProvider,
} from './piAgent.js';
import { getActiveApiKey } from './apiKey.js';
import {
  WORKSPACE_LIMIT_DEFAULTS,
  assertWorkspaceDiskWithinLimit,
  limitsFromPolicy,
  normalizeWorkspaceLimits,
  workspaceResourceSnapshot,
} from './workspaceResources.js';

export const WORKSPACE_AGENT_ENABLED = PI_AGENT_ENABLED;
export const WORKSPACE_AGENT_BACKGROUND_ENABLED = PI_AGENT_ENABLED;

const MAX_TASK_LENGTH = 20_000;
const MAX_EVENT_TEXT = 120_000;
const MAX_RUN_OUTPUT_CHARS = 2_000_000;
const TURN_TIMEOUT_MS = Math.max(60_000, Number(process.env.PI_AGENT_TURN_TIMEOUT_MS || process.env.CODEX_TURN_TIMEOUT_MS || 15 * 60_000));

export const WORKSPACE_AGENT_TOOL = {
  type: 'function',
  function: {
    name: 'workspace_agent',
    description:
      'Runs the Socrates project workspace agent powered by the Pi coding agent (read, bash, edit, write tools — no web search or MCP inside the workspace). Select it automatically when the user asks to create, edit, review, or inspect project files, implement/fix/refactor code, run commands or tests, explore a repository, perform an experiment, use project workspace context, or continue work across turns—even when only one file is involved. Do not wait for a manual Agent mode or worker start. Keep ordinary explanations, short calculations, and simple web research in native tools. The server owns the workspace directory, its process environment, and resource limits; commands run autonomously without an approval step. Call initialize_workspace first when the user wants an explicit workspace or a clean slate. After it finishes, summarize the result and mention any generated files or artifacts.',
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
          description: 'Optional intent hint. The server applies its fixed execution policy regardless.',
        },
      },
      required: ['task'],
      additionalProperties: false,
    },
  },
} as const;

/**
 * `initialize_workspace` — explicit, model-callable workspace setup.
 *
 * The agent runtime lazily creates the workspace on the first run; this
 * tool lets the model establish it up front with a declared resource
 * budget, optionally wiping the tree for a clean start. The server owns
 * the real path and the sandbox/approval policy; the model only ever sees
 * a virtual `/workspace` mount and the normalized limits.
 */
export const INITIALIZE_WORKSPACE_TOOL = {
  type: 'function',
  function: {
    name: 'initialize_workspace',
    description:
      'Initializes (or resets) the server-owned workspace for this conversation and sets its resource limits before doing multi-step agent work. Call this once before the first workspace_agent task when the user asks for coding, file, or command work, and call it with reset=true when the user wants a clean workspace. Limits are clamped to the server-supported range and the storage cap is enforced before every agent turn. The server owns the workspace location and execution policy; there is no interactive approval step.',
    parameters: {
      type: 'object',
      properties: {
        max_memory_mb: {
          type: 'integer',
          minimum: 64,
          maximum: 4096,
          description: `Memory budget for agent executions in megabytes (default ${WORKSPACE_LIMIT_DEFAULTS.maxMemoryMb}, clamped to 64–4096).`,
        },
        max_disk_mb: {
          type: 'integer',
          minimum: 16,
          maximum: 8192,
          description: `Storage budget for the workspace tree in megabytes (default ${WORKSPACE_LIMIT_DEFAULTS.maxDiskMb}, clamped to 16–8192). Agent turns are refused while usage exceeds this cap.`,
        },
        reset: {
          type: 'boolean',
          description: 'When true, delete the existing workspace contents and start from an empty tree.',
        },
      },
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

async function getOrCreateWorkspace(
  userId: string,
  sessionId: string | null,
  projectId: string | null,
  workspacePolicy: Record<string, unknown>,
) {
  const db = getDb();
  /* A conversation is the isolation boundary. Project and user fallbacks are
   * kept for scheduled/legacy runs that do not have a session yet. */
  const workspaceKey = sessionId
    ? sessionWorkspaceKey(sessionId)
    : projectId
      ? `project:${projectId}`
      : 'user:default';
  const [existing] = await db.select().from(codexWorkspaces)
    .where(and(eq(codexWorkspaces.userId, userId), eq(codexWorkspaces.workspaceKey, workspaceKey))).limit(1);
  if (existing) {
    await db.update(codexWorkspaces).set({
      projectId,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
      status: 'active',
    })
      .where(eq(codexWorkspaces.id, existing.id));
    return {
      row: { ...existing, projectId },
      path: sessionId ? ensureSessionWorkspace(userId, sessionId) : ensureProjectWorkspace(userId, workspaceKey),
    };
  }
  /* Two requests can create the first task for a session at the same time
   * (for example a retry plus the chat stream). Let the unique key arbitrate
   * that race, then read the winner instead of surfacing a 23505 as an
   * unexplained "workspace initialization failed" error. */
  const [created] = await db.insert(codexWorkspaces).values({
    userId,
    projectId,
    workspaceKey,
    policy: workspacePolicy,
  }).onConflictDoNothing({
    target: [codexWorkspaces.userId, codexWorkspaces.workspaceKey],
  }).returning();
  if (!created) {
    const [raced] = await db.select().from(codexWorkspaces)
      .where(and(eq(codexWorkspaces.userId, userId), eq(codexWorkspaces.workspaceKey, workspaceKey))).limit(1);
    if (!raced) throw new Error('Unable to create Codex workspace');
    await db.update(codexWorkspaces).set({
      projectId,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
      status: 'active',
    }).where(eq(codexWorkspaces.id, raced.id));
    return {
      row: { ...raced, projectId },
      path: sessionId ? ensureSessionWorkspace(userId, sessionId) : ensureProjectWorkspace(userId, workspaceKey),
    };
  }
  return {
    row: created,
    path: sessionId ? ensureSessionWorkspace(userId, sessionId) : ensureProjectWorkspace(userId, workspaceKey),
  };
}

const DEFAULT_POLICY = {
  approvalPolicy: 'on-request',
  sandbox: 'workspace-write',
  unattended: 'read-only',
  maxDurationMs: TURN_TIMEOUT_MS,
  maxOutputBytes: 2_000_000,
  maxMemoryMb: WORKSPACE_LIMIT_DEFAULTS.maxMemoryMb,
  maxDiskMb: WORKSPACE_LIMIT_DEFAULTS.maxDiskMb,
};

/**
 * Create/repair the workspace attached to a conversation without starting a
 * Codex process. Session creation and the agent-run endpoint both call this,
 * so the folder exists before the first turn and can be reused by retries.
 */
export async function ensureSessionWorkspaceForSession(
  userId: string,
  sessionId: string,
  projectId: string | null = null,
) {
  if (!isValidUuid(sessionId)) throw new BadRequest('Invalid sessionId');
  return getOrCreateWorkspace(userId, sessionId, projectId, DEFAULT_POLICY);
}

export interface UpdateWorkspacePolicyInput {
  userId: string;
  sessionId?: string | null;
  projectId?: string | null;
  maxMemoryMb?: unknown;
  maxDiskMb?: unknown;
  reset?: unknown;
}

/**
 * Resolve the conversation workspace without mutating its policy. Returns
 * the server-owned path, the persisted policy, normalized limits, and the
 * current disk-gate result for the pre-run check.
 */
export async function getWorkspaceContext(
  userId: string,
  sessionId: string | null,
  projectId: string | null,
) {
  const workspace = await getOrCreateWorkspace(userId, sessionId, projectId, DEFAULT_POLICY);
  const policy = workspace.row.policy && typeof workspace.row.policy === 'object'
    ? (workspace.row.policy as Record<string, unknown>)
    : { ...DEFAULT_POLICY };
  return {
    workspaceId: workspace.row.id,
    workspaceKey: workspace.row.workspaceKey,
    path: workspace.path,
    policy,
    limits: limitsFromPolicy(policy),
    disk: assertWorkspaceDiskWithinLimit(workspace.path, policy),
  };
}

/**
 * Apply model-declared resource limits to the conversation workspace,
 * creating it on first use. `reset` wipes the tree (server-owned path
 * only) so the next task starts clean. Returns the normalized policy and
 * a usage snapshot the tool result can report back to the model.
 */
export async function updateWorkspacePolicy(input: UpdateWorkspacePolicyInput) {
  const limits = normalizeWorkspaceLimits({
    maxMemoryMb: input.maxMemoryMb,
    maxDiskMb: input.maxDiskMb,
  });
  const workspace = await getOrCreateWorkspace(
    input.userId,
    input.sessionId || null,
    input.projectId || null,
    { ...DEFAULT_POLICY, ...limits },
  );
  if (input.reset === true) {
    rmSync(workspace.path, { recursive: true, force: true });
    mkdirSync(workspace.path, { recursive: true });
  }
  ensureWorkspaceInstructions(workspace.path, null);
  const previous = workspace.row.policy && typeof workspace.row.policy === 'object'
    ? (workspace.row.policy as Record<string, unknown>)
    : {};
  const policy = { ...DEFAULT_POLICY, ...previous, ...limits };
  const db = getDb();
  await db.update(codexWorkspaces)
    .set({ policy, status: 'active', updatedAt: new Date(), lastUsedAt: new Date() })
    .where(eq(codexWorkspaces.id, workspace.row.id));
  return {
    workspaceId: workspace.row.id,
    workspaceKey: workspace.row.workspaceKey,
    path: workspace.path,
    policy,
    snapshot: workspaceResourceSnapshot(workspace.path, policy),
  };
}

/** Reconcile the durable workspace for every existing session after startup. */
export async function ensureSessionWorkspacesOnStartup(): Promise<{ checked: number; created: number; failed: number }> {
  if (!WORKSPACE_AGENT_ENABLED) return { checked: 0, created: 0, failed: 0 };
  const db = getDb();
  const rows = await db.select({ id: sessions.id, userId: sessions.userId, projectId: sessions.projectId }).from(sessions);
  let created = 0;
  let failed = 0;
  for (const session of rows) {
    try {
      const workspace = await getOrCreateWorkspace(session.userId, session.id, session.projectId, DEFAULT_POLICY);
      if (workspace.row.createdAt.getTime() >= Date.now() - 5_000) created++;
    } catch (err) {
      failed++;
      console.warn(`[agent-runtime] session workspace ${session.id} could not be initialized: ${(err as Error).message}`);
    }
  }
  return { checked: rows.length, created, failed };
}

/** Remove session workspace records and their private filesystem trees. */
export async function removeSessionWorkspacesForUser(userId: string, sessionIds: string[]): Promise<void> {
  const ids = sessionIds.filter(isValidUuid);
  if (ids.length === 0) return;
  const db = getDb();
  await db.delete(codexWorkspaces).where(and(
    eq(codexWorkspaces.userId, userId),
    inArray(codexWorkspaces.workspaceKey, ids.map(sessionWorkspaceKey)),
  ));
  for (const sessionId of ids) removeSessionWorkspace(userId, sessionId);
}

async function resolvePiProvider(userId: string): Promise<PiAgentProvider | null> {
  try {
    const provider = await getActiveApiKey(userId);
    if (!provider?.url || !provider.model) return null;
    return {
      baseUrl: String(provider.url).replace(/\/+$/, ''),
      model: String(provider.model),
      apiKey: provider.keyPlaintext || null,
    };
  } catch (err) {
    console.warn('[agent-runtime] provider lookup failed:', (err as Error).message);
    return null;
  }
}

function piStepItemType(kind: string): string {
  switch (kind) {
    case 'command': return 'commandExecution';
    case 'file_change': return 'fileChange';
    case 'search': return 'webSearch';
    case 'mcp': return 'mcpToolCall';
    default: return 'commandExecution';
  }
}

export async function createAgentRun(input: CreateAgentRunInput) {
  if (!WORKSPACE_AGENT_ENABLED) throw new NotFound('Workspace agent runtime is disabled');
  const task = String(input.task || '').trim();
  if (!task) throw new BadRequest('task is required');
  if (task.length > MAX_TASK_LENGTH) throw new BadRequest('task is too long');
  const context = await resolveContext({ ...input, task });
  const db = getDb();
  /* Bind the run to its session workspace at creation time. The old flow
   * inserted a run with a null workspaceId and postponed directory creation
   * until turn/start, which made the initialization endpoint look successful
   * while the first task could still fail or be marked disconnected on a
   * restart. */
  const workspace = await getOrCreateWorkspace(
    input.userId,
    context.session?.id || null,
    context.projectId,
    DEFAULT_POLICY,
  );
  /* Storage gate — the model sets the budget via initialize_workspace; a
   * workspace over its cap must not silently grow further. */
  const disk = assertWorkspaceDiskWithinLimit(workspace.path, workspace.row.policy);
  if (!disk.ok) {
    throw new BadRequest(
      `workspace_disk_limit: ${disk.usageBytes} bytes used, ${disk.maxBytes} bytes allowed. ` +
      'Reset the workspace (initialize_workspace with reset=true) or raise max_disk_mb before continuing.',
    );
  }
  const [run] = await db.insert(agentRuns).values({
    userId: input.userId,
    sessionId: context.session?.id || null,
    projectId: context.projectId,
    workspaceId: workspace.row.id,
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
    sessionId: run.sessionId,
    workspaceId: run.workspaceId,
  });
  return { run, context, workspace };
}

async function loadRun(runId: string, userId: string) {
  const db = getDb();
  const [run] = await db.select().from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.userId, userId))).limit(1);
  if (!run) throw new NotFound('Agent run not found');
  return run;
}

async function workspaceForRun(run: typeof agentRuns.$inferSelect) {
  const db = getDb();
  if (run.workspaceId) {
    const [workspace] = await db.select().from(codexWorkspaces).where(eq(codexWorkspaces.id, run.workspaceId)).limit(1);
    if (workspace) {
      await db.update(codexWorkspaces).set({ lastUsedAt: new Date(), updatedAt: new Date(), status: 'active' })
        .where(eq(codexWorkspaces.id, workspace.id));
      return { row: workspace, path: ensureWorkspaceForKey(run.userId, workspace.workspaceKey) };
    }
  }

  /* Repair legacy runs created before workspace binding, or runs whose
   * workspace row was removed during session cleanup. This makes resume and
   * retry self-healing instead of ending in the opaque "no workspace" error. */
  const repaired = await getOrCreateWorkspace(run.userId, run.sessionId, run.projectId, DEFAULT_POLICY);
  await db.update(agentRuns).set({ workspaceId: repaired.row.id }).where(eq(agentRuns.id, run.id));
  return repaired;
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


export async function runAgentTurn(
  runId: string,
  userId: string,
  taskOverride?: string,
  signal?: AbortSignal,
  options: { stopOnApproval?: boolean } = {},
): Promise<AgentRunResult> {
  let run = await loadRun(runId, userId);
  if (taskOverride != null) {
    const task = String(taskOverride).trim();
    if (!task || task.length > MAX_TASK_LENGTH) throw new BadRequest('Invalid task');
    await getDb().update(agentRuns).set({ task }).where(eq(agentRuns.id, runId));
    run = { ...run, task };
  }
  let workspace: Awaited<ReturnType<typeof workspaceForRun>> | null = null;
  let project: Awaited<ReturnType<typeof projectForRun>> | null = null;
  try {
    workspace = await workspaceForRun(run);
    project = await projectForRun(run);
  } catch (err) {
    const message = safeText((err as Error).message || err, workspace?.path);
    await updateRunStatus(runId, 'failed', { error: message, summary: null }).catch(() => undefined);
    await publishAgentEvent(runId, 'run_failed', { status: 'failed', error: message }, workspace?.path).catch(() => undefined);
    throw err;
  }
  if (!workspace) throw new Error('Workspace initialization returned no directory');
  const policy = workspace.row.policy && typeof workspace.row.policy === 'object'
    ? (workspace.row.policy as Record<string, unknown>)
    : { ...DEFAULT_POLICY };
  const disk = assertWorkspaceDiskWithinLimit(workspace.path, policy);
  if (!disk.ok) {
    const message = `workspace_disk_limit: ${disk.usageBytes} bytes used, ${disk.maxBytes} bytes allowed.`;
    await updateRunStatus(runId, 'failed', { error: message, summary: null }).catch(() => undefined);
    await publishAgentEvent(runId, 'run_failed', { status: 'failed', error: message }, workspace.path).catch(() => undefined);
    throw new BadRequest(message);
  }
  const piProvider = await resolvePiProvider(userId);
  const abortController = new AbortController();
  let output = '';

  const onEvent = (event: PiAgentEvent) => {
    if (event.type === 'delta' && event.chunk) {
      output = appendBoundedOutput(output, event.chunk);
      void publishAgentEvent(runId, 'delta', { delta: event.chunk }, workspace.path);
      return;
    }
    if (event.type === 'reasoning' && event.chunk) {
      void publishAgentEvent(runId, 'reasoning', { delta: event.chunk }, workspace.path);
      return;
    }
    if (event.type === 'step_update' && event.chunk) {
      void publishAgentEvent(runId, 'tool_output', { delta: event.chunk }, workspace.path);
      return;
    }
    if (event.type === 'step_start' && event.step) {
      void publishAgentEvent(runId, 'tool', {
        itemId: event.step.stepId,
        type: piStepItemType(event.step.kind),
        command: event.step.command,
        status: 'inProgress',
      }, workspace.path);
      return;
    }
    if (event.type === 'step_end' && event.step) {
      void publishAgentEvent(runId, 'item_completed', {
        itemId: event.step.stepId,
        type: piStepItemType(event.step.kind),
        command: event.step.command,
        status: event.step.isError ? 'failed' : 'completed',
        exitCode: event.step.isError ? 1 : 0,
        aggregatedOutput: event.step.output,
      }, workspace.path);
    }
  };

  const abortTurn = () => abortController.abort();
  activeTurns.set(runId, { threadId: '', turnId: null, abort: abortTurn });
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
    const agentResult = await runPiAgentTask({
      task: prompt,
      workspacePath: workspace.path,
      sessionId: `socrates-${run.sessionId || run.id}`,
      signal: abortController.signal,
      limits: { maxMemoryMb: limitsFromPolicy(policy).maxMemoryMb },
      provider: piProvider,
      onEvent,
    });
    output = agentResult.output || output;
    const finalStatus: AgentRunStatus = agentResult.status === 'completed'
      ? 'completed'
      : agentResult.status === 'aborted'
        ? 'interrupted'
        : 'failed';
    const finalError = agentResult.error || null;
    const summary = output.trim().slice(0, 12_000) || (finalError ? null : 'The workspace agent completed the task.');
    let artifactsFound: Array<Record<string, unknown>> = [];
    if (finalStatus === 'completed') {
      try { artifactsFound = await collectWorkspaceArtifacts(run, workspace.path); }
      catch (err) { console.warn('[agent-runtime] artifact collection failed:', (err as Error).message); }
    }
    await updateRunStatus(runId, finalStatus, {
      summary,
      error: finalError,
      usage: {},
    });
    await publishAgentEvent(runId, finalStatus === 'completed' ? 'run_completed' : finalStatus === 'interrupted' ? 'run_interrupted' : 'run_failed', {
      status: finalStatus,
      summary,
      error: finalError,
    }, workspace.path);
    return {
      runId,
      status: finalStatus,
      output,
      summary,
      artifacts: artifactsFound,
      workspaceId: workspace.row.id,
      error: finalError,
    };
  } catch (err) {
    const message = safeText((err as Error).message || err, workspace.path);
    await updateRunStatus(runId, 'failed', { error: message, summary: null });
    await publishAgentEvent(runId, 'run_failed', { status: 'failed', error: message }, workspace.path);
    throw err;
  } finally {
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
  const generatedArtifacts = await db.select({
    id: artifacts.id,
    name: artifacts.title,
    type: artifacts.type,
    language: artifacts.language,
    createdAt: artifacts.createdAt,
  }).from(artifacts)
    .where(and(eq(artifacts.agentRunId, run.id), eq(artifacts.userId, userId)))
    .orderBy(asc(artifacts.createdAt));
  return { run, artifacts: generatedArtifacts };
}

/**
 * Continue observing a Codex turn that was intentionally detached from a
 * scheduled request while it waited for approval. Approval itself is a
 * short HTTP transaction; this watcher keeps the underlying turn durable and
 * finalizes the run after the user decides, even when no browser SSE stream
 * is open anymore.
 */

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


export async function interruptAgentRun(userId: string, runId: string) {
  await loadRun(runId, userId);
  const active = activeTurns.get(runId);
  if (!active) {
    await updateRunStatus(runId, 'interrupted', { summary: 'Stopped before the turn started.' });
    return { ok: true, status: 'interrupted' };
  }
  active.abort?.();
  await publishAgentEvent(runId, 'run_interrupted', {});
  return { ok: true, status: 'interrupt_requested' };
}

export async function resumeAgentRun(userId: string, runId: string, task?: string, signal?: AbortSignal) {
  await loadRun(runId, userId);
  return runAgentTurn(runId, userId, task, signal);
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


/**
 * On server restart every in-flight Pi process is gone. Mark unfinished
 * runs explicitly interrupted so the UI offers a resume/retry instead of
 * leaving them pinned in `running`.
 */
export async function recoverAgentRunsOnStartup(): Promise<{ checked: number; recovered: number; disconnected: number }> {
  if (!WORKSPACE_AGENT_ENABLED) return { checked: 0, recovered: 0, disconnected: 0 };
  const db = getDb();
  const rows = await db.select().from(agentRuns)
    .where(inArray(agentRuns.status, ['starting', 'running', 'awaiting_approval']))
    .orderBy(asc(agentRuns.startedAt)).limit(100);
  let recovered = 0;
  let disconnected = 0;
  for (const run of rows) {
    await updateRunStatus(run.id, 'interrupted', {
      error: 'Run was interrupted by a server restart.',
      completedAt: new Date(),
    });
    await publishAgentEvent(run.id, 'run_interrupted', {
      status: 'interrupted',
      reason: 'server_restart',
    }).catch(() => undefined);
    disconnected++;
  }
  return { checked: rows.length, recovered, disconnected };
}
