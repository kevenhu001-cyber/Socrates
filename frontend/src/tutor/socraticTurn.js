/* tutor/socraticTurn.js — stable async facade for the Tutor execution layer.
 * Keep Tutor-only prompt/history/streaming code out of the ordinary Chat
 * startup graph; every public operation was already async, so callers retain
 * the same Promise contract while the implementation loads on first use. */
let runtimeImport = null;

function loadRuntime() {
  if (!runtimeImport) {
    const pending = import('./socraticTurn.impl.mjs');
    runtimeImport = pending;
    void pending.catch((error) => {
      if (runtimeImport === pending) runtimeImport = null;
      console.error('[tutor] failed to load Socratic runtime', error);
    });
  }
  return runtimeImport;
}

export async function generateSocraticQuestion(node, domain) {
  const runtime = await loadRuntime();
  return runtime.generateSocraticQuestion(node, domain);
}

export async function generateSocraticQuestionStream(node, domain, onDelta, onThinking, streamOpts) {
  const runtime = await loadRuntime();
  return runtime.generateSocraticQuestionStream(node, domain, onDelta, onThinking, streamOpts);
}

export async function getExplanation(status) {
  const runtime = await loadRuntime();
  return runtime.getExplanation(status);
}

export async function generateFollowUpStream(answer, node, domain, onDelta, onThinking, streamOpts) {
  const runtime = await loadRuntime();
  return runtime.generateFollowUpStream(answer, node, domain, onDelta, onThinking, streamOpts);
}

export async function askNextQuestion() {
  const runtime = await loadRuntime();
  return runtime.askNextQuestion();
}
