/* Tutor-only session bootstrap. Keep diagnostics, knowledge-node generation,
 * and Tutor setup dependencies out of the ordinary Chat startup graph. */
let runtimeImport = null;

function loadRuntime() {
  if (!runtimeImport) {
    const pending = import('./tutorStart.impl.mjs');
    runtimeImport = pending;
    void pending.catch((error) => {
      if (runtimeImport === pending) runtimeImport = null;
      console.error('[tutor] failed to load session startup', error);
    });
  }
  return runtimeImport;
}

export async function startTutorSession(context) {
  const runtime = await loadRuntime();
  return runtime.startTutorSession(context);
}
