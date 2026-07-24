import { apiFetch } from '../util/api.js';
import { esc } from '../render/helpers.js';

function tr(key: string): string {
  return typeof (window as any).t === 'function' ? (window as any).t(key) : key;
}

interface CrossSessionData {
  items?: CrossSessionItem[];
  summary?: CrossSessionSummary;
}

interface CrossSessionItem {
  nodeName?: string;
  status?: string;
  [key: string]: unknown;
}

interface CrossSessionSummary {
  total?: number;
  fuzzy?: number;
  internalized?: number;
  blank?: number;
}

interface KBCache {
  data: CrossSessionData | null;
  at: number;
}

const _crossSessionKBCache: KBCache = { data: null, at: 0 };

function loadCrossSessionKB(opts?: { force?: boolean }): Promise<CrossSessionData> {
  opts = opts || {};
  const now = Date.now();
  if (!opts.force && _crossSessionKBCache.data && now - _crossSessionKBCache.at < 60000) {
    return Promise.resolve(_crossSessionKBCache.data);
  }
  return apiFetch('/api/knowledge-boundary', { method: 'GET' }).then(function (r: unknown) {
    const data = r as CrossSessionData;
    _crossSessionKBCache.data = data;
    _crossSessionKBCache.at = Date.now();
    return data;
  }).catch(function (_e: unknown) {
    console.log('[kb] failed to load cross-session boundary');
    return { items: [], summary: { total: 0, fuzzy: 0, internalized: 0, blank: 0 } };
  });
}

/* Render the cross-session section into #kbCrossBody. Uses the cache
   when fresh; otherwise shows a loading state and fetches. */
export function loadAndRenderCrossSessionKB(force?: boolean): void {
  const body = document.getElementById('kbCrossBody') as HTMLElement | null;
  if (!body) return;
  const now = Date.now();
  if (!force && _crossSessionKBCache.data && now - _crossSessionKBCache.at < 60000) {
    body.innerHTML = renderCrossSessionKBHtml(_crossSessionKBCache.data);
    return;
  }
  body.textContent = tr('common.loading');
  loadCrossSessionKB({ force: !!force }).then(function (data: CrossSessionData) {
    const b = document.getElementById('kbCrossBody') as HTMLElement | null;
    if (b) b.innerHTML = renderCrossSessionKBHtml(data);
  });
}

/* Build the HTML for the cross-session section: summary counts plus
   a compact node list grouped by name, showing the best status across
   sessions (internalized > fuzzy > blank). */
export function renderCrossSessionKBHtml(data?: CrossSessionData | null): string {
  if (!data || !data.items) data = { items: [], summary: { total: 0, fuzzy: 0, internalized: 0, blank: 0 } };
  const s: CrossSessionSummary = data.summary || {};
  const rank: Record<string, number> = { internalized: 3, fuzzy: 2, blank: 1 };
  const byName: Record<string, CrossSessionItem> = {};
  (data.items || []).forEach(function (it: CrossSessionItem) {
    if (!it || !it.nodeName) return;
    const cur = byName[it.nodeName];
    if (!cur || (rank[it.status || ''] || 0) > (rank[cur.status || ''] || 0)) {
      byName[it.nodeName] = it;
    }
  });
  const names = Object.keys(byName).sort();
  let html = '<div class="kb-cross-summary">';
  html += '<span class="kb-cross-count kb-cross-internalized">internalized: ' + esc(String(s.internalized || 0)) + '</span>';
  html += '<span class="kb-cross-count kb-cross-fuzzy">fuzzy: ' + esc(String(s.fuzzy || 0)) + '</span>';
  html += '<span class="kb-cross-count kb-cross-blank">blank: ' + esc(String(s.blank || 0)) + '</span>';
  html += '</div>';
  if (!names.length) {
    html += '<div class="kb-cross-empty">No knowledge-boundary data across sessions yet.</div>';
    return html;
  }
  html += '<div class="kb-cross-nodes">';
  names.forEach(function (n: string) {
    const it = byName[n];
    html += '<div class="kb-cross-node kb-cross-status-' + esc(it.status || 'blank') + '">';
    html += '<span class="kb-cross-node-name">' + esc(n) + '</span>';
    html += '<span class="kb-cross-node-status">' + esc(it.status || 'blank') + '</span>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

export function resetCrossSessionKBCache(): void {
  _crossSessionKBCache.data = null;
  _crossSessionKBCache.at = 0;
}
