/**
 * agentStepProjection.ts — Agent runtime events → chat-visible steps.
 *
 * The workspace agent used to appear in chat as a single opaque card: the
 * user saw "working…" and then a summary, with no view of the commands it
 * ran or the files it touched. The agent reports each of those as a
 * thread item, so this module turns the runtime event stream into the small
 * vocabulary the chat UI renders inline:
 *
 *     运行了命令 / 已运行 <command> / 读取了文件 / 编辑了文件 /
 *     搜索了网页 / 调用了 MCP 工具 / 更新了计划
 *
 * It is deliberately a pure function of one event, so both the chat SSE
 * stream and /api/agent-runs/:id/events can project the same way and the
 * mapping can be unit-tested against recorded event fixtures.
 *
 * Redaction note: events published by agentRuntime have already passed
 * through redactForEvent/safeText, so workspace paths appear as
 * `[workspace]` and secrets as `[redacted]`. This module only ever narrows
 * or relabels that data; it never reaches for raw runtime payloads.
 */

/** Chinese step labels, matching the agent step wording. */
export const AGENT_STEP_LABELS = {
  command: '运行了命令',
  commandDone: '已运行',
  read: '读取了文件',
  fileChange: '编辑了文件',
  search: '搜索了网页',
  mcp: '调用了 MCP 工具',
  plan: '更新了计划',
} as const;

export type AgentStepKind = 'command' | 'read' | 'file_change' | 'search' | 'mcp';
export type AgentStepStatus = 'running' | 'done' | 'failed';

export interface AgentStepDiffStat {
  files: number;
  added: number;
  removed: number;
  paths: string[];
}

export interface AgentStep {
  type: 'step';
  /** Agent item id; stable across the started/completed pair. */
  stepId: string;
  kind: AgentStepKind;
  /** Ready-to-render Chinese label. */
  title: string;
  /** Command text, file list, or query shown next to the label. */
  detail: string | null;
  command: string | null;
  status: AgentStepStatus;
  exitCode: number | null;
  durationMs: number | null;
  diffStat: AgentStepDiffStat | null;
  /** Bounded tail of command output, when the agent reported it. */
  output: string | null;
}

export type AgentPlanStepStatus = 'todo' | 'in_progress' | 'done';

export interface AgentPlanUpdate {
  type: 'plan';
  steps: Array<{ title: string; status: AgentPlanStepStatus }>;
  explanation: string | null;
}

export type AgentProjection = AgentStep | AgentPlanUpdate;

const MAX_DETAIL_CHARS = 240;
const MAX_OUTPUT_CHARS = 4000;
const MAX_PLAN_STEPS = 40;

/** Commands that only inspect the workspace get the "读取了文件" label. */
const READ_ONLY_COMMANDS = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'ls', 'tree', 'find', 'stat', 'file',
  'grep', 'rg', 'ag', 'ack', 'sed', 'awk', 'wc', 'diff', 'nl', 'realpath',
  'pwd', 'which', 'type', 'basename', 'dirname', 'readlink',
]);

/** The agent sends a command as argv, a string, or a shell wrapper. */
export function normalizeCommand(command: unknown): string {
  if (Array.isArray(command)) {
    const parts = command.map((part) => String(part ?? '')).filter(Boolean);
    // `bash -lc "…"` / `pwsh -Command "…"` read better as the inner script.
    if (parts.length >= 3 && isShellExecutable(parts[0]) && /^-(l?c|Command)$/i.test(parts[1])) {
      return unwrapShellString(parts.slice(2).join(' ').trim());
    }
    return parts.join(' ').trim();
  }
  if (command && typeof command === 'object') {
    const record = command as Record<string, unknown>;
    if (record.command !== undefined) return normalizeCommand(record.command);
    if (Array.isArray(record.argv)) return normalizeCommand(record.argv);
  }
  /* The agent also reports the already-joined form, e.g.
     `/bin/bash -lc 'cat notes.txt'`. Unwrap it so the label logic sees the
     real command rather than the shell. */
  const text = String(command ?? '').trim();
  const wrapper = text.match(/^(\S+)\s+-(?:l?c|Command)\s+([\s\S]+)$/i);
  if (wrapper && isShellExecutable(wrapper[1])) return unwrapShellString(wrapper[2].trim());
  return text;
}

