import * as Speech from 'expo-speech';

/* Native speech: expo-speech read-aloud (offline platform voices).
 * Voice input has no Expo Go-compatible recognizer, so the composer mic
 * stays hidden on native — listenSupported() gates it. */

export function speechAvailable(): boolean {
  return true;
}

export function listenSupported(): boolean {
  return false;
}

export async function speakText(text: string): Promise<void> {
  await Speech.stop();
  Speech.speak(text.slice(0, 4000));
}

export function stopSpeaking(): void {
  void Speech.stop();
}

export async function listenOnce(): Promise<() => void> {
  throw new Error('Voice input is not available in this build yet');
}
