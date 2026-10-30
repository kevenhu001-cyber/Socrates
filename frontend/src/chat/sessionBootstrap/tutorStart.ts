type FeatureRuntime = typeof import("./tutorStart.impl.ts");

/* Tutor-only session bootstrap. Keep diagnostics, knowledge-node generation,
 * and Tutor setup dependencies out of the ordinary Chat startup graph. */
let runtimeImport: Promise<FeatureRuntime> | null = null;

function loadRuntime() {
  if (!runtimeImport) {
    const pending = import('./tutorStart.impl.ts');
    runtimeImport = pending;
    void pending.catch((error) => {
      if (runtimeImport === pending) runtimeImport = null;
      console.error('[tutor] failed to load session startup', error);
    });
  }
  return runtimeImport;
}

export async function startTutorSession(...args: Parameters<FeatureRuntime["startTutorSession"]>) {
  const runtime = await loadRuntime();
  return runtime.startTutorSession(...args);
}
