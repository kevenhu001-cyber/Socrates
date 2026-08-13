import * as Speech from 'expo-speech';
import type { SpeechCallbacks } from './speech';

export type { SpeechCallbacks } from './speech';

export function speak(text: string, callbacks: SpeechCallbacks = {}) {
  Speech.speak(text, {
    onDone: callbacks.onDone,
    onStopped: callbacks.onStopped,
    onError: callbacks.onError,
  });
}

export async function stop() {
  await Speech.stop();
}
