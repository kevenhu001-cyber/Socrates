/* chat/toolRuntime.ts — per-message tool-call orchestration.
 *
 * Owns the stateful part of the tool lifecycle:
 *   tool_call_delta -> tool_use -> tool_progress -> tool_result
 * plus the independent code-execution EventSource. The chat message
 * controller supplies ownership and DOM callbacks; this module never
 * reaches into global chat state directly.
 */

import {
  appendInlineArtifact,
  appendToolModule,
  renderToolTextOutput,
  renderWebSearchResults,
  updateToolCardCode,
} from '../ui/toolCards.js';
import { mountVisualization } from '../render/visualization.js';
import {
  TOOL_RUN_PHASES,
  isTerminalToolPhase,
  phaseFromProgress,
  summarizeToolRuns,
  transitionToolRun,
} from './toolRunState.js';

/* ─── Types ─── */

export interface ToolProgress {
  id: string;
  phase: string;
  elapsedMs?: number;
  chunk?: string;
}

export interface ToolCallDelta {
  id?: string;
  index?: number;
  name?: string;
  arguments?: string;
  final?: boolean;
  /** The raw input/arguments payload from the tool_use SSE event (not the streaming delta). */
  input?: Record<string, unknown> | string | null;
  executionId?: string;
}

export interface ExecutionStartEvent {
  id: string;
  executionId: string;
}

export interface ToolResultBase {
  id: string;
  ok: boolean;
  status?: string;
  output?: string;
  stderr?: string;
  error?: string | null;
  artifacts?: unknown[];
  durationMs?: number;
  executionId?: string;
  name?: string;
  userMessage?: string;
  detail?: string;
  results?: unknown[];
  query?: string;
  visualization?: {
    version: number;
    [key: string]: unknown;
  };
}

export interface ToolResult extends ToolResultBase {
  [key: string]: unknown;
}

export interface ToolCallEntry {
  id: string;
  name: string;
  input: Record<string, unknown> | string | null;
  output: string | null;
  isError: boolean;
  artifacts: ToolArtifact[];
  executionId?: string;
  visualization?: Record<string, unknown>;
  results?: unknown[];
  /** Non-enumerable runtime metadata — does not persist. */
  _run?: ToolRun;
  _pendingDeltas?: ToolCallDelta[];
  _pendingProgress?: ToolProgress[];
  _toolResultApplied?: boolean;
}

export interface ToolArtifact {
  id: string;
  mimeType: string | null;
  name: string | null;
}

export interface ToolRun {
  id: string;
  tool: string;
  phase: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  elapsedMs?: number;
  [k: string]: unknown;
}

interface ToolMessage {
  toolCalls?: ToolCallEntry[];
  _orphanDeltas?: Record<string, ToolCallDelta[]>;
  [key: string]: unknown;
}

interface ExecutionConnection {
  source: EventSource;
  timer: ReturnType<typeof setTimeout>;
}

export interface ToolRuntimeOptions {
  body: HTMLElement;
  stillOwnsSlot?: () => boolean;
  getMessage?: () => ToolMessage | null;
  ensureToolContainer?: () => HTMLElement;
  onToolActivity?: () => void;
  onSearchRetry?: (query: string) => void;
  requestAnimationFrame?: (cb: () => void) => number;
  cancelAnimationFrame?: (id: number) => void;
  EventSource?: typeof EventSource | null;
}

export interface ToolRuntime {
  recordToolUse(call: ToolCallDelta): HTMLElement | null;
  recordToolProgress(progress: ToolProgress): void;
  recordToolCallDelta(delta: ToolCallDelta): void;
  recordExecutionStart(event: ExecutionStartEvent): void;
  recordToolResult(result: ToolResult): void;
  cancel(): void;
  dispose(): void;
}

/* ─── Internal helpers ─── */

function cssEscape(value: unknown): string {
  const str = String(value);
  if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') {
    return CSS.escape(str);
  }
  return str.replace(/[^a-zA-Z0-9_-]/g, (char) => {
    return '\\' + char.charCodeAt(0).toString(16) + ' ';
  });
}

