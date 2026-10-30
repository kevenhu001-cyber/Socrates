type FeatureRuntime = typeof import("./socraticTurn.impl.ts");


/* tutor/socraticTurn.ts — stable async facade for the Tutor execution layer.
 * Keep Tutor-only prompt/history/streaming code out of the ordinary Chat
 * startup graph; every public operation was already async, so callers retain
 * the same Promise contract while the implementation loads on first use. */
let runtimeImport: Promise<FeatureRuntime> | null = null;

function loadRuntime() {
  if (!runtimeImport) {
    const pending = import('./socraticTurn.impl.ts');
    runtimeImport = pending;
    void pending.catch((error) => {
      if (runtimeImport === pending) runtimeImport = null;
      console.error('[tutor] failed to load Socratic runtime', error);
    });
  }
  return runtimeImport;
}

export async function generateSocraticQuestion(...args: Parameters<FeatureRuntime["generateSocraticQuestion"]>) {
  const runtime = await loadRuntime();
  return runtime.generateSocraticQuestion(...args);
}

export async function generateSocraticQuestionStream(...args: Parameters<FeatureRuntime["generateSocraticQuestionStream"]>) {
  const runtime = await loadRuntime();
  return runtime.generateSocraticQuestionStream(...args);
}

export async function getExplanation(...args: Parameters<FeatureRuntime["getExplanation"]>) {
  const runtime = await loadRuntime();
  return runtime.getExplanation(...args);
}

export async function generateFollowUpStream(...args: Parameters<FeatureRuntime["generateFollowUpStream"]>) {
  const runtime = await loadRuntime();
  return runtime.generateFollowUpStream(...args);
}

export async function askNextQuestion(...args: Parameters<FeatureRuntime["askNextQuestion"]>) {
  const runtime = await loadRuntime();
  return runtime.askNextQuestion(...args);
}
