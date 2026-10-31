import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Button } from '../ui/shadcn/button';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { useVoiceInputStore } from '../../ui/voiceInput.store.ts';
import { i18n } from '../legacy/gateway.ts';

function formatElapsedTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function VoiceRecordingBar() {
  const phase = useVoiceInputStore((state) => state.phase);
  const label = useVoiceInputStore((state) => state.label);
  const elapsedSeconds = useVoiceInputStore((state) => state.elapsedSeconds);
  const transcript = useVoiceInputStore((state) => state.transcript);
  const level = useVoiceInputStore((state) => state.level);
  const wavePhase = useVoiceInputStore((state) => state.wavePhase);
  const active = phase !== 'idle';
  const cancelLabel = i18n('voice.cancel', 'Cancel voice input');
  const stopLabel = i18n('voice.stop', 'Stop voice input');

  const waveBars = useMemo(() => Array.from({ length: 26 }, (_, index) => {
    const normalized = Math.min(1, Math.max(0, (level - 0.012) * 9));
    const center = 12.5;
    const spread = Math.max(1, center);
    const distance = Math.abs(index - center) / spread;
    const envelope = 1 - distance * 0.58;
    const pulse = 0.58 + Math.abs(Math.sin(wavePhase + index * 0.62)) * 0.42;
    const height = 4 + normalized * (7 + envelope * 17) * pulse;
    return {
      key: index,
      style: { '--voice-bar-height': `${Math.round(height)}px` } as CSSProperties,
    };
  }), [level, wavePhase]);

  if (!active) return null;

  return (
    <div
      className="voice-recording-bar"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-voice-level={Math.min(1, Math.max(0, (level - 0.012) * 9)).toFixed(3)}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="voice-recording-cancel"
        data-voice-cancel="true"
        aria-label={cancelLabel}
        title={cancelLabel}
        onClick={() => {
          void import('../../ui/voiceInput.ts')
            .then(({ cancelSpeechInput }) => cancelSpeechInput())
            .catch((error) => reportSwallow(error, 'react/composer-input.cancelVoiceInput'));
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </Button>
      <span className="voice-recording-indicator" aria-hidden="true" />
      <span className="voice-recording-copy">
        <span className="voice-recording-label" data-voice-label="true">{label}</span>
        <span className="voice-recording-timer" data-voice-timer="true">{formatElapsedTime(elapsedSeconds)}</span>
        <span className="voice-recording-live" data-voice-live="true" aria-hidden="true">{transcript}</span>
      </span>
      <span className="voice-recording-wave" data-voice-wave="true" aria-hidden="true">
        {waveBars.map((bar) => <span key={bar.key} style={bar.style} />)}
      </span>
      <Button
        type="button"
        variant="default"
        size="icon-lg"
        className="voice-recording-stop rounded-full"
        data-voice-stop="true"
        aria-label={stopLabel}
        title={stopLabel}
        onClick={() => {
          void import('../../ui/voiceInput.ts')
            .then(({ stopSpeechInput }) => stopSpeechInput())
            .catch((error) => reportSwallow(error, 'react/composer-input.stopVoiceInput'));
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="2" />
        </svg>
      </Button>
    </div>
  );
}
