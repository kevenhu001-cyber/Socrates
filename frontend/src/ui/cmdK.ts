import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';

type FeatureRuntime = typeof import("./cmdK.impl.ts");

/* Cmd+K compatibility facade.
 * The palette/search implementation is interaction-triggered, but this public
 * module stays statically importable by startup, lifecycle cleanup and
 * session persistence without retaining the full search runtime at startup. */
let runtimePromise: Promise<FeatureRuntime> | null = null;
let runtime: FeatureRuntime | null = null;
let pendingDirty = false;
let pendingReset = false;

function loadCmdKRuntime() {
  if (!runtimePromise) {
    runtimePromise = import('./cmdK.impl.ts')
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

function invoke(name: keyof FeatureRuntime, args: unknown[], loadIfMissing: boolean) {
  if (runtime) {
    const action = runtime[name];
    if (typeof action === 'function') (action as (...values: unknown[]) => unknown)(...args);
    return;
  }
  if (!runtimePromise && loadIfMissing === false) return;
  loadCmdKRuntime().then(function (module: FeatureRuntime) {
    const action = module[name];
    if (typeof action === 'function') (action as (...values: unknown[]) => unknown)(...args);
  }).catch(function () { /* loader already reports the error */ });
}

export function resetCmdKSearchState() {
  try { localStorage.removeItem('socrates-search-recent'); } catch (_) {
    reportEmptyCatch(_, 'empty catch: ui/cmdK.ts:51');
    /* private mode */
  }
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
export function onCmdKInput(q: string) { invoke('onCmdKInput', [q], true); }
export function onCmdKKey(ev: KeyboardEvent) { invoke('onCmdKKey', [ev], true); }
export function openCmdKResult(idx: number) { invoke('openCmdKResult', [idx], true); }
export function rebuildCmdKIndex() { invoke('rebuildCmdKIndex', [], true); }
export function updateCmdKSelected() { invoke('updateCmdKSelected', [], true); }

export { loadCmdKRuntime };
