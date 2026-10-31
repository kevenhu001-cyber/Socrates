import { create } from 'zustand';

export type VoiceInputPhase = 'idle' | 'starting' | 'listening' | 'processing';

interface VoiceInputSnapshot {
  phase: VoiceInputPhase;
  surface: 'chat' | 'topic' | null;
  label: string;
  elapsedSeconds: number;
  transcript: string;
  level: number;
  wavePhase: number;
}

interface VoiceInputActions {
  begin: (surface: 'chat' | 'topic', label: string) => void;
  setPhase: (phase: VoiceInputPhase, label?: string) => void;
  setElapsedSeconds: (elapsedSeconds: number) => void;
  setTranscript: (transcript: string) => void;
  setWaveform: (level: number, wavePhase: number) => void;
  reset: () => void;
}

export type VoiceInputStore = VoiceInputSnapshot & VoiceInputActions;

const initialSnapshot: VoiceInputSnapshot = {
  phase: 'idle',
  surface: null,
  label: '',
  elapsedSeconds: 0,
  transcript: '',
  level: 0,
  wavePhase: 0,
};

export const useVoiceInputStore = create<VoiceInputStore>((set) => ({
  ...initialSnapshot,
  begin: (surface, label) => set({ ...initialSnapshot, phase: 'starting', surface, label }),
  setPhase: (phase, label) => set((state) => ({ ...state, phase, label: label ?? state.label })),
  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),
  setTranscript: (transcript) => set({ transcript }),
  setWaveform: (level, wavePhase) => set({ level, wavePhase }),
  reset: () => set(initialSnapshot),
}));
