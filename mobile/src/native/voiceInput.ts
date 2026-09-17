import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ExpoSpeechRecognitionErrorCode,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';
import type { Language } from '../i18n';

export type VoiceInputStatus = 'idle' | 'starting' | 'listening' | 'stopping';

export type VoiceInputErrorCode =
  | 'unsupported'
  | 'not-allowed'
  | 'no-speech'
  | 'service-not-allowed'
  | 'network'
  | 'audio-capture'
  | 'language-not-supported'
  | 'unknown';

type UseVoiceInputOptions = {
  language: Language;
  existingText: string;
  onChangeText: (value: string) => void;
  onError?: (code: VoiceInputErrorCode) => void;
};

type SpeechRecognitionModule = typeof import('expo-speech-recognition')['ExpoSpeechRecognitionModule'];

/**
 * The recognizer is an optional native module in Expo Go. Resolve it only
 * when the hook is used so the rest of the app can still open there and show
 * a normal "unsupported" message until a development/standalone build is
 * installed.
 */
function getSpeechRecognitionModule(): SpeechRecognitionModule | null {
  try {
    return require('expo-speech-recognition').ExpoSpeechRecognitionModule as SpeechRecognitionModule;
  } catch {
    return null;
  }
}

function toErrorCode(code: ExpoSpeechRecognitionErrorCode | string | undefined): VoiceInputErrorCode {
  switch (code) {
    case 'not-allowed':
    case 'no-speech':
    case 'service-not-allowed':
    case 'network':
    case 'audio-capture':
    case 'language-not-supported':
      return code;
    case 'unsupported':
      return 'unsupported';
    default:
      return 'unknown';
  }
}

