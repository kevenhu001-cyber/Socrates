import { esc } from '../render/helpers.js';

function getState(): Record<string, unknown> { return (window as any).state; }
function tr(key: string): string {
  return typeof (window as any).t === 'function' ? (window as any).t(key) : key;
}
function saveCurrentSessionSafe(): void {
  if (typeof (window as any).saveCurrentSession === 'function') (window as any).saveCurrentSession();
}

export function kbNodeHtml(n: { idx: number; name: string; questions?: number }, cls: string): string {
  /* Click on the row toggles the boundary detail panel. A separate small
     "→ go" button (added in mountKBDetail) is what actually jumps the
     chat to this node — so reading a note never accidentally triggers a
     new question. */
  return '<div class="kb-node" data-node-idx="' + n.idx + '" onclick="toggleKBDetail(' + n.idx + ')"><div class="kb-dot ' + cls + '"></div><span class="kb-name">' + esc(n.name) + '</span>' + (n.questions ? '<span class="kb-count">' + n.questions + ' Qs</span>' : '') + '</div>';
}

interface KBNode {
  name: string;
  status?: string;
  confidence_score?: number;
  system_note?: string;
  user_note?: string;
  history?: Array<{ date?: string; from?: string; to?: string; reason?: string }>;
  idx?: number;
  [key: string]: unknown;
}

export function toggleKBDetail(idx: number): void {
  const cont = document.getElementById('kbContent');
  if (!cont) return;
  const existing = cont.querySelector('.kb-node-detail[data-node-idx="' + idx + '"]');
  if (existing) { existing.remove(); return; }
  /* Close any other open detail panels (accordion behaviour). */
  const others = cont.querySelectorAll('.kb-node-detail');
  others.forEach(function (o) { o.remove(); });
  const state = getState();
  const nodes = state.kbNodes as KBNode[] | undefined;
  const node = nodes ? nodes[idx] : undefined;
  if (!node) return;
  const detail = document.createElement('div');
  detail.className = 'kb-node-detail';
  detail.setAttribute('data-node-idx', String(idx));
  detail.innerHTML = renderKBDetailInner(node, idx);
  /* Insert the detail panel right after the matching .kb-node row. */
  const row = cont.querySelector('.kb-node[data-node-idx="' + idx + '"]');
  if (row && row.parentNode) row.parentNode.insertBefore(detail, row.nextSibling);
  else cont.appendChild(detail);
  wireKBDetailEvents(detail, idx);
}

function renderKBDetailInner(node: KBNode, idx: number): string {
  let html = '';
  html += '<div class="kb-detail-head">';
  html += '<div class="kb-detail-status kb-detail-status-' + (node.status || 'blank') + '">' + esc(node.status || 'blank') + '</div>';
  html += '<button class="kb-go-btn" data-go="' + idx + '" title="Jump chat to this node">→ go</button>';
  html += '</div>';
  /* Confidence 1-5 dots. */
  const cs = typeof node.confidence_score === 'number' ? node.confidence_score : 0;
  html += '<div class="kb-detail-row"><span class="kb-detail-label">Confidence</span><div class="kb-conf-row">';
  for (let i = 1; i <= 5; i++) {
    html += '<button class="kb-conf-dot' + (i <= cs ? ' on' : '') + '" data-conf="' + i + '" title="Set confidence to ' + i + '"></button>';
  }
  html += '</div></div>';
  /* System note (read-only). */
  html += '<div class="kb-detail-row"><span class="kb-detail-label">System note</span>';
  html += '<div class="kb-system-note">' + (node.system_note ? esc(node.system_note) : '<em style="color:hsl(var(--text-500))">No system note yet.</em>') + '</div></div>';
  /* User note (editable). */
  html += '<div class="kb-detail-row"><label class="kb-detail-label" for="kbUserNote">Your note</label>';
  html += '<textarea class="kb-user-note" id="kbUserNote" name="kbUserNote" rows="3" placeholder="' + tr('kb.placeholderNote') + '">' + esc(node.user_note || '') + '</textarea></div>';
  /* History list. */
  const hist = node.history || [];
  html += '<div class="kb-detail-row"><span class="kb-detail-label">History</span>';
  if (hist.length) {
    html += '<ul class="kb-history">';
    hist.forEach(function (h) {
      html += '<li><span class="kb-hist-date">' + esc(h.date || '') + '</span> <span class="kb-hist-from kb-hist-from-' + esc(h.from || '') + '">' + esc(h.from || '?') + '</span> → <span class="kb-hist-to kb-hist-to-' + esc(h.to || '') + '">' + esc(h.to || '?') + '</span>' + (h.reason ? ' <span class="kb-hist-reason">— ' + esc(h.reason) + '</span>' : '') + '</li>';
    });
    html += '</ul>';
  } else {
    html += '<div class="kb-history-empty">No status changes yet.</div>';
  }
  html += '</div>';
  return html;
}

function wireKBDetailEvents(detail: HTMLElement, idx: number): void {
  const state = getState();
  const nodes = state.kbNodes as KBNode[] | undefined;
  const node = nodes ? nodes[idx] : undefined;
  if (!node) return;
  /* "→ go" button. */
  const goBtn = detail.querySelector('[data-go]') as HTMLElement | null;
  if (goBtn) {
    goBtn.onclick = function (e: Event) { e.stopPropagation(); jumpToNode(idx); };
  }
  /* Confidence dots. */
  detail.querySelectorAll('[data-conf]').forEach(function (btn) {
    (btn as HTMLElement).onclick = function (e: Event) {
      e.stopPropagation();
      const v = parseInt((btn as HTMLElement).getAttribute('data-conf') || '0', 10);
      node.confidence_score = (node.confidence_score === v) ? 0 : v;
      detail.querySelectorAll('[data-conf]').forEach(function (b) {
        const n = parseInt((b as HTMLElement).getAttribute('data-conf') || '0', 10);
        (b as HTMLElement).classList.toggle('on', n <= (node.confidence_score || 0));
      });
      saveCurrentSessionSafe();
    };
  });
  /* User note textarea — debounced save. */
  const ta = detail.querySelector('.kb-user-note') as HTMLTextAreaElement | null;
  if (ta) {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    ta.oninput = function () {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        node.user_note = ta.value;
        saveCurrentSessionSafe();
      }, 500);
    };
    ta.onclick = function (e: Event) { e.stopPropagation(); };
  }
}

async function jumpToNode(idx: number): Promise<void> {
  const state = getState();
  state.currentNode = idx;
  state.stuckCount = 0;
  state.substantiveCount = 0;
  if (typeof (window as any).askNextQuestion === 'function') await (window as any).askNextQuestion();
  saveCurrentSessionSafe();
}
