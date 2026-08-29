/**
 * react/tool-run/labels.ts — the one place tool-row copy is derived.
 *
 * The previous labels were per-tool verbs with no object ("Read the page",
 * "Updated files"), which meant two different calls rendered identically and
 * the row carried no information unless you expanded it. Every label here is
 * derived from the call's own `input` / `output`, so a collapsed row answers
 * "what did you touch" on its own.
 *
 * Pure functions + English fallbacks: `translate()` degrades to the fallback
 * when `window.t` is absent, so Node unit tests can assert copy without a DOM.
 */

import { isInlineSearchTool, toolCategory } from '../../render/toolCategory.js';

export interface ToolCallLike {
  id?: string;
  name?: string;
  input?: unknown;
  output?: string | null;
  isError?: boolean;
  results?: ReadonlyArray<Record<string, unknown>> | unknown[];
  status?: string;
  durationMs?: number;
  argumentsText?: string;
  errorCode?: string | null;
  retryable?: boolean;
  /** Last `tool_progress` phase — upgrades the running verb (see runningLabel). */
  _progressPhase?: string;
}

export interface RunLabel {
  /** Primary row text. Always carries an object when one is available. */
  text: string;
  /** True when `text` is user-facing command text and should set monospace. */
  mono?: boolean;
  /** Trailing facts (result counts, test summary) rendered dim after the label. */
  meta?: string[];
}

export function translate(key: string, fallback: string): string {
  try {
    const w = globalThis as unknown as Record<string, unknown>;
    const fn = w.t;
    if (typeof fn === 'function') {
      const s = (fn as (k: string) => string)(key);
      if (s && s !== key) return s;
    }
  } catch (_) { /* non-browser harness */ }
  return fallback;
}

/** `t()` with optional `{name}` interpolation — legacy `t()` takes no args. */
export function tf(
  key: string,
  fallback: string,
  vars?: Record<string, string | number>,
): string {
  let out = translate(key, fallback);
  for (const name of Object.keys(vars || {})) {
    out = out.split('{' + name + '}').join(String((vars as Record<string, string | number>)[name]));
  }
  return out;
}

const LABEL_TARGET_MAX = 48;

/** Collapse whitespace and clip a query/command to one readable line. */
export function clip(text: string, max: number = LABEL_TARGET_MAX): string {
  const one = String(text || '').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (one.length <= max) return one;
  return one.slice(0, Math.max(1, max - 1)).trimEnd() + '…';
}

/** Last path segment, tolerating both separators. */
export function basename(path: string): string {
  const p = String(path || '').trim().replace(/[\\/]+$/, '');
  if (!p) return '';
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}

