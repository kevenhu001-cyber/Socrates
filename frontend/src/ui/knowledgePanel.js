/* ui/knowledgePanel.js — extracted from main.js.
 * Knowledge-boundary panel rendering. Zero-behavior-change lift.
 * tutorSocratic legacy global resolved via window at call time.
 */
import { stateStore } from '../state/store.js';
import { renderKnowledgeView } from './knowledgeView.js';
import { kbNodeHtml, toggleKBDetail } from './knowledgeDetail.js';

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (_) {}
  return fallback != null ? fallback : key;
}

function _tutorSocratic() {
  try {
    if (typeof window !== 'undefined' && window.tutorSocratic) return window.tutorSocratic;
  } catch (_) {}
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
  var _ts = _tutorSocratic();
  /* Mode banner and teaching plan re-render in the new module. */
  if (_ts) {
    try { _ts.renderTeachingPlan(); } catch (_) {}
  }
  var cont = document.getElementById('kbContent');
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
      _ts.renderKnowledgeBoundaryFile();
      return;
    } catch (_) { /* delegate failed — fall through to the legacy list */ }
  }

  if (!stateStore.read('kbNodes').length) {
    cont.innerHTML = '<div class="kb-empty">' + _t('tutor.kbTopicFirst', 'Set a learning topic to build your knowledge map.') + '</div>';
    return;
  }

  var sections = { internalized: [], fuzzy: [], blank: [] };
  stateStore.read('kbNodes').forEach(function (n, i) {
    var cls = n.status === 'internalized' ? 'internalized' : n.status === 'fuzzy' ? 'fuzzy' : 'blank';
    sections[cls].push({ name: n.name, questions: n.questions || 0, idx: i });
  });

  /* Legacy fallback (only reached when tutorSocratic.js is unavailable).
     Headers go through the same kb.status.* keys as the detail panel so a
     degraded load does not re-introduce hardcoded English for the default
     zh locale. */
  var sectionTitle = function (key, fallback) {
    return '<div class="kb-section-title">' + _t(key, fallback)
         + ' <span class="kb-section-count">';
  };
  var html = '';
  if (sections.internalized.length) {
    html += sectionTitle('kb.status.internalized', 'Internalized') + sections.internalized.length + '</span></div>';
    sections.internalized.forEach(function (n) { html += kbNodeHtml(n, 'internalized'); });
  }
  if (sections.fuzzy.length) {
    html += sectionTitle('kb.status.fuzzy', 'Exploring') + sections.fuzzy.length + '</span></div>';
    sections.fuzzy.forEach(function (n) { html += kbNodeHtml(n, 'fuzzy'); });
  }
  if (sections.blank.length) {
    html += sectionTitle('kb.status.blank', 'Not yet reached') + sections.blank.length + '</span></div>';
    sections.blank.forEach(function (n) { html += kbNodeHtml(n, 'blank'); });
  }
  cont.innerHTML = html;
  cont.onclick = function (event) {
    var row = event.target.closest && event.target.closest('.kb-node[data-node-idx]');
    if (row && cont.contains(row)) toggleKBDetail(Number(row.getAttribute('data-node-idx')));
  };
}
