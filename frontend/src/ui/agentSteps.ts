/**
 * ui/agentSteps.ts — Codex agent activity rendered as inline chat steps.
 *
 * The workspace agent used to be one opaque row: "Working in the Codex
 * workspace…" followed by a summary. The server now projects each Codex
 * thread item into a step (services/agentStepProjection.ts), and this module
 * renders those steps the way the Codex interface does:
 *
 *     用时 1h 39m 2s  ⌄
 *     ⊡ 读取了文件      cat notes.txt
 *     ⊡ 已运行 npm test  npm run test:unit            1.2s
 *     ✎ 编辑了文件      main.js  +12 -4
 *     ☑ 更新了计划
 *
 * Design constraints that shape the markup:
 *   - `<details>`/`<summary>` provides expansion natively, so a row keeps
 *     working after finish() serializes the bubble with outerHTML — no JS
 *     re-wiring, mirroring ui/toolInline.ts.
 *   - Chinese labels are the baseline (they match the reference interface);
 *     an English locale overrides them through the i18n dictionary.
 *   - Everything is written with textContent, so command output and file
 *     paths from an untrusted workspace can never inject markup.
 */

import { agentStepIcon } from './icons/toolIcons.js';

export interface AgentStepData {
  stepId: string;
  kind: 'command' | 'read' | 'file_change' | 'search' | 'mcp';
  title?: string | null;
  detail?: string | null;
  command?: string | null;
  status: 'running' | 'done' | 'failed';
  exitCode?: number | null;
  durationMs?: number | null;
  diffStat?: { files: number; added: number; removed: number; paths: string[] } | null;
  output?: string | null;
}

export interface AgentPlanData {
  steps: Array<{ title: string; status: 'todo' | 'in_progress' | 'done' }>;
  explanation?: string | null;
}

const MAX_COMMAND_CHARS = 96;
const MAX_OUTPUT_CHARS = 4000;

/* Chinese baseline copy, matching the Codex interface wording. */
const LABELS = {
  command: { key: 'agent.stepCommand', text: '运行了命令' },
  commandDone: { key: 'agent.stepCommandDone', text: '已运行' },
  read: { key: 'agent.stepRead', text: '读取了文件' },
  file_change: { key: 'agent.stepFileChange', text: '编辑了文件' },
  search: { key: 'agent.stepSearch', text: '搜索了网页' },
  mcp: { key: 'agent.stepMcp', text: '调用了 MCP 工具' },
  plan: { key: 'agent.stepPlan', text: '更新了计划' },
  elapsed: { key: 'agent.elapsed', text: '用时' },
  output: { key: 'agent.stepOutput', text: '输出' },
  failed: { key: 'agent.stepFailed', text: '失败' },
} as const;

function translate(entry: { key: string; text: string }): string {
  try {
    const w = window as unknown as Record<string, unknown>;
    if (typeof w.t === 'function') {
      const value = (w.t as (key: string) => string)(entry.key);
      if (value && value !== entry.key) return value;
    }
  } catch (_) { /* fall through to the Chinese baseline */ }
  return entry.text;
}