function strField(input: unknown, ...keys: string[]): string {
  if (!input || typeof input !== 'object') return '';
  const rec = input as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function filePathOf(input: unknown): string {
  return strField(input, 'file_path', 'path', 'filePath');
}

export function commandOf(input: unknown): string {
  return strField(input, 'command', 'cmd');
}

export function queryOf(input: unknown): string {
  return strField(input, 'query', 'q', 'search_query', 'pattern');
}

export function urlOf(input: unknown): string {
  return strField(input, 'url', 'uri', 'link');
}

/** Hostname without `www.`, or the URL's first segment when unparseable. */
export function hostOf(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    if (/^https?:\/\//i.test(raw)) return new URL(raw).hostname.replace(/^www\./i, '');
  } catch (_) { /* fall through */ }
  const noProto = raw.replace(/^[a-z]+:\/\//i, '');
  return clip(noProto.split('/')[0], 32);
}

export function resultCount(call: ToolCallLike | null | undefined): number {
  if (!call) return 0;
  return Array.isArray(call.results) ? call.results.length : 0;
}

/* A test/build one-liner is worth surfacing in the row; a page dump isn't.
   Match only summary shapes so we never promote an arbitrary first line. */
const PASSED_RE = /(\d+)\s+passed/i;
const FAILED_RE = /(\d+)\s+failed/i;
const ERROR_RE = /\b(error|traceback|exception)\b/i;

/** Short outcome summary for command/code runs, e.g. "8 passed" or "1 failed". */
export function outcomeOf(output: unknown): string {
  const text = typeof output === 'string' ? output : '';
  if (!text) return '';
  const failed = FAILED_RE.exec(text);
  const passed = PASSED_RE.exec(text);
  if (failed && passed) return `${failed[1]} failed · ${passed[1]} passed`;
  if (failed) return `${failed[1]} failed`;
  if (passed) return `${passed[1]} passed`;
  if (/^[\s[{]*$/u.test(text)) return '';
  return '';
}

export function formatSeconds(ms: number | null | undefined): string {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
  const mins = Math.floor(value / 60_000);
  const secs = Math.floor((value % 60_000) / 1000);
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

/* ── Running-state copy ───────────────────────────────────────────────────
   Same objects as the settled labels: the row never changes shape between
   running and done, only its verb tense. */

function runningLabel(call: ToolCallLike): RunLabel {
  const name = String(call.name || '');
  const meta: string[] = [];
  if (name === 'Bash' || (toolCategory(name) === 'write' && commandOf(call.input))) {
    const cmd = commandOf(call.input);
    if (cmd) return { text: `$ ${clip(cmd)}`, mono: true, meta };
  }
  if (isInlineSearchTool(name)) {
    const q = queryOf(call.input);
    if (q) return { text: tf('tool.searchingFor', 'Searching "{query}"…', { query: clip(q) }) };
    return { text: translate('tool.actionSearch', 'Searching the web…') };
  }
  if (name === 'web_fetch' || name === 'WebFetch') {
    const host = hostOf(urlOf(call.input));
    if (host) return { text: tf('tool.readingHost', 'Reading {host}…', { host }) };
    return { text: translate('tool.actionFetch', 'Reading the page…') };
  }
  if (name === 'code_interpreter' || name === 'Code') {
    /* Once the sandbox has printed something, "executing" is stale: the wait
       is on the analysis, and the reader sees that. `tool_progress` records
       the last phase on the entry, which is what the legacy DOM writer used
       to upgrade its own label from. */
    const phase = String(call._progressPhase || '');
    if (phase === 'stdout' || phase === 'stderr') {
      return { text: translate('tool.actionAnalyze', 'Analyzing data…') };
    }
    return { text: translate('tool.actionCode', 'Executing code…') };
  }
  if (name === 'render_visualization') {
    return { text: translate('tool.actionVisual', 'Creating a chart') };
  }
  if (name === 'workspace_agent') {
    return { text: translate('tool.actionCodex', 'Working in the workspace…') };
  }
  if (name === 'Read' || name === 'Glob' || name === 'Grep') {
    const file = basename(filePathOf(call.input)) || clip(queryOf(call.input), 32);
    if (file) return { text: tf('tool.readingFile', 'Reading {file}…', { file }) };
    return { text: translate('tool.actionRead', 'Reading files') };
  }
  if (name === 'Write') {
    const file = basename(filePathOf(call.input));
    if (file) return { text: tf('tool.creatingFile', 'Creating {file}…', { file }) };
    return { text: translate('tool.actionWrite', 'Updating files') };
  }
  if (name === 'Edit') {
    const file = basename(filePathOf(call.input));
    if (file) return { text: tf('tool.editingFile', 'Editing {file}…', { file }) };
    return { text: translate('tool.actionWrite', 'Updating files') };
  }
  if (name === 'create_plan') return { text: translate('tool.actionPlan', 'Drafting a plan…') };
  if (name === 'create_spec') return { text: translate('tool.actionSpec', 'Drafting a spec…') };
  return { text: translate('tool.actionDefault', 'Using a tool') };
}

/* ── Settled copy ──────────────────────────────────────────────────────── */

function doneLabel(call: ToolCallLike): RunLabel {
  const name = String(call.name || '');
  const meta: string[] = [];
  const category = toolCategory(name);

  if (isInlineSearchTool(name)) {
    const n = resultCount(call);
    const q = queryOf(call.input);
    if (n > 0) meta.push(n === 1 ? translate('tool.nSourceOne', '1 source') : tf('tool.nSources', '{n} sources', { n }));
    if (q) return { text: tf('tool.searchedFor', 'Searched "{query}"', { query: clip(q) }), meta };
    return {
      text: n > 0
        ? tf('tool.searchDone', 'Found {n} web results', { n })
        : translate('tool.searchEmpty', 'No web results found'),
      meta,
    };
  }
  if (name === 'web_fetch' || name === 'WebFetch') {
    const host = hostOf(urlOf(call.input));
    if (host) return { text: tf('tool.fetchedHost', 'Read {host}', { host }) };
    return { text: translate('tool.doneFetch', 'Read the page') };
  }
  if (name === 'code_interpreter' || name === 'Code') {
    const outcome = outcomeOf(call.output);
    if (outcome) meta.push(outcome);
    return { text: translate('tool.ranCode', 'Ran Python'), meta };
  }
  if (name === 'render_visualization') {
    return { text: translate('tool.doneVisual', 'Created a chart') };
  }
  if (name === 'workspace_agent') {
    return { text: translate('tool.doneCodex', 'Workspace run') };
  }
  if (name === 'Bash') {
    const cmd = commandOf(call.input);
    const outcome = outcomeOf(call.output);
    if (outcome) meta.push(outcome);
    if (cmd) return { text: `$ ${clip(cmd)}`, mono: true, meta };
    return { text: translate('tool.ranCommand', 'Ran a command'), meta };
  }
  if (name === 'Read' || name === 'Glob' || name === 'Grep') {
    const file = basename(filePathOf(call.input)) || clip(queryOf(call.input), 32);
    if (file) return { text: tf('tool.readFile', 'Read {file}', { file }) };
    return { text: translate('tool.doneRead', 'Read files') };
  }
  if (name === 'Write') {
    const file = basename(filePathOf(call.input));
    if (file) return { text: tf('tool.createdFile', 'Created {file}', { file }) };
    return { text: translate('tool.doneWrite', 'Edited files') };
  }
  if (name === 'Edit') {
    const file = basename(filePathOf(call.input));
    if (file) return { text: tf('tool.editedFile', 'Edited {file}', { file }) };
    return { text: translate('tool.doneWrite', 'Edited files') };
  }
  if (name === 'create_plan') return { text: translate('tool.donePlan', 'Drafted a plan') };
  if (name === 'create_spec') return { text: translate('tool.doneSpec', 'Drafted a spec') };

  const outcome = outcomeOf(call.output);
  if (outcome) meta.push(outcome);
  const target = clip(queryOf(call.input) || filePathOf(call.input) || urlOf(call.input), 32);
  if (target) {
    return {
      text: tf('tool.usedToolOn', '{tool} · {target}', { tool: name || 'tool', target }),
      meta,
    };
  }
  if (category === 'other') return { text: translate('tool.doneDefault', 'Finished using tool'), meta };
  return { text: translate('tool.doneDefault', 'Finished using tool'), meta };
}

function errorLabel(call: ToolCallLike): RunLabel {
  const name = String(call.name || '');
  if (call.status === 'timeout') {
    return { text: translate('tool.statusTimeout', 'Timeout') };
  }
  const target = clip(
    queryOf(call.input) || basename(filePathOf(call.input)) || hostOf(urlOf(call.input)),
    32,
  );
  if (isInlineSearchTool(name)) {
    return {
      text: target
        ? tf('tool.searchFailedFor', 'Search failed: {query}', { query: target })
        : translate('tool.searchFailed', 'Web search failed'),
    };
  }
  if (name === 'workspace_agent') {
    return { text: translate('tool.codexFailed', 'The workspace task failed') };
  }
  return {
    text: target
      ? tf('tool.actionFailedOn', 'Failed: {target}', { target })
      : translate('tool.actionFailed', 'Tool call failed'),
  };
}

/**
 * The row's headline for a call in any state. Running rows keep an ellipsis-
 * free phrasing so the shimmer animation, not the punctuation, carries
 * "in flight".
 */
export function toolRunLabel(
  call: ToolCallLike,
  state: 'running' | 'done' | 'error' | 'stopped' | 'awaiting',
): RunLabel {
  if (state === 'running') return runningLabel(call);
  if (state === 'error') return errorLabel(call);
  if (state === 'stopped') return { text: translate('tool.statusStopped', 'Stopped') };
  if (state === 'awaiting') {
    return { text: translate('tool.awaitingApproval', 'Waiting for your decision') };
  }
  return doneLabel(call);
}

/* ── Group (turn aggregate) copy ─────────────────────────────────────────── */

function uniqueFiles(members: ToolCallLike[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of members) {
    const file = basename(filePathOf(m.input));
    if (!file || seen.has(file)) continue;
    seen.add(file);
    out.push(file);
  }
  return out;
}

function countBy(members: ToolCallLike[], pred: (m: ToolCallLike) => boolean): number {
  let n = 0;
  for (const m of members) if (pred(m)) n++;
  return n;
}

/**
 * Aggregate label for a collapsed run of consecutive tool calls. Names the
 * work rather than the count when it can: "moe.py, routing.py, +1" beats
 * "3 tools", and the count moves to the meta where it reads as a qualifier.
 */
export function toolRunGroupLabel(
  members: ToolCallLike[],
  state: 'running' | 'done' | 'error' | 'stopped',
): RunLabel {
  const total = members.length;
  const meta: string[] = [tf('tool.nActions', '{n} actions', { n: total })];
  const failed = countBy(members, (m) => m.isError === true || m.status === 'failed');
  if (failed > 0) meta.unshift(tf('tool.failedCount', '{n} failed', { n: failed }));

  if (state === 'running') {
    return { text: translate('tool.groupExploring', 'Exploring'), meta };
  }
  if (state === 'stopped') {
    return { text: translate('tool.groupStopped', 'Tool run stopped'), meta };
  }

  /* A homogeneous run gets a specific label. A mixed one (Edit + Bash)
     deliberately falls back to the generic "Explored · N actions" rather
     than naming only part of what happened. */
  const names = members.map((m) => String(m.name || ''));
  const allOf = (set: Set<string>) => names.length > 0 && names.every((n) => set.has(n));
  const EDIT_TOOLS = new Set(['Edit', 'Write']);
  const READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);
  const isWriteLike = allOf(EDIT_TOOLS);
  const isReadLike = allOf(READ_TOOLS);
  const isSearchLike = names.length > 0 && names.every((n) => isInlineSearchTool(n));

  if (isWriteLike) {
    const edits = members.filter((m) => m.name === 'Edit');
    const writes = members.filter((m) => m.name === 'Write');
    const parts: string[] = [];
    const edited = uniqueFiles(edits);
    const created = uniqueFiles(writes);
    if (edited.length) parts.push(joinNames(edited));
    if (created.length) parts.push(joinNames(created));
    const head = parts.length
      ? tf('tool.exploredFiles', 'Edited {files}', { files: parts.join(' + ') })
      : tf('tool.editedNFiles', 'Edited {n} files', { n: total });
    return { text: head, meta };
  }
  if (isReadLike) {
    const names = uniqueFiles(members);
    if (names.length) {
      return { text: tf('tool.readFiles', 'Read {files}', { files: joinNames(names) }), meta };
    }
    return { text: tf('tool.readNFiles', 'Read {n} files', { n: total }), meta };
  }
  if (isSearchLike) {
    /* Keep the accumulated meta (`N failed · N actions`) — a search run that
       partly failed must not lose the failure count from its header, which
       is the only place a collapsed group reports it. */
    const sources = members.reduce((sum, m) => sum + resultCount(m), 0);
    if (sources > 0) {
      return { text: tf('tool.groupSearchDone', 'Found {n} sources · {m} searches', { n: sources, m: total }), meta };
    }
    return { text: tf('tool.groupSearchEmpty', 'No results · {m} searches', { m: total }), meta };
  }
  const mixed = mixedRunClauses(members);
  if (mixed) return { text: mixed, meta };
  return { text: translate('tool.groupExplored', 'Explored'), meta };
}

/**
 * Buckets a mixed run reports on, in the order they are read. Each carries a
 * singular form: "read 1 files" is the kind of copy that makes a summary look
 * generated rather than written.
 */
const MIXED_BUCKETS: ReadonlyArray<{
  key: string;
  fallback: string;
  oneKey: string;
  oneFallback: string;
  match: (name: string) => boolean;
}> = [
  {
    key: 'tool.clauseRanCommands', fallback: 'ran {n} commands',
    oneKey: 'tool.clauseRanCommandOne', oneFallback: 'ran a command',
    match: (n) => n === 'Bash',
  },
  {
    key: 'tool.clauseReadFiles', fallback: 'read {n} files',
    oneKey: 'tool.clauseReadFileOne', oneFallback: 'read a file',
    match: (n) => toolCategory(n) === 'read',
  },
  {
    key: 'tool.clauseEditedFiles', fallback: 'edited {n} files',
    oneKey: 'tool.clauseEditedFileOne', oneFallback: 'edited a file',
    match: (n) => n === 'Edit',
  },
  {
    key: 'tool.clauseCreatedFiles', fallback: 'created {n} files',
    oneKey: 'tool.clauseCreatedFileOne', oneFallback: 'created a file',
    match: (n) => n === 'Write',
  },
  {
    key: 'tool.clauseSearched', fallback: 'searched {n} times',
    oneKey: 'tool.clauseSearchedOne', oneFallback: 'searched the web',
    match: (n) => isInlineSearchTool(n) || toolCategory(n) === 'fetch',
  },
  {
    key: 'tool.clauseRanCode', fallback: 'ran {n} code blocks',
    oneKey: 'tool.clauseRanCodeOne', oneFallback: 'ran code',
    match: (n) => toolCategory(n) === 'code',
  },
];

/**
 * "Ran 2 commands, read 4 files, edited a file" for a run that mixes kinds of
 * work. The homogeneous branches above name the files themselves, which is
 * better; this is for the case where naming any single object would describe
 * only part of what happened — previously a bare "Explored", which told the
 * reader nothing they could act on.
 *
 * Returns '' when the run does not decompose into at least two known buckets,
 * so the caller keeps its generic header rather than emitting a one-clause
 * summary that a homogeneous branch would have phrased better.
 */
function mixedRunClauses(members: ToolCallLike[]): string {
  const clauses: string[] = [];
  let covered = 0;
  for (const bucket of MIXED_BUCKETS) {
    const n = countBy(members, (m) => bucket.match(String(m.name || '')));
    if (n === 0) continue;
    covered += n;
    clauses.push(n === 1
      ? translate(bucket.oneKey, bucket.oneFallback)
      : tf(bucket.key, bucket.fallback, { n }));
  }
  /* Every call has to land in a bucket: a run that also touched something
     unclassified would report a total that does not add up. */
  if (clauses.length < 2 || covered !== members.length) return '';
  const joined = clauses.join(translate('tool.clauseJoin', ', '));
  return joined.charAt(0).toLocaleUpperCase() + joined.slice(1);
}

/** "a.py, b.py, +2" — two names then a remainder, so the row stays one line. */
function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(', ');
  return names.slice(0, 2).join(', ') + ', +' + (names.length - 2);
}
