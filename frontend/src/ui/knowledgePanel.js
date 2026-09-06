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
  if (_ts && typeof _ts.renderKnowledgeBoundaryFile === 'function') {
    try { _ts.renderKnowledgeBoundaryFile(); } catch (_) { /* kb boundary render failed */ }
  }
  /* Mode banner and teaching plan re-render in the new module. */
  if (_ts) {
    try { _ts.renderTeachingPlan(); } catch (_) {}
  }
  var cont = document.getElementById('kbContent');
  if (!cont) return;
  if (!stateStore.read('kbNodes').length) {
    cont.innerHTML = '<div class="kb-empty">' + _t('tutor.kbTopicFirst', 'Set a learning topic to build your knowledge map.') + '</div>';
    return;
  }

  var sections = { internalized: [], fuzzy: [], blank: [] };
  stateStore.read('kbNodes').forEach(function (n, i) {
    var cls = n.status === 'internalized' ? 'internalized' : n.status === 'fuzzy' ? 'fuzzy' : 'blank';
    sections[cls].push({ name: n.name, questions: n.questions || 0, idx: i });
  });

  var html = '';
  if (sections.internalized.length) {
    html += '<div class="kb-section-title">Internalized <span class="kb-section-count">' + sections.internalized.length + '</span></div>';
    sections.internalized.forEach(function (n) { html += kbNodeHtml(n, 'internalized'); });
  }
  if (sections.fuzzy.length) {
    html += '<div class="kb-section-title">Exploring <span class="kb-section-count">' + sections.fuzzy.length + '</span></div>';
    sections.fuzzy.forEach(function (n) { html += kbNodeHtml(n, 'fuzzy'); });
  }
  if (sections.blank.length) {
    html += '<div class="kb-section-title">Not yet reached <span class="kb-section-count">' + sections.blank.length + '</span></div>';
    sections.blank.forEach(function (n) { html += kbNodeHtml(n, 'blank'); });
  }
  cont.innerHTML = html;
  cont.onclick = function (event) {
    var row = event.target.closest && event.target.closest('.kb-node[data-node-idx]');
    if (row && cont.contains(row)) toggleKBDetail(Number(row.getAttribute('data-node-idx')));
  };
}