function translate(key: string, fallback: string): string {
  try {
    if (typeof window !== 'undefined' && typeof (window as any).t === 'function') {
      const translated = (window as any).t(key);
      return translated && translated !== key ? translated : fallback;
    }
  } catch (_) { /* ignore */ }
  return fallback;
}

function activeToolLabel(entry: ToolCallEntry | null | undefined): string {
  const name = entry && entry.name;
  if (name === 'web_search' || name === 'arxiv_search' || name === 'zotero_search' || name === 'notion_search_pages') {
    return translate('tool.actionSearch', 'Searching the web');
  }
  if (name === 'code_interpreter' || name === 'Code') return translate('tool.actionAnalyze', 'Analyzing data');
  if (name === 'render_visualization') return translate('tool.actionVisual', 'Creating a visual');
  if (name === 'Read' || name === 'Glob' || name === 'Grep' || name === 'WebFetch') return translate('tool.actionRead', 'Reading files');
  if (name === 'Write' || name === 'Edit' || name === 'Bash') return translate('tool.actionWrite', 'Updating files');
  return translate('tool.actionDefault', 'Using a tool');
}

function findEntry(message: ToolMessage | null | undefined, id: string): ToolCallEntry | null {
  if (!message || !Array.isArray(message.toolCalls)) return null;
  for (let i = 0; i < message.toolCalls.length; i++) {
    if (message.toolCalls[i].id === id) return message.toolCalls[i];
  }
  return null;
}

function normalizeArtifacts(artifacts: unknown): ToolArtifact[] {
  if (!Array.isArray(artifacts)) return [];
  return artifacts.slice(0, 20).map((artifact) => {
    if (typeof artifact === 'string') return { id: artifact, mimeType: null, name: null };
    return {
      id: String((artifact && (artifact as any).id) || ''),
      mimeType: ((artifact && (artifact as any).mimeType) as string | null) || null,
      name: ((artifact && (artifact as any).name) as string | null) || null,
    };
  }).filter((artifact) => !!artifact.id);
}

function getRun(entry: ToolCallEntry | null | undefined): ToolRun | null {
  return entry && entry._run ? entry._run : null;
}

function setRun(entry: ToolCallEntry | null | undefined, phase: string, patch?: Partial<ToolRun>): ToolRun | null {
  if (!entry) return null;
  const next = transitionToolRun(getRun(entry) || {
    id: entry.id,
    tool: entry.name,
    phase: TOOL_RUN_PHASES.preparing,
    startedAt: Date.now(),
  }, phase, patch);
  const run = next as ToolRun;
  if (!Object.prototype.hasOwnProperty.call(entry, '_run')) {
    Object.defineProperty(entry, '_run', { value: run, writable: true, configurable: true, enumerable: false });
  } else {
    entry._run = run;
  }
  return run;
}

/* ─── Factory ─── */

