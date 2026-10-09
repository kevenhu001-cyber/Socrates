import { useCallback, useRef, useState } from 'react';
import { useChatStore } from '@socrates/chat';
import { listenOnce, listenSupported, speakText, stopSpeaking } from './speech';
import { appStringsNow } from './strings';

/** Owns speech playback and microphone state for the composer. */
export function useVoiceInput() {
  const [listening, setListening] = useState(false);
  const listenStop = useRef<(() => void) | null>(null);

  const stopComposerAudio = useCallback(() => {
    stopSpeaking();
    listenStop.current?.();
    listenStop.current = null;
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    listenStop.current?.();
    listenStop.current = null;
    setListening(false);
    stopSpeaking();
  }, []);

  const speak = useCallback((text: string) => {
    void speakText(text).catch((error) => {
      useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().speechFailed);
    });
  }, []);

  const toggleListen = useCallback(() => {
    if (listening) {
      listenStop.current?.();
      listenStop.current = null;
      setListening(false);
      return;
    }
    void listenOnce({
      onResult: (text, final) => {
        if (final) {
          if (text) useChatStore.getState().setDraft(text);
          listenStop.current = null;
          setListening(false);
        }
      },
      onError: (message) => {
        listenStop.current = null;
        setListening(false);
        useChatStore.getState().setStatus('error', message);
      },
    }).then((stop) => {
      listenStop.current = stop;
      setListening(true);
    }).catch((error) => {
      useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().voiceInputFailed);
    });
  }, [listening]);

  return {
    listening,
    voiceInputSupported: listenSupported(),
    speak,
    toggleListen,
    stopComposerAudio,
    reset,
  };
}
