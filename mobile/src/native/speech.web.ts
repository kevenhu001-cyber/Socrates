let activeUtterance: SpeechSynthesisUtterance | null = null;

export type SpeechCallbacks = {
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
};

export function speak(text: string, callbacks: SpeechCallbacks = {}) {
  const engine = globalThis.speechSynthesis;
  if (!engine || typeof SpeechSynthesisUtterance === 'undefined') {
    callbacks.onError?.();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  activeUtterance = utterance;
  utterance.onend = () => { activeUtterance = null; callbacks.onDone?.(); };
  utterance.onerror = () => { activeUtterance = null; callbacks.onError?.(); };
  engine.speak(utterance);
}

export async function stop() {
  const engine = globalThis.speechSynthesis;
  if (engine) engine.cancel();
  activeUtterance = null;
}
