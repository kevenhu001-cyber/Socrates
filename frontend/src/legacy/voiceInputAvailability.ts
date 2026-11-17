/**
 * Capability probe for dictation. Kept in its own module so the composer can
 * ask before the (lazy) recognition engine is loaded.
 *
 * getUserMedia only exists in a secure context; the recognition API is a
 * separate capability and deserves its own message.
 */
export type VoiceInputUnavailable = 'https' | 'unsupported';

export function voiceInputUnavailableReason(): VoiceInputUnavailable | null {
  if (typeof window === 'undefined') return 'unsupported';
  if (window.isSecureContext === false) return 'https';
  const win = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  if (!win.SpeechRecognition && !win.webkitSpeechRecognition) return 'unsupported';
  return null;
}
