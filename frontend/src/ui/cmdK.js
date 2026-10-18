/* Cmd+K compatibility facade.
 * The palette/search implementation is interaction-triggered, but this public
 * module stays statically importable by windowExports, lifecycle cleanup and
 * session persistence without retaining the full search runtime at startup. */
let runtimePromise = null;
let runtime = null;
let pendingDirty = false;
let pendingReset = false;

function loadCmdKRuntime() {
  if (!runtimePromise) {
    runtimePromise = import('./cmdK.impl.mjs')
      .then(function (module) {
        runtime = module;
        if (pendingReset) {
          module.resetCmdKSearchState();
          pendingReset = false;
        }
        if (pendingDirty) {
          module.markCmdKIndexDirty();
          pendingDirty = false;
        }
        return module;
      })
      .catch(function (error) {
        runtimePromise = null;
        runtime = null;
        console.error('[cmdK] failed to load runtime', error);
        throw error;
      });
  }
  return runtimePromise;
}

function invoke(name, args, loadIfMissing) {
  if (runtime) {
    if (typeof runtime[name] === 'function') runtime[name].apply(null, args);
    return;
  }
  if (!runtimePromise && loadIfMissing === false) return;
  loadCmdKRuntime().then(function (module) {
    if (typeof module[name] === 'function') module[name].apply(null, args);
  }).catch(function () { /* loader already reports the error */ });
}

export function resetCmdKSearchState() {
  try { localStorage.removeItem('socrates-search-recent'); } catch (_) { /* private mode */ }
  if (runtime) {
    runtime.resetCmdKSearchState();
    pendingReset = false;
  } else {
    pendingReset = true;
  }
}

export function markCmdKIndexDirty() {
  if (runtime) runtime.markCmdKIndexDirty();
  else pendingDirty = true;
}

export function openCmdK() { invoke('openCmdK', [], true); }
export function closeCmdK() { invoke('closeCmdK', [], false); }
export function onCmdKInput(q) { invoke('onCmdKInput', [q], true); }
export function onCmdKKey(ev) { invoke('onCmdKKey', [ev], true); }
export function openCmdKResult(idx) { invoke('openCmdKResult', [idx], true); }
export function rebuildCmdKIndex() { invoke('rebuildCmdKIndex', [], true); }
export function renderCmdKResults(sections) { invoke('renderCmdKResults', [sections], true); }
export function renderCmdKResultsHits(q, hits) { invoke('renderCmdKResultsHits', [q, hits], true); }
export function updateCmdKSelected() { invoke('updateCmdKSelected', [], true); }

export { loadCmdKRuntime };
