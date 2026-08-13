export type SpeechCallbacks = {
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
};

export function speak(_text: string, callbacks: SpeechCallbacks = {}) {
  callbacks.onError?.();
}

export async function stop() {
  // No-op fallback for platforms without a speech engine.
}
