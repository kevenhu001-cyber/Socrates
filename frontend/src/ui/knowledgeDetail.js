import { esc } from '../render/helpers.ts';

let runtimePromise = null;
let runtime = null;

function tr(key, vars) {
  var value = typeof window.t === 'function' ? window.t(key) : key;
  if (!vars) return value;
  return String(value).replace(/\{(\w+)\}/g, function (whole, name) {
    return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
  });
}

/* Knowledge rows are part of updateKB's synchronous render path. Keep this
 * tiny formatter hot; the editable detail/history UI loads on first open. */
export function kbNodeHtml(node, cls) {
  return '<div class="kb-node" data-node-idx="' + node.idx + '"><div class="kb-dot ' + cls + '"></div><span class="kb-name">' + esc(node.name) + '</span>' + (node.questions ? '<span class="kb-count">' + esc(tr('kb.questions', { n: node.questions })) + '</span>' : '') + '</div>';
}

function loadKnowledgeDetailRuntime() {
  if (!runtimePromise) {
    runtimePromise = import('./knowledgeDetail.impl.mjs')
      .then(function (module) {
        runtime = module;
        return module;
      })
      .catch(function (error) {
        runtimePromise = null;
        runtime = null;
        console.error('[knowledge-detail] failed to load runtime', error);
        throw error;
      });
  }
  return runtimePromise;
}

export function toggleKBDetail(index) {
  if (runtime) {
    runtime.toggleKBDetail(index);
    return;
  }
  loadKnowledgeDetailRuntime()
    .then(function (module) { module.toggleKBDetail(index); })
    .catch(function () { /* loader already reports the error */ });
}

export { loadKnowledgeDetailRuntime };