export function createToolRuntime(options?: Partial<ToolRuntimeOptions>): ToolRuntime {
  options = options || {};
  const body = options.body;
  const stillOwnsSlot = options.stillOwnsSlot || (() => true);
  const getMessage = options.getMessage || (() => null);
  const ensureToolContainer = options.ensureToolContainer || (() => body as HTMLElement);
  const onToolActivity = options.onToolActivity || (() => {});
  const onSearchRetry = options.onSearchRetry || ((query: string) => {
    const retryText = '请重试搜索：' + query;
    if (typeof window !== 'undefined' && typeof (window as any).addMessage === 'function') (window as any).addMessage('user', retryText);
    if (typeof window !== 'undefined' && typeof (window as any).askChatTurn === 'function') (window as any).askChatTurn(retryText);
  });
  const requestFrame = options.requestAnimationFrame || ((cb: () => void) => requestAnimationFrame(cb));
  const cancelFrame = options.cancelAnimationFrame || ((id: number) => cancelAnimationFrame(id));
  const EventSourceImpl: typeof EventSource | null = options.EventSource !== undefined
    ? options.EventSource
    : (typeof EventSource !== 'undefined' ? EventSource : null);

  let disposed = false;
  const pendingDeltas: ToolCallDelta[] = [];
  let deltaFrame: number | null = null;
  const executionConnections = new Set<ExecutionConnection>();

  /* ─── Internal ─── */

  function updateRunSummary(message: ToolMessage | null): void {
    if (!body || !message) return;
    const group = body.querySelector('.tool-run-group');
    if (!group) return;
    const runs: ToolRun[] = (message.toolCalls || []).map((entry) => {
      return getRun(entry) || { phase: entry && entry.isError ? TOOL_RUN_PHASES.failed : TOOL_RUN_PHASES.succeeded } as ToolRun;
    });
    const summary = summarizeToolRuns(runs);
    const label = group.querySelector('.tool-run-summary-label') as HTMLElement | null;
    const meta = group.querySelector('.tool-run-summary-meta') as HTMLElement | null;
    if (!label || !meta) return;
    if (summary.active) {
      group.setAttribute('data-state', 'running');
      let activeEntry: ToolCallEntry | null = null;
      for (let i = (message.toolCalls || []).length - 1; i >= 0; i--) {
        const candidate = message.toolCalls![i];
        const run = getRun(candidate);
        if (candidate && (!run || !isTerminalToolPhase(run.phase))) { activeEntry = candidate; break; }
      }
      label.textContent = summary.active === 1
        ? activeToolLabel(activeEntry)
        : translate('tool.groupWorking', 'Working');
      meta.textContent = summary.total > 1 ? summary.active + ' of ' + summary.total + ' tools' : 'Running';
    } else if (summary.failed || summary.timed_out) {
      group.setAttribute('data-state', 'error');
      label.textContent = translate('tool.groupNeedsAttention', 'Tool needs attention');
      meta.textContent = (summary.failed + summary.timed_out) + ' of ' + summary.total + ' failed';
    } else if (summary.cancelled) {
      group.setAttribute('data-state', 'cancelled');
      label.textContent = translate('tool.groupStopped', 'Tool run stopped');
      meta.textContent = summary.total + ' tool' + (summary.total === 1 ? '' : 's');
    } else {
      group.setAttribute('data-state', 'complete');
      label.textContent = translate('tool.groupComplete', 'Used tools');
      meta.textContent = summary.total + ' tool' + (summary.total === 1 ? '' : 's');
    }
  }

  function activeMessage(): ToolMessage | null {
    if (disposed || !stillOwnsSlot()) return null;
    return getMessage() || null;
  }

  function findCard(id: string): HTMLElement | null {
    if (!body || !id) return null;
    return body.querySelector('[data-tcid="' + cssEscape(id) + '"]');
  }

  function renderProgress(progress: ToolProgress, skipQueuedDrain?: boolean): void {
    const message = activeMessage();
    if (!message || !progress || !progress.id) return;
    const entry = findEntry(message, progress.id);
    if (!entry) return;
    setRun(entry, phaseFromProgress(progress), { elapsedMs: progress.elapsedMs || 0 });
    updateRunSummary(message);
    const card = findCard(progress.id);
    if (!card) {
      entry._pendingProgress = entry._pendingProgress || [];
      entry._pendingProgress.push(progress);
      return;
    }

    if (!skipQueuedDrain && entry._pendingProgress && entry._pendingProgress.length) {
      const queued = entry._pendingProgress.splice(0);
      for (let i = 0; i < queued.length; i++) renderProgress(queued[i], true);
    }

    const out = card.querySelector('.agent-tool-out') as HTMLElement | null;
    if (!out) return;
    let live = out.querySelector('.agent-tool-progress') as HTMLElement | null;
    if (!live && progress.phase !== 'timeout_warning' && progress.phase !== 'completed' && progress.phase !== 'failed' && progress.phase !== 'queued') {
      live = document.createElement('div');
      live.className = 'agent-tool-progress';
      const outputText = out.querySelector('.agent-tool-output-text');
      if (outputText) out.insertBefore(live, outputText); else out.appendChild(live);
      live.innerHTML = '<span class="agent-tool-progress-badge"></span><pre class="agent-tool-stream"></pre>';
    }

    const badge = live && live.querySelector('.agent-tool-progress-badge') as HTMLElement | null;
    const stream = live && live.querySelector('.agent-tool-stream') as HTMLElement | null;
    let phaseLabel = '[Running]';
    if (progress.phase === 'queued') phaseLabel = '[Queued]';
    else if (progress.phase === 'ready') phaseLabel = '[Booting]';
    else if (progress.phase === 'stderr') phaseLabel = '[Stderr]';
    else if (progress.phase === 'timeout_warning') phaseLabel = '[Timeout at]';
    else if (progress.phase === 'skipped') phaseLabel = '[Skipped]';
    const elapsed = ((progress.elapsedMs || 0) / 1000).toFixed(1);
    if (badge) badge.textContent = phaseLabel + ' · ' + elapsed + 's';
    const headerStatus = card.querySelector('.agent-tool-status') as HTMLElement | null;
    if (headerStatus) {
      headerStatus.className = 'agent-tool-status' + (progress.phase === 'timeout_warning' ? ' warn' : ' mute');
      headerStatus.textContent = phaseLabel.replace(/^\[|\]$/g, '') + ' ' + elapsed + 's';
    }
    if (progress.phase === 'timeout_warning' && progress.chunk) {
      if (stream) {
        stream.textContent += '\n[' + progress.chunk + ']\n';
        stream.scrollTop = stream.scrollHeight;
      }
      card.style.borderColor = 'hsl(35 80% 50%)';
      return;
    }
    if (stream && progress.chunk) {
      stream.textContent! += progress.chunk;
      if (stream.textContent!.length > 51200) {
        stream.textContent = '[…truncated…]\n' + stream.textContent!.slice(-51200);
      }
      stream.scrollTop = stream.scrollHeight;
    }
  }

  function flushDeltas(): void {
    deltaFrame = null;
    const message = activeMessage();
    if (!message || !pendingDeltas.length) return;
    const latest = new Map<string, ToolCallDelta>();
    for (let i = 0; i < pendingDeltas.length; i++) {
      const delta = pendingDeltas[i];
      if (!delta) continue;
      latest.set((delta.id || '?') + ':' + (delta.index || 0), delta);
    }
    pendingDeltas.length = 0;

    const matchedIds = new Set<string>();
    const cards = (body as HTMLElement).querySelectorAll('.agent-tool-card[data-tcid]');
    for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
      const card = cards[cardIndex] as HTMLElement;
      const toolCallId = card.getAttribute('data-tcid')!;
      let found: ToolCallDelta | undefined;
      latest.forEach((candidate) => {
        if (!found && candidate && candidate.id === toolCallId) found = candidate;
      });
      if (!found) continue;
      matchedIds.add(found.id!);
      try { updateToolCardCode(toolCallId, found.arguments || '', found.name || ''); } catch (_) { /* ignore */ }
      if (found.final) {
        const code = card.querySelector('.agent-tool-code') as HTMLElement | null;
        if (code) code.classList.remove('agent-tool-code-streaming');
      }
    }

    latest.forEach((delta) => {
      if (!delta || !delta.id || matchedIds.has(delta.id)) return;
      const entry = findEntry(message, delta.id);
      if (entry) {
        entry._pendingDeltas = entry._pendingDeltas || [];
        entry._pendingDeltas.push(delta);
        return;
      }
      if (!message._orphanDeltas || typeof message._orphanDeltas !== 'object' || Array.isArray(message._orphanDeltas)) {
        message._orphanDeltas = {};
      }
      if (!message._orphanDeltas[delta.id]) message._orphanDeltas[delta.id] = [];
      message._orphanDeltas[delta.id].push(delta);
    });
  }

  function closeConnection(connection: ExecutionConnection): void {
    if (!connection) return;
    clearTimeout(connection.timer);
    try { connection.source.close(); } catch (_) { /* ignore */ }
    executionConnections.delete(connection);
  }

  function connectExecution(executionId: string, toolCallId: string): void {
    if (!executionId || !toolCallId || disposed || !EventSourceImpl) return;
    try {
      const source = new EventSourceImpl('/api/executions/' + encodeURIComponent(executionId) + '/stream');
      const connection: ExecutionConnection = { source, timer: null as any };
      executionConnections.add(connection);
      connection.timer = setTimeout(() => {
        if (!disposed) {
          recordToolResult({
            id: toolCallId,
            ok: false,
            status: 'failed',
            output: '',
            stderr: '',
            error: 'execution_sse_timeout: backend did not respond within 60s',
            artifacts: [],
            durationMs: 60000,
            executionId: executionId,
            name: 'code_interpreter',
          });
        }
        closeConnection(connection);
      }, 60000);
      source.addEventListener('progress', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as ToolProgress;
          data.id = toolCallId;
          renderProgress(data);
        } catch (_) { /* ignore */ }
      });
      source.addEventListener('result', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          recordToolResult({
            id: toolCallId,
            ok: data.status === 'completed',
            status: data.status,
            output: data.stdout || '(no output)',
            stderr: data.stderr || '',
            error: data.status !== 'completed' ? (data.errorMessage || data.status) : null,
            artifacts: data.artifactFileIds || [],
            durationMs: data.durationMs || 0,
            executionId: executionId,
            name: 'code_interpreter',
          });
        } catch (_) { /* ignore */ }
        closeConnection(connection);
      });
      source.addEventListener('error', (event: MessageEvent) => {
        try {
          const data = event.data ? JSON.parse(event.data) : null;
          if (data && data.error) {
            recordToolResult({ id: toolCallId, ok: false, status: 'failed', output: '', error: data.error, artifacts: [] });
          }
        } catch (_) { /* ignore */ }
        closeConnection(connection);
      });
    } catch (_) {
      console.log('[execution-sse] failed');
    }
  }

  /* ─── Public API ─── */

  function recordToolUse(call: ToolCallDelta): HTMLElement | null {
    const message = activeMessage();
    if (!message || !call || !call.name) return null;
    onToolActivity();
    const entry: ToolCallEntry = {
      id: String(call.id || ('tc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))),
      name: String(call.name),
      input: call.input == null ? null : call.input as Record<string, unknown>,
      output: null,
      isError: false,
      artifacts: [],
    };
    setRun(entry, TOOL_RUN_PHASES.preparing);

    if (pendingDeltas.length) {
      const kept: ToolCallDelta[] = [];
      for (let i = 0; i < pendingDeltas.length; i++) {
        const delta = pendingDeltas[i];
        if (delta && delta.id === entry.id) {
          entry._pendingDeltas = entry._pendingDeltas || [];
          entry._pendingDeltas.push(delta);
        } else {
          kept.push(delta);
        }
      }
      pendingDeltas.length = 0;
      for (let i = 0; i < kept.length; i++) pendingDeltas.push(kept[i]);
      if (entry._pendingDeltas && entry._pendingDeltas.length) {
        const latest = entry._pendingDeltas[entry._pendingDeltas.length - 1];
        if (latest && latest.arguments) {
          if (!entry.input || typeof entry.input !== 'object') entry.input = {};
          (entry.input as Record<string, unknown>).__raw = latest.arguments;
        }
      }
    }

    if (!Array.isArray(message.toolCalls)) message.toolCalls = [];
    message.toolCalls.push(entry);
    const output = appendToolModule(entry.name, entry.input || {}, ensureToolContainer()) as HTMLElement | null;
    if (!output) return null;
    const card = output.closest('.agent-tool-card') as HTMLElement | null;
    if (card) card.setAttribute('data-tcid', entry.id);

    const orphanDeltas = message._orphanDeltas && message._orphanDeltas[entry.id];
    if (orphanDeltas) delete message._orphanDeltas![entry.id];
    if (Array.isArray(orphanDeltas) && orphanDeltas.length) {
      entry._pendingDeltas = entry._pendingDeltas || [];
      entry._pendingDeltas.push.apply(entry._pendingDeltas, orphanDeltas);
    }
    if (entry._pendingDeltas && entry._pendingDeltas.length) {
      const queuedDeltas = entry._pendingDeltas.splice(0);
      for (let deltaIndex = 0; deltaIndex < queuedDeltas.length; deltaIndex++) {
        try { updateToolCardCode(entry.id, queuedDeltas[deltaIndex].arguments || '', queuedDeltas[deltaIndex].name || ''); } catch (_) { /* ignore */ }
      }
    }
    if (entry._pendingProgress && entry._pendingProgress.length) {
      const queuedProgress = entry._pendingProgress.splice(0);
      for (let progressIndex = 0; progressIndex < queuedProgress.length; progressIndex++) renderProgress(queuedProgress[progressIndex], true);
    }
    if (call.name === 'code_interpreter' && (call as any).executionId) {
      entry.executionId = (call as any).executionId;
      connectExecution((call as any).executionId, entry.id);
    }
    updateRunSummary(message);
    return output;
  }

  function recordToolProgress(progress: ToolProgress): void {
    if (!activeMessage()) return;
    renderProgress(progress);
  }

  function recordToolCallDelta(delta: ToolCallDelta): void {
    if (!activeMessage() || !delta) return;
    pendingDeltas.push(delta);
    if (deltaFrame == null) deltaFrame = requestFrame(flushDeltas);
  }

  function recordExecutionStart(event: ExecutionStartEvent): void {
    const message = activeMessage();
    if (!message || !event || !event.executionId || !event.id) return;
    const entry = findEntry(message, event.id);
    if (entry) {
      entry.executionId = event.executionId;
      setRun(entry, TOOL_RUN_PHASES.running);
      updateRunSummary(message);
    }
    connectExecution(event.executionId, event.id);
  }

  function recordToolResult(result: ToolResult): void {
    const message = activeMessage();
    if (!message || !result || !result.id) return;
    let output: HTMLElement | null = null;
    let entry = findEntry(message, result.id);
    if (!entry) {
      entry = { id: String(result.id), name: result.name || 'tool', input: null, output: null, isError: false, artifacts: [] };
      if (!Array.isArray(message.toolCalls)) message.toolCalls = [];
      message.toolCalls.push(entry);
      setRun(entry, TOOL_RUN_PHASES.preparing);
      output = appendToolModule(entry.name, {}, ensureToolContainer()) as HTMLElement | null;
      const syntheticCard = output && output.closest('.agent-tool-card') as HTMLElement | null;
      if (syntheticCard) syntheticCard.setAttribute('data-tcid', entry.id);
    } else {
      const card = findCard(entry.id);
      if (card) output = card.querySelector('.agent-tool-out') as HTMLElement | null;
    }

    if (getRun(entry) && isTerminalToolPhase(getRun(entry)!.phase) && entry._toolResultApplied) return;

    if (result.executionId && !entry.executionId) {
      entry.executionId = result.executionId;
      connectExecution(result.executionId, result.id);
    }
    if (entry._pendingProgress && entry._pendingProgress.length) {
      const queuedProgress = entry._pendingProgress.splice(0);
      for (let progressIndex = 0; progressIndex < queuedProgress.length; progressIndex++) renderProgress(queuedProgress[progressIndex], true);
    }

    let statusText = '';
    let statusClass = '';
    const duration = result.durationMs != null ? ' [' + (result.durationMs / 1000).toFixed(1) + 's]' : '';
    let display = '';
    if (result.ok === false) {
      if (result.status === 'timeout') {
        statusText = translate('tool.statusTimeout', 'Timeout');
        statusClass = 'warn';
      } else {
        statusText = translate('tool.statusFailed', 'Failed');
        statusClass = 'err';
      }
      const errorMessage = result.userMessage || result.error || result.output || 'failed';
      display = errorMessage + duration;
      if ((result.name || entry.name) === 'code_interpreter') {
        const stderr = String(result.stderr || '') + String(errorMessage || '');
        if (/SyntaxError|IndentationError/i.test(stderr)) {
          display += '\n\nHint: Python refused to parse the source — fix the syntax / indentation in the same run, no need to retry the whole flow.';
        } else if (/ModuleNotFoundError/i.test(stderr)) {
          display += "\n\nHint: Pyodide ships numpy, pandas, and matplotlib pre-installed. For other packages, install them in the run with `import micropip; micropip.install('pkg')`.";
        } else if (/FileNotFoundError|No such file or directory/i.test(stderr)) {
          display += "\n\nHint: the scratch dir is session-scoped and persists across every code call in this conversation. Each run prints a `[scratch]` header listing the files currently in /artifacts — read it before guessing a path. If the file you want really isn't there, write it yourself in the same run (e.g. decode a base64 payload, or generate the data inline) instead of asking the user to attach it.";
        } else if (/PermissionError|IsADirectoryError|NotADirectoryError/i.test(stderr)) {
          display += '\n\nHint: the path is a directory or not writable. Write to a fresh filename inside /artifacts.';
        } else if (/NameError/i.test(stderr)) {
          display += '\n\nHint: a variable / function name is not defined. Either import it (e.g. `import json`) or define it earlier in the same run. Pyodide globals DO NOT persist across separate code_interpreter calls — re-import or recompute any state you need.';
        } else if (/TypeError/i.test(stderr)) {
          display += '\n\nHint: a value was passed to an operation with the wrong type. Check the call signature (e.g. str vs int, list vs dict) before retrying.';
        } else if (/ValueError/i.test(stderr)) {
          display += '\n\nHint: the value passed to a function is the right type but out of range or the wrong shape (e.g. math.sqrt(-1), int("abc"), unpacking mismatch). Validate the input first.';
        } else if (/IndexError/i.test(stderr)) {
          display += '\n\nHint: list/sequence index is out of range. Guard with `if i < len(xs):` or use a try/except before retrying.';
        } else if (/KeyError/i.test(stderr)) {
          display += '\n\nHint: dict lookup failed. Use `.get(key, default)` or `if key in d:` before indexing.';
        } else if (/ZeroDivisionError/i.test(stderr)) {
          display += '\n\nHint: division by zero. Add a guard for the denominator or skip the case explicitly.';
        }
      }
    } else {
      statusText = translate('tool.statusDone', 'Done');
      statusClass = 'ok';
      display = (result.output || '(no output)') + (result.stderr ? '\n[stderr]\n' + result.stderr : '') + duration;
    }

    const terminalPhase = result.ok === false
      ? (result.status === 'timeout' ? TOOL_RUN_PHASES.timed_out : TOOL_RUN_PHASES.failed)
      : TOOL_RUN_PHASES.succeeded;
    setRun(entry, terminalPhase, { endedAt: Date.now(), durationMs: result.durationMs || 0 });
    entry.output = display;
    entry.isError = result.ok === false;
    entry.results = Array.isArray(result.results) ? result.results.slice(0, 20) : [];
    if (result.visualization && result.visualization.version === 1) {
      entry.input = result.visualization as Record<string, unknown>;
      entry.visualization = result.visualization;
    }
    if (Array.isArray(result.artifacts)) entry.artifacts = normalizeArtifacts(result.artifacts);
    if (entry.artifacts && entry.artifacts.length) {
      const artifactLines: string[] = ['[artifacts]'];
      for (let aIdx = 0; aIdx < entry.artifacts.length; aIdx++) {
        const a = entry.artifacts[aIdx];
        const aName = a.name || a.id || 'artifact';
        const aMime = a.mimeType || 'application/octet-stream';
        artifactLines.push('- ' + aName + ' (' + aMime + ', id=' + a.id + ')');
      }
      entry.output = entry.output ? entry.output + '\n\n' + artifactLines.join('\n') : artifactLines.join('\n');
    }
    updateRunSummary(message);
    if (!output || entry._toolResultApplied) return;
    entry._toolResultApplied = true;
    const liveProgress = output.querySelector('.agent-tool-progress') as HTMLElement | null;
    if (liveProgress) liveProgress.remove();
    const toolName = entry.name || result.name || '';
    if (toolName === 'render_visualization' && result.visualization && !entry.isError) {
      mountVisualization(result.visualization, body, { toolCallId: entry.id });
    }
    let rich = false;
    if (toolName === 'web_search' && Array.isArray(result.results) && result.results.length) {
      rich = renderWebSearchResults(output, result.results, (entry.input && (entry.input as any).query) || result.query || '');
    }
    if (!rich) renderToolTextOutput(output, display || '', { isError: entry.isError, kind: entry.isError ? 'error' : 'output' });

    if (entry.isError && result.detail) {
      const details = document.createElement('details');
      details.className = 'agent-tool-error-detail';
      const summary = document.createElement('summary');
      summary.textContent = '查看技术详情';
      const code = document.createElement('code');
      code.textContent = typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail);
      details.appendChild(summary);
      details.appendChild(code);
      output.appendChild(details);
    }
    const resultCard = output.closest('.agent-tool-card') as HTMLElement | null;
    if (resultCard) {
      resultCard.dataset.toolState = entry.isError ? 'error' : 'complete';
      resultCard.style.borderColor = '';
      const badge = resultCard.querySelector('.agent-tool-status') as HTMLElement | null;
      if (badge) {
        badge.className = 'agent-tool-status ' + statusClass;
        badge.textContent = statusText + (result.durationMs != null ? ' ' + (result.durationMs / 1000).toFixed(1) + 's' : '');
      }
    }
    for (let artifactIndex = 0; artifactIndex < entry.artifacts.length; artifactIndex++) {
      const artifact = entry.artifacts[artifactIndex];
      if (artifact.id && artifact.mimeType && artifact.mimeType.indexOf('image/') === 0) {
        appendInlineArtifact(artifact.id, artifact.mimeType, body, artifact.name || undefined);
      } else if (artifact.id) {
        appendInlineArtifact(artifact.id, artifact.mimeType, output, artifact.name || undefined);
      }
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    pendingDeltas.length = 0;
    if (deltaFrame != null) {
      cancelFrame(deltaFrame);
      deltaFrame = null;
    }
    executionConnections.forEach(closeConnection);
    executionConnections.clear();
  }

  function cancel(): void {
    const message = stillOwnsSlot() ? getMessage() : null;
    if (message && Array.isArray(message.toolCalls)) {
      for (let i = 0; i < message.toolCalls.length; i++) {
        const entry = message.toolCalls[i];
        if (!entry || (getRun(entry) && isTerminalToolPhase(getRun(entry)!.phase))) continue;
        setRun(entry, TOOL_RUN_PHASES.cancelled, { endedAt: Date.now() });
        const card = findCard(entry.id);
        if (card) {
          card.dataset.toolState = 'cancelled';
          const badge = card.querySelector('.agent-tool-status') as HTMLElement | null;
          if (badge) { badge.className = 'agent-tool-status mute'; badge.textContent = translate('tool.statusStopped', 'Stopped'); }
        }
      }
      updateRunSummary(message);
    }
    dispose();
  }

  return {
    recordToolUse,
    recordToolProgress,
    recordToolCallDelta,
    recordExecutionStart,
    recordToolResult,
    cancel,
    dispose,
  };
}