function truncate(text: string, max: number): string {
  const collapsed = String(text || '').replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

/** `用时 1h 39m 2s` — hours and minutes only appear when non-zero. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(Number(ms) || 0) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (hours || minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return `${translate(LABELS.elapsed)} ${parts.join(' ')}`;
}

/** Duration badge for one step: `1.2s`, or `45s` once past a minute. */
function stepDuration(durationMs?: number | null): string {
  if (durationMs == null || !(durationMs > 0)) return '';
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * The label shown for a step.
 *
 * A finished command reads `已运行 <command>` (the reference interface shows
 * the command inline once it has run); everything else uses its kind label.
 * The server sends the same Chinese text in `title`, which is used verbatim
 * when the client has no dictionary entry to override it.
 */
export function agentStepLabel(step: AgentStepData): string {
  if (step.kind === 'command' && step.status !== 'running' && step.command) {
    return `${translate(LABELS.commandDone)} ${truncate(step.command, MAX_COMMAND_CHARS)}`;
  }
  const label = LABELS[step.kind as keyof typeof LABELS] as { key: string; text: string } | undefined;
  if (label) return translate(label);
  return String(step.title || '').trim() || translate(LABELS.command);
}

function diffStatText(step: AgentStepData): string {
  const stat = step.diffStat;
  if (!stat) return '';
  const files = stat.files > 1 ? `${stat.files} files` : '';
  const counts = stat.added || stat.removed ? `+${stat.added} -${stat.removed}` : '';
  return [files, counts].filter(Boolean).join('  ');
}

/** File names touched by a change step, without the diff counts. */
function fileNames(step: AgentStepData): string {
  const paths = step.diffStat && Array.isArray(step.diffStat.paths) ? step.diffStat.paths : [];
  if (paths.length === 0) return '';
  const names = paths.slice(0, 3).map((path) => path.split('/').pop() || path);
  const extra = paths.length > names.length ? `, +${paths.length - names.length}` : '';
  return `${names.join(', ')}${extra}`;
}

/** Find the steps container inside `host`, creating the shell when absent. */
export function ensureAgentRunSection(host: HTMLElement, runId?: string | null): HTMLElement {
  const existing = host.querySelector(
    runId ? `.agent-run[data-run-id="${cssEscape(String(runId))}"]` : '.agent-run',
  ) as HTMLElement | null;
  if (existing) return existing;

  const section = document.createElement('section');
  section.className = 'agent-run';
  section.dataset.state = 'running';
  if (runId) section.dataset.runId = String(runId);
  section.dataset.startedAt = String(Date.now());

  const summary = document.createElement('details');
  summary.className = 'agent-run-shell';
  summary.open = true;
  const head = document.createElement('summary');
  head.className = 'agent-run-summary';
  const elapsed = document.createElement('span');
  elapsed.className = 'agent-run-elapsed';
  elapsed.textContent = formatElapsed(0);
  const chevron = document.createElement('span');
  chevron.className = 'agent-run-chev';
  chevron.setAttribute('aria-hidden', 'true');
  head.appendChild(elapsed);
  head.appendChild(chevron);
  const list = document.createElement('div');
  list.className = 'agent-run-steps';
  summary.appendChild(head);
  summary.appendChild(list);
  section.appendChild(summary);
  host.appendChild(section);
  registerRunTimer(section);
  return section;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `);
}

function stepsHost(section: HTMLElement): HTMLElement {
  const list = section.querySelector('.agent-run-steps') as HTMLElement | null;
  return list || section;
}

/**
 * Create or update one step row, keyed by `stepId`.
 *
 * Codex reports every item twice (started, then completed), so this is an
 * upsert: the running row is created on the first event and settled in place
 * by the second, which keeps the reading order stable.
 */
export function upsertAgentStep(
  host: HTMLElement,
  step: AgentStepData,
  runId?: string | null,
): HTMLElement | null {
  if (!host || !step || !step.stepId) return null;
  const section = ensureAgentRunSection(host, runId);
  const list = stepsHost(section);
  const selector = `.agent-step[data-step-id="${cssEscape(String(step.stepId))}"]`;
  let row = list.querySelector(selector) as HTMLElement | null;
  if (!row) {
    row = document.createElement('details');
    row.className = 'agent-step';
    row.dataset.stepId = String(step.stepId);
    row.innerHTML = '<summary class="agent-step-head">'
      + '<span class="agent-step-icon" aria-hidden="true"></span>'
      + '<span class="agent-step-label"></span>'
      + '<code class="agent-step-cmd"></code>'
      + '<span class="agent-step-meta"></span>'
      + '</summary>'
      + '<div class="agent-step-body"></div>';
    list.appendChild(row);
  }

  row.dataset.kind = step.kind;
  row.dataset.state = step.status;
  const icon = row.querySelector('.agent-step-icon') as HTMLElement | null;
  if (icon) icon.innerHTML = agentStepIcon(step.kind);
  const label = row.querySelector('.agent-step-label') as HTMLElement | null;
  if (label) {
    label.textContent = agentStepLabel(step);
    label.classList.toggle('shimmer-text', step.status === 'running');
  }
  const command = row.querySelector('.agent-step-cmd') as HTMLElement | null;
  if (command) {
    /* A finished command already names itself in the label, so the inline
       code slot carries the detail instead (query, file list, MCP tool).
       For a file change the diff counts live in the meta column, so the
       excerpt shows only the paths and never repeats them. */
    const inline = step.kind === 'command' && step.status !== 'running'
      ? ''
      : truncate(fileNames(step) || step.detail || step.command || '', MAX_COMMAND_CHARS);
    command.textContent = inline;
    command.hidden = !inline;
  }
  const meta = row.querySelector('.agent-step-meta') as HTMLElement | null;
  if (meta) {
    const bits = [diffStatText(step), stepDuration(step.durationMs)].filter(Boolean);
    if (step.status === 'failed') {
      bits.push(step.exitCode != null ? `exit ${step.exitCode}` : translate(LABELS.failed));
    }
    meta.textContent = bits.join('  ·  ');
  }
  renderStepBody(row, step);
  return row;
}

function renderStepBody(row: HTMLElement, step: AgentStepData): void {
  const body = row.querySelector('.agent-step-body') as HTMLElement | null;
  if (!body) return;
  const sections: HTMLElement[] = [];

  if (step.command) {
    const pre = document.createElement('pre');
    pre.className = 'agent-step-pre';
    pre.dataset.kind = 'command';
    pre.textContent = step.command;
    sections.push(pre);
  }
  if (step.diffStat && step.diffStat.paths.length) {
    const paths = document.createElement('ul');
    paths.className = 'agent-step-paths';
    for (const path of step.diffStat.paths.slice(0, 20)) {
      const item = document.createElement('li');
      item.textContent = path;
      paths.appendChild(item);
    }
    sections.push(paths);
  }
  if (step.output) {
    const pre = document.createElement('pre');
    pre.className = 'agent-step-pre';
    pre.dataset.kind = 'output';
    const text = String(step.output);
    pre.textContent = text.length > MAX_OUTPUT_CHARS ? `…${text.slice(-MAX_OUTPUT_CHARS)}` : text;
    sections.push(pre);
  }
  body.replaceChildren(...sections);
  /* A row with nothing to reveal must not offer a disclosure triangle. */
  row.classList.toggle('is-flat', sections.length === 0);
}

/**
 * Create or update the plan checklist for a run.
 *
 * Codex re-sends its whole todo list on every change, so the card is
 * rewritten in place instead of appending a new one per update.
 */
export function upsertAgentPlan(
  host: HTMLElement,
  plan: AgentPlanData,
  runId?: string | null,
): HTMLElement | null {
  if (!host || !plan || !Array.isArray(plan.steps) || plan.steps.length === 0) return null;
  const section = ensureAgentRunSection(host, runId);
  const list = stepsHost(section);
  let card = list.querySelector('.agent-plan') as HTMLElement | null;
  if (!card) {
    card = document.createElement('section');
    card.className = 'agent-plan';
    card.innerHTML = '<div class="agent-plan-head">'
      + '<span class="agent-plan-icon" aria-hidden="true"></span>'
      + '<span class="agent-plan-title"></span>'
      + '</div>'
      + '<ol class="agent-plan-list"></ol>'
      + '<p class="agent-plan-note" hidden></p>';
    const icon = card.querySelector('.agent-plan-icon') as HTMLElement | null;
    if (icon) icon.innerHTML = agentStepIcon('plan');
    const title = card.querySelector('.agent-plan-title') as HTMLElement | null;
    if (title) title.textContent = translate(LABELS.plan);
    /* The plan belongs at the top of the run: it is the agent's intent, and
       the steps below are how it carried it out. */
    list.insertBefore(card, list.firstChild);
  }

  const items = card.querySelector('.agent-plan-list') as HTMLElement | null;
  if (items) {
    const rows = plan.steps.slice(0, 40).map((step) => {
      const item = document.createElement('li');
      item.className = 'agent-plan-item';
      item.dataset.status = step.status;
      const mark = document.createElement('span');
      mark.className = 'agent-plan-mark';
      mark.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.className = 'agent-plan-text';
      text.textContent = step.title;
      item.appendChild(mark);
      item.appendChild(text);
      return item;
    });
    items.replaceChildren(...rows);
  }
  const note = card.querySelector('.agent-plan-note') as HTMLElement | null;
  if (note) {
    note.textContent = plan.explanation ? String(plan.explanation) : '';
    note.hidden = !plan.explanation;
  }
  const done = plan.steps.filter((step) => step.status === 'done').length;
  card.dataset.progress = `${done}/${plan.steps.length}`;
  return card;
}

/** Mark the run finished and latch its total duration. */
export function settleAgentRun(
  host: HTMLElement,
  options: { runId?: string | null; state?: 'done' | 'failed' | 'cancelled'; durationMs?: number | null } = {},
): void {
  if (!host) return;
  const section = (options.runId
    ? host.querySelector(`.agent-run[data-run-id="${cssEscape(String(options.runId))}"]`)
    : host.querySelector('.agent-run')) as HTMLElement | null;
  if (!section) return;
  section.dataset.state = options.state || 'done';
  const startedAt = Number(section.dataset.startedAt) || Date.now();
  const durationMs = options.durationMs != null && options.durationMs > 0
    ? options.durationMs
    : Date.now() - startedAt;
  section.dataset.durationMs = String(Math.round(durationMs));
  writeElapsed(section, durationMs);
  /* Still-running rows cannot resolve on their own once the run is over. */
  section.querySelectorAll('.agent-step[data-state="running"]').forEach((row) => {
    (row as HTMLElement).dataset.state = options.state === 'failed' ? 'failed' : 'done';
    const label = row.querySelector('.agent-step-label');
    if (label) label.classList.remove('shimmer-text');
  });
  unregisterRunTimer(section);
  /* The run stays expanded: the step list is the record of what the agent
     did, and the reference interface keeps it visible next to the total
     duration. The summary row remains the affordance for collapsing it. */
}

function writeElapsed(section: HTMLElement, ms: number): void {
  const elapsed = section.querySelector('.agent-run-elapsed');
  if (elapsed) elapsed.textContent = formatElapsed(ms);
}

/* ── Shared elapsed timer ──────────────────────────────────────────
   One interval drives every running run section, mirroring the shared
   timers in toolInline.ts / toolCards.js. It stops as soon as no run is
   live, so an idle transcript carries no timer. */
const RUNNING_RUNS = new Set<HTMLElement>();
let RUN_TIMER: ReturnType<typeof setInterval> | null = null;
const RUN_TICK_MS = 1000;

function tickRuns(): void {
  const now = Date.now();
  RUNNING_RUNS.forEach((section) => {
    const connected = (section as HTMLElement & { isConnected?: boolean }).isConnected;
    if (connected === false || section.dataset.state !== 'running') {
      unregisterRunTimer(section);
      return;
    }
    writeElapsed(section, now - (Number(section.dataset.startedAt) || now));
  });
}

function registerRunTimer(section: HTMLElement): void {
  if (!section || RUNNING_RUNS.has(section)) return;
  RUNNING_RUNS.add(section);
  if (RUN_TIMER == null && typeof setInterval === 'function') {
    RUN_TIMER = setInterval(tickRuns, RUN_TICK_MS);
    /* Under Node (unit tests, SSR-style rendering) an interval keeps the
       process alive. The browser has no unref, so this is a no-op there. */
    const handle = RUN_TIMER as unknown as { unref?: () => void };
    if (typeof handle.unref === 'function') handle.unref();
  }
}

function unregisterRunTimer(section: HTMLElement | null | undefined): void {
  if (section) RUNNING_RUNS.delete(section);
  if (RUNNING_RUNS.size === 0 && RUN_TIMER != null) {
    clearInterval(RUN_TIMER);
    RUN_TIMER = null;
  }
}

/** Stop timing a run whose owning stream was disposed. */
export function stopAgentRunTimer(section: HTMLElement | null | undefined): void {
  unregisterRunTimer(section);
}

/**
 * Rebuild a persisted run from stored steps (history replay, share view).
 * Steps are stored on the tool call, so replay is a straight re-upsert.
 */
export function renderAgentRun(
  host: HTMLElement,
  data: { runId?: string | null; steps?: AgentStepData[]; plan?: AgentPlanData | null; durationMs?: number | null },
): HTMLElement | null {
  if (!host || !data) return null;
  const steps = Array.isArray(data.steps) ? data.steps : [];
  if (steps.length === 0 && !data.plan) return null;
  const section = ensureAgentRunSection(host, data.runId);
  if (data.plan) upsertAgentPlan(host, data.plan, data.runId);
  for (const step of steps) upsertAgentStep(host, step, data.runId);
  settleAgentRun(host, { runId: data.runId, durationMs: data.durationMs ?? null });
  return section;
}
