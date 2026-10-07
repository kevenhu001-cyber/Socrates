/* Platform speech: read-aloud (everywhere) + voice input (where the
 * platform offers recognition). The default build has neither. */

export function speechAvailable(): boolean {
  return false;
}

export function listenSupported(): boolean {
  return false;
}

export async function speakText(_text: string): Promise<void> {
  throw new Error('Speech is unavailable on this platform');
}

export function stopSpeaking(): void {}

export async function listenOnce(_input: {
  onResult(text: string, final: boolean): void;
  onError(message: string): void;
}): Promise<() => void> {
  throw new Error('Voice input is unavailable on this platform');
}
