import { onSessionDragStart, onSessionDragEnd } from './dragSession.ts';

type OrganizeModule = typeof import('./organize.ts');

let runtimePromise: Promise<OrganizeModule> | null = null;
let runtime: OrganizeModule | null = null;

function loadOrganizeRuntime(): Promise<OrganizeModule> {
  if (!runtimePromise) {
    runtimePromise = import('./organize.ts')
      .then(function (module) {
        runtime = module;
        return module;
      })
      .catch(function (error) {
        runtimePromise = null;
        runtime = null;
        console.error('[session-organize] failed to load runtime', error);
        throw error;
      });
  }
  return runtimePromise;
}

interface TagEditorEventLike {
  stopPropagation(): void;
  preventDefault(): void;
  currentTarget?: Element | null;
}

/* Preserve event timing: React/native currentTarget is only reliable while the
 * original handler runs, so stop/default + target capture happen before the
 * dynamic import. */
export function openTagEditor(id: string, event?: TagEditorEventLike | null): void {
  const currentTarget = event?.currentTarget || null;
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const forwarded = event ? {
    stopPropagation: function () { /* already handled synchronously */ },
    preventDefault: function () { /* already handled synchronously */ },
    currentTarget,
  } : null;

  if (runtime) {
    runtime.openTagEditor(id, forwarded);
    return;
  }
  void loadOrganizeRuntime()
    .then(function (module) { module.openTagEditor(id, forwarded); })
    .catch(function () { /* loader already reports the error */ });
}

export function closeTagEditor(): void {
  if (runtime) {
    runtime.closeTagEditor();
    return;
  }
  /* Do not download organize merely to close a popover that cannot exist.
     If an open is already in flight, queue close behind the same import. */
  if (runtimePromise) {
    void runtimePromise.then(function (module) { module.closeTagEditor(); })
      .catch(function () { /* loader already reports the error */ });
  }
}

export function cycleActiveProject(): void {
  if (runtime) {
    runtime.cycleActiveProject();
    return;
  }
  void loadOrganizeRuntime()
    .then(function (module) { module.cycleActiveProject(); })
    .catch(function () { /* loader already reports the error */ });
}

export { onSessionDragStart, onSessionDragEnd, loadOrganizeRuntime };
