/**
 * toolCardModel — DOM-free view model for RN-2 tool cards.
 *
 * One row per call: verb title (「搜索网页」), object (query / domain / file),
 * status and duration. Copy is returned as `{ key, fallback }` so the host
 * translates it (the web shell's i18n tables, or native strings later).
 */

export type ToolCardStatus = 'running' | 'done' | 'error' | 'awaiting' | 'stopped';

export interface CopyRef {
  key: string;
  /** English fallback; the host's tables carry the Chinese copy. */
  fallback: string;
}

const SEARCH = /^(?:web_search|WebSearch|arxiv_search|zotero_search|notion_search_pages|gmail_search|qq_mail_search|search)$/;

const VERBS: ReadonlyArray<[RegExp, CopyRef]> = [
  [SEARCH, { key: 'tool.verb.search', fallback: 'Search the web' }],
  [/^(?:web_fetch|WebFetch|fetch|browse)$/, { key: 'tool.verb.fetch', fallback: 'Read web page' }],
  [/^(?:code_interpreter|Code|python)$/, { key: 'tool.verb.code', fallback: 'Run code' }],
  [/^(?:Bash|shell|command)$/, { key: 'tool.verb.command', fallback: 'Run command' }],
  [/memory/i, { key: 'tool.verb.memory', fallback: 'Save memory' }],
  [/^create_plan$/, { key: 'tool.verb.plan', fallback: 'Make a plan' }],
  [/^create_spec$/, { key: 'tool.verb.spec', fallback: 'Draft a spec' }],
  [/^(?:Read|Glob|Grep|read_attachment)$/, { key: 'tool.verb.read', fallback: 'Read file' }],
  [/^(?:image|read_image)$/, { key: 'tool.verb.image', fallback: 'View image' }],
  [/^Write$/, { key: 'tool.verb.write', fallback: 'Create file' }],
  [/^Edit$/, { key: 'tool.verb.edit', fallback: 'Edit file' }],
  [/^(?:render_visualization|render_intelligent_ui|patch_intelligent_ui)$/, { key: 'tool.verb.visual', fallback: 'Create visual' }],
  [/^cite_sources$/, { key: 'tool.verb.cite', fallback: 'Check references' }],
  [/^(?:workspace_agent|initialize_workspace)$/, { key: 'tool.verb.workspace', fallback: 'Work in workspace' }],
  [/^create_site$/, { key: 'tool.verb.site', fallback: 'Publish site' }],
  [/^(?:oc_|github_|gmail_|google_calendar_|todoist_|gitlab_|qq_mail_|gitee_|notion_)/, { key: 'tool.verb.connector', fallback: 'Use connected app' }],
];

export function toolVerbOf(name: string): CopyRef {
  const tool = String(name || '');
  for (const [pattern, verb] of VERBS) if (pattern.test(tool)) return verb;
  return { key: 'tool.verb.default', fallback: 'Use a tool' };
}

export const STATUS_COPY: Readonly<Record<ToolCardStatus, CopyRef>> = {
  running: { key: 'tool.status.running', fallback: 'Running' },
  done: { key: 'tool.status.done', fallback: 'Done' },
  error: { key: 'tool.status.failed', fallback: 'Failed' },
  awaiting: { key: 'tool.status.awaiting', fallback: 'Needs approval' },
  stopped: { key: 'tool.status.stopped', fallback: 'Stopped' },
};

function field(input: unknown, ...keys: string[]): string {
  if (!input || typeof input !== 'object') return '';
  const record = input as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function clipText(text: string, max = 48): string {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

export function hostOf(url: string): string {
  const raw = String(url || '').trim();
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(raw);
  const host = match ? match[1] : raw.split(/[/?#]/)[0];
  return host.replace(/^www\./i, '').toLowerCase();
}

function basename(path: string): string {
  const parts = String(path || '').split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

/** The object of the verb: query, domain, file name or command. */
export function toolTargetOf(name: string, input: unknown): string {
  const query = field(input, 'query', 'q', 'search_query', 'pattern');
  if (SEARCH.test(name) && query) return clipText(query);
  const url = field(input, 'url', 'uri', 'link');
  if (url) return clipText(hostOf(url), 40);
  const file = field(input, 'file_path', 'path', 'filePath', 'fileName', 'name');
  if (file) return clipText(basename(file), 40);
  const command = field(input, 'command', 'cmd');
  if (command) return clipText(command, 40);
  if (query) return clipText(query);
  return clipText(field(input, 'title', 'topic', 'goal', 'content'), 40);
}

/** `0.4s`, `1.8s`, `12s`, `1m 05s`. Empty for unknown or negative. */
export function formatDurationMs(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '';
  if (ms < 10_000) return (Math.max(ms, 100) / 1000).toFixed(1).replace(/\.0$/, '') + 's';
  const total = Math.round(ms / 1000);
  if (total < 60) return total + 's';
  const minutes = Math.floor(total / 60);
  return `${minutes}m ${String(total % 60).padStart(2, '0')}s`;
}

const STATUS_RANK: Record<ToolCardStatus, number> = { awaiting: 5, running: 4, error: 3, stopped: 2, done: 1 };

/** One status for a run of calls: a pending decision outranks work in
 * flight, which outranks a failure, which outranks completion. */
export function aggregateStatus(statuses: ReadonlyArray<ToolCardStatus>): ToolCardStatus {
  let best: ToolCardStatus = 'done';
  for (const status of statuses) if (STATUS_RANK[status] > STATUS_RANK[best]) best = status;
  return best;
}

export function sumDurations(durations: ReadonlyArray<number | null | undefined>): number | null {
  let total = 0;
  let any = false;
  for (const value of durations) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      total += value;
      any = true;
    }
  }
  return any ? total : null;
}

/** Statuses that have something to show in the per-call detail sheet. */
export function isSettled(status: ToolCardStatus): boolean {
  return status === 'done' || status === 'error' || status === 'stopped';
}

/** Same-origin `/favicon.ico` for http(s) links; null otherwise. */
export function faviconUrlOf(url: string): string | null {
  const match = /^(https?:\/\/[^/?#]+)/i.exec(String(url || '').trim());
  return match ? match[1] + '/favicon.ico' : null;
}

/** First letter of the host, for the monogram shown until (or instead of)
 * the favicon. */
export function monogramOf(host: string): string {
  const first = String(host || '').replace(/^www\./i, '').charAt(0);
  return /[a-z0-9]/i.test(first) ? first.toUpperCase() : '?';
}

export interface SourceCardView {
  key: string;
  title: string;
  host: string;
  url: string | null;
  favicon: string | null;
  monogram: string;
}

export function sourceCardsOf(items: ReadonlyArray<{ title?: string; url?: string; host?: string }>): SourceCardView[] {
  return items.map((item, index) => {
    const url = /^https?:\/\//i.test(String(item.url || '')) ? String(item.url) : null;
    const host = item.host || (url ? hostOf(url) : '');
    return {
      key: `${url || item.title || 'source'}-${index}`,
      title: clipText(item.title || host || url || '', 96),
      host,
      url,
      favicon: url ? faviconUrlOf(url) : null,
      monogram: monogramOf(host),
    };
  });
}