function resultText(event: ExpoSpeechRecognitionResultEvent) {
  return (event.results || [])
    .map((result) => result.transcript.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * Native equivalent of frontend/src/ui/voiceInput.js.
 *
 * The hook owns the entire recognition session so both the landing composer
 * and the chat composer have the same permission, interim-result, stop, and
 * append-to-draft behavior. `expo-speech-recognition` maps to Android's
 * SpeechRecognizer and to the Web Speech API when the Expo web target is used.
 */
export function useVoiceInput({ language, existingText, onChangeText, onError }: UseVoiceInputOptions) {
  const [status, setStatus] = useState<VoiceInputStatus>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [volume, setVolume] = useState(0.16);

  const sessionRef = useRef(0);
  const activeRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const cancelledRef = useRef(false);
  const startedAtRef = useRef(0);
  const baseTextRef = useRef(existingText);
  const finalPartsRef = useRef<string[]>([]);
  const interimRef = useRef('');
  const errorRef = useRef<VoiceInputErrorCode | null>(null);
  const changeTextRef = useRef(onChangeText);
  const errorHandlerRef = useRef(onError);

  useEffect(() => {
    changeTextRef.current = onChangeText;
    errorHandlerRef.current = onError;
  }, [onChangeText, onError]);

  const finalize = useCallback((sessionId: number) => {
    if (!activeRef.current || sessionRef.current !== sessionId) return;

    activeRef.current = false;
    const error = errorRef.current;
    const transcript = finalPartsRef.current.join(' ').trim();
    const shouldCommit = !cancelledRef.current && Boolean(transcript);

    sessionRef.current = 0;
    setStatus('idle');
    setLiveTranscript('');
    setElapsedSeconds(0);
    setVolume(0.16);

    if (shouldCommit) {
      const existing = baseTextRef.current.trim();
      changeTextRef.current(`${existing ? `${existing} ` : ''}${transcript}`);
    }

    if (error && (error !== 'no-speech' || !stopRequestedRef.current)) {
      errorHandlerRef.current?.(error);
    }
  }, []);

  useEffect(() => {
    const speechModule = getSpeechRecognitionModule();
    if (!speechModule) return undefined;

    const startSubscription = speechModule.addListener('start', () => {
      if (!activeRef.current) return;
      setStatus('listening');
      if (!startedAtRef.current) startedAtRef.current = Date.now();
    });
    const resultSubscription = speechModule.addListener('result', (event) => {
      if (!activeRef.current) return;
      const text = resultText(event);
      if (event.isFinal) {
        if (text) finalPartsRef.current = [...finalPartsRef.current, text];
        interimRef.current = '';
      } else {
        interimRef.current = text;
      }
      setLiveTranscript([...finalPartsRef.current, interimRef.current].filter(Boolean).join(' '));
    });
    const errorSubscription = speechModule.addListener('error', (event) => {
      if (!activeRef.current) return;
      errorRef.current = toErrorCode(event.error);
    });
    const volumeSubscription = speechModule.addListener('volumechange', (event) => {
      if (!activeRef.current) return;
      // The native event ranges from -2 to 10. Keep the visualizer stable
      // across microphone implementations and clamp noisy device values.
      setVolume(Math.min(1, Math.max(0.08, (event.value + 2) / 12)));
    });
    const endSubscription = speechModule.addListener('end', () => {
      const sessionId = sessionRef.current;
      if (sessionId) finalize(sessionId);
    });

    return () => {
      if (activeRef.current) {
        activeRef.current = false;
        try {
          speechModule.abort();
        } catch {
          // The native recognizer may already be torn down during navigation.
        }
      }
      startSubscription.remove();
      resultSubscription.remove();
      errorSubscription.remove();
      volumeSubscription.remove();
      endSubscription.remove();
    };
  }, [finalize]);

  useEffect(() => {
    if (status === 'idle') return undefined;
    const timer = setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
      }
    }, 250);
    return () => clearInterval(timer);
  }, [status]);

  const stop = useCallback(() => {
    if (!activeRef.current || status === 'stopping') return;
    stopRequestedRef.current = true;
    setStatus('stopping');
    try {
      const speechModule = getSpeechRecognitionModule();
      if (!speechModule) {
        finalize(sessionRef.current);
        return;
      }
      speechModule.stop();
    } catch {
      finalize(sessionRef.current);
    }
  }, [finalize, status]);

  const cancel = useCallback(() => {
    if (!activeRef.current) return;
    cancelledRef.current = true;
    activeRef.current = false;
    sessionRef.current = 0;
    setStatus('idle');
    setLiveTranscript('');
    setElapsedSeconds(0);
    setVolume(0.16);
    try {
      getSpeechRecognitionModule()?.abort();
    } catch {
      // Nothing else to clean up when the recognizer is already inactive.
    }
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current) {
      stop();
      return;
    }

    const sessionId = Date.now();
    sessionRef.current = sessionId;
    activeRef.current = true;
    cancelledRef.current = false;
    stopRequestedRef.current = false;
    errorRef.current = null;
    baseTextRef.current = existingText;
    finalPartsRef.current = [];
    interimRef.current = '';
    startedAtRef.current = Date.now();
    setLiveTranscript('');
    setElapsedSeconds(0);
    setVolume(0.16);
    setStatus('starting');

    try {
      const speechModule = getSpeechRecognitionModule();
      if (!speechModule) {
        errorRef.current = 'unsupported';
        finalize(sessionId);
        return;
      }
      const permission = await speechModule.requestMicrophonePermissionsAsync();
      if (!permission.granted) {
        errorRef.current = 'not-allowed';
        finalize(sessionId);
        return;
      }
      if (!speechModule.isRecognitionAvailable()) {
        errorRef.current = 'unsupported';
        finalize(sessionId);
        return;
      }
      speechModule.start({
        lang: language === 'zh' ? 'zh-CN' : 'en-US',
        continuous: true,
        interimResults: true,
        maxAlternatives: 1,
        addsPunctuation: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
      });
    } catch {
      errorRef.current = 'unknown';
      finalize(sessionId);
    }
  }, [existingText, finalize, language, stop]);

  return {
    status,
    liveTranscript,
    elapsedSeconds,
    volume,
    start,
    stop,
    cancel,
  };
}
