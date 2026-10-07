/* Web speech: SpeechSynthesis for read-aloud, SpeechRecognition for
 * voice input. Both are best-effort browser APIs — absence disables the
 * corresponding button, never the chat. */

export function speechAvailable(): boolean {
  return typeof globalThis.speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function listenSupported(): boolean {
  const w = globalThis as typeof globalThis & {
    SpeechRecognition?: new () => unknown;
    webkitSpeechRecognition?: new () => unknown;
  };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export async function speakText(text: string): Promise<void> {
  if (!speechAvailable()) throw new Error('Speech is unavailable in this browser');
  globalThis.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 4000));
  await new Promise<void>((resolve, reject) => {
    // Headless/odd engines may never fire end/error — never hang the caller.
    const guard = setTimeout(resolve, 30_000);
    utterance.onend = () => { clearTimeout(guard); resolve(); };
    utterance.onerror = () => { clearTimeout(guard); reject(new Error('Speech failed')); };
    globalThis.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  try { globalThis.speechSynthesis?.cancel(); } catch { /* no synthesizer */ }
}

interface RecognitionInstance {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export async function listenOnce(input: {
  onResult(text: string, final: boolean): void;
  onError(message: string): void;
}): Promise<() => void> {
  const w = globalThis as typeof globalThis & {
    SpeechRecognition?: new () => RecognitionInstance;
    webkitSpeechRecognition?: new () => RecognitionInstance;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) throw new Error('Voice input is unavailable in this browser');
  const recognition = new Ctor();
  // Final results only: sending partial transcripts to the composer would
  // overwrite the user's own typing mid-utterance.
  recognition.interimResults = false;
  try { recognition.lang = globalThis.navigator?.language || 'en-US'; } catch { recognition.lang = 'en-US'; }
  recognition.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    const transcript = [...Array(last.length)].map((_, i) => last[i]?.transcript || '').join('');
    input.onResult(transcript, true);
  };
  recognition.onerror = (event) => input.onError(event.error || 'Recognition failed');
  recognition.onend = () => input.onResult('', true);
  recognition.start();
  return () => { try { recognition.stop(); } catch { /* already stopped */ } };
}