function isShellExecutable(token: string): boolean {
  const base = (token.split('/').pop() || token).toLowerCase();
  return base === 'sh' || base === 'bash' || base === 'zsh' || base === 'ksh'
    || base === 'dash' || base === 'pwsh' || base === 'powershell' || base === 'powershell.exe';
}

/** Strip one layer of surrounding quotes from a shell -c payload. */
function unwrapShellString(text: string): string {
  const quoted = text.match(/^(['"])([\s\S]*)\1$/);
  if (!quoted) return text;
  const inner = quoted[2];
  // Only unwrap when the quote does not reappear unescaped inside.
  if (inner.includes(quoted[1]) && !inner.includes(`\\${quoted[1]}`)) return text;
  return quoted[1] === '"' ? inner.replace(/\\"/g, '"') : inner;
}

/** First executable token of a command line, lowercased. */
function commandHead(command: string): string {
  const cleaned = command.replace(/^[({\s]+/, '');
  const token = cleaned.split(/[\s|;&]+/).find(Boolean) || '';
  const base = token.split('/').pop() || token;
  return base.toLowerCase();
}

function isReadOnlyCommand(command: string): boolean {
  if (!command) return false;
  /* A pipeline or chain can hide a write, so only classify a single simple
     command as a read. */
  if (/[;&|>]|\$\(|`/.test(command)) return false;
  return READ_ONLY_COMMANDS.has(commandHead(command));
}

function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

function tailOutput(value: unknown): string | null {
  const text = String(value ?? '');
  if (!text) return null;
  return text.length > MAX_OUTPUT_CHARS ? `…${text.slice(-MAX_OUTPUT_CHARS)}` : text;
}

function statusFrom(value: unknown, fallback: AgentStepStatus): AgentStepStatus {
  const status = String(value ?? '').toLowerCase();
  if (status === 'inprogress' || status === 'in_progress' || status === 'running' || status === 'pending') return 'running';
  if (status === 'completed' || status === 'success' || status === 'succeeded' || status === 'done') return 'done';
  if (status === 'failed' || status === 'error' || status === 'declined' || status === 'cancelled' || status === 'aborted') return 'failed';
  return fallback;
}

function changeKind(kind: unknown): string {
  if (typeof kind === 'string') return kind;
  if (kind && typeof kind === 'object') return String((kind as { type?: unknown }).type ?? '');
  return '';
}

/** Count files and diff lines so the step can show `3 files +12 -4`. */
function diffStatFrom(changes: unknown): AgentStepDiffStat | null {
  if (!Array.isArray(changes) || changes.length === 0) return null;
  let added = 0;
  let removed = 0;
  const paths: string[] = [];
  for (const raw of changes.slice(0, 50)) {
    const change = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const path = String(change.path ?? '').trim();
    if (path) paths.push(path);
    const diff = String(change.diff ?? '');
    if (!diff) continue;
    for (const line of diff.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) added += 1;
      else if (line.startsWith('-') && !line.startsWith('---')) removed += 1;
    }
  }
  return { files: Array.isArray(changes) ? changes.length : 0, added, removed, paths };
}

function fileChangeDetail(changes: unknown): string | null {
  const stat = diffStatFrom(changes);
  if (!stat) return null;
  const names = stat.paths.slice(0, 3).map((path) => path.split('/').pop() || path);
  const suffix = stat.files > names.length ? ` 等 ${stat.files} 个文件` : '';
  const counts = stat.added || stat.removed ? `  +${stat.added} -${stat.removed}` : '';
  return truncate(`${names.join(', ')}${suffix}${counts}`, MAX_DETAIL_CHARS);
}

function planStatus(value: unknown): AgentPlanStepStatus {
  const status = String(value ?? '').toLowerCase();
  if (status === 'completed' || status === 'done') return 'done';
  if (status === 'inprogress' || status === 'in_progress' || status === 'active') return 'in_progress';
  return 'todo';
}

function commandStep(
  data: Record<string, unknown>,
  status: AgentStepStatus,
): AgentStep {
  const command = normalizeCommand(data.command);
  const readOnly = isReadOnlyCommand(command);
  const finished = status !== 'running';
  const title = readOnly
    ? AGENT_STEP_LABELS.read
    : finished && command
      ? `${AGENT_STEP_LABELS.commandDone} ${truncate(command, 80)}`
      : AGENT_STEP_LABELS.command;
  return {
    type: 'step',
    stepId: String(data.itemId ?? ''),
    kind: readOnly ? 'read' : 'command',
    title,
    detail: command ? truncate(command, MAX_DETAIL_CHARS) : null,
    command: command || null,
    status,
    exitCode: typeof data.exitCode === 'number' ? data.exitCode : null,
    durationMs: typeof data.durationMs === 'number' ? data.durationMs : null,
    diffStat: null,
    output: tailOutput(data.aggregatedOutput),
  };
}

function baseStep(partial: Partial<AgentStep> & { stepId: string; kind: AgentStepKind; title: string; status: AgentStepStatus }): AgentStep {
  return {
    type: 'step',
    detail: null,
    command: null,
    exitCode: null,
    durationMs: null,
    diffStat: null,
    output: null,
    ...partial,
  };
}

/**
 * Project one Agent Runtime event into a chat step or plan update.
 *
 * Returns null for events the step list should not show: text and reasoning
 * deltas (the chat bubble and thinking pill already render those), lifecycle
 * bookkeeping, approvals (they have their own inline card), and usage.
 */
export function projectAgentEvent(event: {
  event?: string;
  data?: Record<string, unknown> | null;
} | null | undefined): AgentProjection | null {
  if (!event || !event.event) return null;
  const data = (event.data || {}) as Record<string, unknown>;

  if (event.event === 'plan') {
    const rawSteps = Array.isArray(data.plan) ? data.plan : [];
    const steps = rawSteps.slice(0, MAX_PLAN_STEPS).map((raw) => {
      const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      return {
        title: truncate(String(item.step ?? item.title ?? ''), MAX_DETAIL_CHARS),
        status: planStatus(item.status),
      };
    }).filter((step) => step.title.length > 0);
    if (steps.length === 0) return null;
    return {
      type: 'plan',
      steps,
      explanation: data.explanation ? truncate(String(data.explanation), MAX_DETAIL_CHARS) : null,
    };
  }

  if (event.event !== 'tool' && event.event !== 'item_completed') return null;
  const itemType = String(data.type ?? '');
  const stepId = String(data.itemId ?? '');
  if (!stepId) return null;
  const started = event.event === 'tool';
  const status = statusFrom(data.status, started ? 'running' : 'done');

  switch (itemType) {
    case 'commandExecution': {
      const step = commandStep(data, status);
      /* A non-zero exit is a failure even when the runtime only reports
         `completed`, so the step row can show it in the error state. */
      if (!started && typeof step.exitCode === 'number' && step.exitCode !== 0) step.status = 'failed';
      return step;
    }
    case 'fileChange':
      return baseStep({
        stepId,
        kind: 'file_change',
        title: AGENT_STEP_LABELS.fileChange,
        status,
        detail: fileChangeDetail(data.changes),
        diffStat: diffStatFrom(data.changes),
      });
    case 'webSearch':
      return baseStep({
        stepId,
        kind: 'search',
        title: AGENT_STEP_LABELS.search,
        status,
        detail: data.query ? truncate(String(data.query), MAX_DETAIL_CHARS) : null,
      });
    case 'mcpToolCall': {
      const server = String(data.server ?? '').trim();
      const tool = String(data.tool ?? data.name ?? '').trim();
      const label = [server, tool].filter(Boolean).join(' · ');
      return baseStep({
        stepId,
        kind: 'mcp',
        title: AGENT_STEP_LABELS.mcp,
        status,
        detail: label ? truncate(label, MAX_DETAIL_CHARS) : null,
        durationMs: typeof data.durationMs === 'number' ? data.durationMs : null,
      });
    }
    default:
      /* agentMessage, reasoning, plan text items, and anything the agent adds
         later stay out of the step list. */
      return null;
  }
}
