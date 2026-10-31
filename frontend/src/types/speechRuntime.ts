export interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }> & { isFinal: boolean }>;
}
export interface SpeechRecognitionRuntime {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export interface VoiceSession {
  surface: 'chat' | 'topic';
  stream: MediaStream | null;
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  audioData: Uint8Array<ArrayBuffer> | null;
  animationFrame: number;
  timerId: number;
  stopFallbackId: number;
  startedAt: number;
  wavePhase: number;
  lastWavePublishAt: number;
  recognition: SpeechRecognitionRuntime | null;
  finalTranscript: string;
  interimTranscript: string;
  error: string;
  stopRequested: boolean;
  stopping: boolean;
  inserted: boolean;
  discard: boolean;
  finished: boolean;
}
