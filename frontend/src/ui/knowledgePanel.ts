/* ui/knowledgePanel.ts — extracted from main.js.
 * Knowledge-boundary panel rendering. Zero-behavior-change lift.
 * tutorSocratic legacy global resolved via window at call time.
 */
import { stateStore } from '../state/store.ts';
import { renderKnowledgeView } from './knowledgeView.ts';
import { kbNodeHtml, toggleKBDetail } from './knowledgeDetail.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


function _t(key: string, fallback: string|null) {
  try {
    if (typeof window !== 'undefined' && typeof browserWindow.t === 'function') {
      const v = browserWindow.t(key);
      if (v && v !== key) return v;
    }
  } catch (error) { reportSwallow(error, 'ui/knowledgePanel.ts:15'); }
  return fallback != null ? fallback : key;
}

function _tutorSocratic() {
  try {
    if (typeof window !== 'undefined' && browserWindow.tutorSocratic) return browserWindow.tutorSocratic;
  } catch (error) { reportSwallow(error, 'ui/knowledgePanel.ts:22'); }
  return null;
}

export function updateKB() {
  /* Task 3.3 — keep the teaching-plan view in sync with the KB.
     renderKnowledgeView is a no-op when there's no plan, so
     callers that don't have one yet (chat mode, pre-diagnostic)
     are unaffected. */
  renderKnowledgeView();
  /* v3.0 design — knowledge-boundary file rendering lives in
     tutorSocratic.js. The renderer reads stateStore.read("kbNodes") directly
     and shows the [系统]/[我] annotation lines from §6.3 plus
     the snapshot history from §6.5. We delegate the entire
     #kbContent body to that renderer. */
  const _ts = _tutorSocratic();
  /* Mode banner and teaching plan re-render in the new module. */
  if (_ts) {
    try { _ts.renderTeachingPlan(); } catch (error) { reportSwallow(error, 'ui/knowledgePanel.ts:40'); }
  }
  const cont = document.getElementById('kbContent');
  if (!cont) return;

  /* P_kb-double-render — the delegated renderer above OWNS #kbContent.
     This function used to call it and then keep going, rebuilding the
     panel as a plain three-section list and assigning cont.innerHTML
     over the top. The P1.2 force-directed graph was therefore painted
     and destroyed inside the same synchronous call: the flagship
     knowledge map was never visible, and users saw the old list with
     English section headers instead.

     Delegation now short-circuits. The legacy list is kept strictly as
     a fallback for when tutorSocratic.js has not loaded (it is resolved
     off window at call time), so a failed module load degrades to the
     old view rather than an empty panel. */
  if (_ts && typeof _ts.renderKnowledgeBoundaryFile === 'function') {
    try {
      _ts.renderKnowledgeBoundaryFile({});
      return;
    } catch (_) {
      reportSwallow(_, 'empty catch: ui/knowledgePanel.ts:64');
      /* delegate failed — fall through to the legacy list */
    }
  }

  if (!stateStore.read('kbNodes').length) {
    cont.innerHTML = '<div class="kb-empty">' + _t('tutor.kbTopicFirst', 'Set a learning topic to build your knowledge map.') + '</div>';
    return;
  }

  const sections: Record<string, { idx: number; name: string; questions: number }[]> = { internalized: [], fuzzy: [], blank: [] };
  stateStore.read('kbNodes').forEach(function (n, i) {
    const cls = n.status === 'internalized' ? 'internalized' : n.status === 'fuzzy' ? 'fuzzy' : 'blank';
    sections[cls].push({ name: n.name, questions: n.questions || 0, idx: i });
  });

  /* Legacy fallback (only reached when tutorSocratic.js is unavailable).
     Headers go through the same kb.status.* keys as the detail panel so a
     degraded load does not re-introduce hardcoded English for the default
     zh locale. */
  const sectionTitle = function (key: string, fallback: string) {
    return '<div class="kb-section-title">' + _t(key, fallback)
         + ' <span class="kb-section-count">';
  };
  let html = '';
  if (sections.internalized.length) {
    html += sectionTitle('tutor.statusInternalized', 'Internalized') + sections.internalized.length + '</span></div>';
    sections.internalized.forEach(function (n) { html += kbNodeHtml(n, 'internalized'); });
  }
  if (sections.fuzzy.length) {
    html += sectionTitle('tutor.statusFuzzy', 'Fuzzy') + sections.fuzzy.length + '</span></div>';
    sections.fuzzy.forEach(function (n) { html += kbNodeHtml(n, 'fuzzy'); });
  }
  if (sections.blank.length) {
    html += sectionTitle('tutor.statusBlank', 'Blank') + sections.blank.length + '</span></div>';
    sections.blank.forEach(function (n) { html += kbNodeHtml(n, 'blank'); });
  }
  cont.innerHTML = html;
  cont.onclick = function (event) {
    const row = (event.target as Element)!.closest && (event.target as Element)!.closest('.kb-node[data-node-idx]');
    if (row && cont.contains(row)) toggleKBDetail(Number(row.getAttribute('data-node-idx')));
  };
}
