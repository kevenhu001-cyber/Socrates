import type { VoiceSession, SpeechRecognitionRuntime, SpeechResultEvent } from "../types/speechRuntime.ts";
import { getComposerMarkdown, insertComposerText } from '../composer/controller.ts';
import { showToast } from './toast.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { createElement } from 'react';
import { renderActionButton } from './actionButton.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";
import type { ActionButtonProps } from '../react/legacy-controls/ActionButton.tsx';


let activeSession: VoiceSession | null = null;

function speechRecognitionConstructor() {
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition || null;
}

function copy(key: string, english: string, chinese: string) {
  try {
    if (typeof browserWindow.t === 'function') {
      const translated = browserWindow.t(key);
      if (translated && translated !== key) return translated;
    }
  } catch (error) { reportSwallow(error, 'ui/voiceInput.ts:16'); }
  return document.documentElement.lang === 'zh' ? chinese : english;
}

/* P_composer-single — one shell, so these resolve to the single ids
   regardless of which surface started the session. The surface argument
   is kept because transcripts still route through the controller's
   per-surface stash. */
function wrapForSurface(surface: VoiceSession['surface']) {
  void surface;
  return document.getElementById('composerInputWrap');
}

function mobileMicForSurface(surface: VoiceSession['surface']) {
  void surface;
  return document.getElementById('composerMicBtn');
}

function setListening(surface: VoiceSession['surface'], listening: boolean) {
  /* P_composer-primary-split — only the microphone is a dictation control.
     The primary button is submit-only, so it must not carry the
     .is-listening state or an aria-pressed toggle: that made a screen
     reader announce the send control as a pressed dictation button. */
  const mobileMic = mobileMicForSurface(surface);
  if (mobileMic) {
    mobileMic.classList.toggle('is-listening', !!listening);
    mobileMic.setAttribute('aria-pressed', listening ? 'true' : 'false');
  }

  const wrap = wrapForSurface(surface);
  if (wrap) {
    wrap.classList.toggle('voice-recording-active', !!listening);
    if (listening) wrap.setAttribute('data-voice-recording', 'true');
    else wrap.removeAttribute('data-voice-recording');
  }
}

function notify(message: unknown) {
  showToast(message);
}

function stopTracks(stream: MediaStream | null) {
  if (!stream || typeof stream.getTracks !== 'function') return;
  try {
    stream.getTracks().forEach(function (track: { stop: () => void; }) {
      try { track.stop(); } catch (error) { reportSwallow(error, 'ui/voiceInput.ts:61', 'expected'); }
    });
  } catch (error) { reportSwallow(error, 'ui/voiceInput.ts:63', 'expected'); }
}

async function requestMicStream() {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') return null;

  try {
    return await mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (error) {
    /* A few browsers reject advanced constraints even when microphone
       capture is available. Retry with the portable boolean form, but let
       permission errors surface to the caller. */
    if (error && (error as Error).name === 'OverconstrainedError') {
      return mediaDevices.getUserMedia({ audio: true });
    }
    throw error;
  }
}

function createRecordingBar(session: VoiceSession) {
  const wrap = wrapForSurface(session.surface);
  if (!wrap) return null;

  const bar = document.createElement('div');
  bar.className = 'voice-recording-bar';
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  bar.setAttribute('aria-atomic', 'true');

  const indicator = document.createElement('span');
  indicator.className = 'voice-recording-indicator';
  indicator.setAttribute('aria-hidden', 'true');

  const copyWrap = document.createElement('span');
  copyWrap.className = 'voice-recording-copy';

  const label = document.createElement('span');
  label.className = 'voice-recording-label';
  label.dataset.voiceLabel = 'true';
  label.textContent = copy('voice.listening', 'Listening…', '正在聆听…');

  const timer = document.createElement('span');
  timer.className = 'voice-recording-timer';
  timer.dataset.voiceTimer = 'true';
  timer.textContent = '0:00';

  const liveTranscript = document.createElement('span');
  liveTranscript.className = 'voice-recording-live';
  liveTranscript.dataset.voiceLive = 'true';
  liveTranscript.setAttribute('aria-hidden', 'true');

  copyWrap.appendChild(label);
  copyWrap.appendChild(timer);
  copyWrap.appendChild(liveTranscript);

  const wave = document.createElement('span');
  wave.className = 'voice-recording-wave';
  wave.dataset.voiceWave = 'true';
  wave.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 26; index += 1) {
    const waveBar = document.createElement('span');
    waveBar.style.setProperty('--voice-bar-height', '4px');
    wave.appendChild(waveBar);
  }

  /* Discard affordance — left-edge ghost "×". Without it the only way out
     of a recording was committing whatever transcript had accumulated. */
  const cancelHost = document.createElement('span');
  cancelHost.className = 'voice-recording-action-host';
  renderActionButton(cancelHost, {
    type: 'button',
    variant: 'ghost',
    size: 'icon-sm',
    className: 'voice-recording-cancel',
    'data-voice-cancel': 'true',
    'aria-label': copy('voice.cancel', 'Cancel voice input', '取消语音输入'),
    title: copy('voice.cancel', 'Cancel voice input', '取消语音输入'),
    children: createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      createElement('path', { d: 'm6 6 12 12M18 6 6 18' })),
    onClick: cancelSpeechInput,
  } as ActionButtonProps & { 'data-voice-cancel': string });

  const stopHost = document.createElement('span');
  stopHost.className = 'voice-recording-action-host';
  renderActionButton(stopHost, {
    type: 'button',
    variant: 'default',
    size: 'icon-lg',
    className: 'voice-recording-stop rounded-full',
    'data-voice-stop': 'true',
    'aria-label': copy('voice.stop', 'Stop voice input', '停止语音输入'),
    title: copy('voice.stop', 'Stop voice input', '停止语音输入'),
    children: createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      createElement('rect', { x: 7, y: 7, width: 10, height: 10, rx: 2 })),
    onClick: stopSpeechInput,
  } as ActionButtonProps & { 'data-voice-stop': string });

  bar.appendChild(cancelHost);
  bar.appendChild(indicator);
  bar.appendChild(copyWrap);
  bar.appendChild(wave);
  bar.appendChild(stopHost);
  wrap.appendChild(bar);
  session.bar = bar;
  return bar;
}

function setRecordingLabel(session: VoiceSession, value: string) {
  const label = session.bar && session.bar.querySelector('[data-voice-label]');
  if (label) label.textContent = value;
}

function updateRecordingTimer(session: VoiceSession) {
  const timer = session.bar && session.bar.querySelector('[data-voice-timer]');
  if (!timer) return;
  const elapsed = session.startedAt
    ? Math.max(0, Math.floor((performance.now() - session.startedAt) / 1000))
    : 0;
  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, '0');
  timer.textContent = `${minutes}:${seconds}`;
}

function updateLiveTranscript(session: VoiceSession) {
  const live = session.bar && session.bar.querySelector('[data-voice-live]');
  if (!live) return;
  const value = `${session.finalTranscript} ${session.interimTranscript}`.trim();
  live.textContent = value;
}

function renderWaveform(session: VoiceSession, level: number) {
  if (!session.bar) return;
  const bars = session.bar.querySelectorAll<HTMLElement>('.voice-recording-wave > span');
  if (!bars.length) return;

  const normalized = Math.min(1, Math.max(0, (level - 0.012) * 9));
  session.wavePhase += 0.18;
  const center = (bars.length - 1) / 2;
  const spread = Math.max(1, center);

  bars.forEach(function (bar, index) {
    const distance = Math.abs(index - center) / spread;
    const envelope = 1 - distance * 0.58;
    const pulse = 0.58 + Math.abs(Math.sin(session.wavePhase + index * 0.62)) * 0.42;
    const height = 4 + normalized * (7 + envelope * 17) * pulse;
    bar.style.setProperty('--voice-bar-height', `${Math.round(height)}px`);
  });
  session.bar.dataset.voiceLevel = normalized.toFixed(3);
}

function readAudioLevel(session: VoiceSession) {
  if (!session.analyser || !session.audioData) return 0.16;
  try {
    session.analyser.getByteTimeDomainData(session.audioData);
    let sum = 0;
    for (let index = 0; index < session.audioData.length; index += 1) {
      const sample = (session.audioData[index] - 128) / 128;
      sum += sample * sample;
    }
    return Math.sqrt(sum / session.audioData.length);
  } catch (_) {
    return 0.16;
  }
}

function animateWaveform(session: VoiceSession) {
  if (activeSession !== session || !session.bar) return;
  renderWaveform(session, readAudioLevel(session));
  session.animationFrame = browserWindow.requestAnimationFrame(function () {
    animateWaveform(session);
  });
}

function setupAudioMeter(session: VoiceSession) {
  const AudioContextConstructor = browserWindow.AudioContext || browserWindow.webkitAudioContext;
  if (!session.stream || typeof AudioContextConstructor !== 'function') {
    animateWaveform(session);
    return;
  }

  try {
    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78;
    const source = audioContext.createMediaStreamSource(session.stream);
    source.connect(analyser);
    session.audioContext = audioContext;
    session.analyser = analyser;
    session.audioData = new Uint8Array(analyser.fftSize);
    if (audioContext.state === 'suspended' && typeof audioContext.resume === 'function') {
      const resume = audioContext.resume();
      if (resume && typeof resume.catch === 'function') {
        resume.catch((error: unknown) => reportSwallow(error, 'ui/voiceInput.resumeWaveform', 'expected'));
      }
    }
  } catch (_) {
    reportSwallow(_, 'empty catch: ui/voiceInput.ts:273', 'expected');
    /* Recognition remains useful if a browser exposes a microphone but not
       the Web Audio analyser. The CSS/phase fallback keeps the affordance
       alive without blocking dictation. */
  }
  animateWaveform(session);
}

function startTimer(session: VoiceSession) {
  session.startedAt = performance.now();
  updateRecordingTimer(session);
  session.timerId = browserWindow.setInterval(function () {
    updateRecordingTimer(session);
  }, 250);
}

function setSessionError(session: VoiceSession, error: string) {
  session.error = error || 'unknown';
}

function cleanupAudio(session: VoiceSession) {
  stopTracks(session.stream);
  if (session.audioContext && typeof session.audioContext.close === 'function') {
    try {
      const close = session.audioContext.close();
      if (close && typeof close.catch === 'function') {
        close.catch((error: unknown) => reportSwallow(error, 'ui/voiceInput.closeAudioContext', 'expected'));
      }
    } catch (error) { reportSwallow(error, 'ui/voiceInput.ts:278'); }
  }
}

function insertFinalTranscript(session: VoiceSession, transcript: string) {
  if (!transcript || session.inserted || session.discard) return;
  session.inserted = true;
  const existing = getComposerMarkdown((session.surface as 'topic' | 'chat')).trim();
  insertComposerText((session.surface as 'topic' | 'chat'), `${existing ? ' ' : ''}${transcript}`);
}

function notifyFinishedSession(session: VoiceSession, transcript: string) {
  if (session.discard) return;
  if (session.error === 'not-allowed' || session.error === 'service-not-allowed') {
    notify(copy('voice.permission', 'Please allow microphone access to use voice input.', '请允许麦克风权限后使用语音输入。'));
  } else if (session.error === 'no-speech' && !transcript && !session.stopRequested) {
    notify(copy('voice.noSpeech', 'No speech detected.', '没有检测到语音。'));
  } else if (session.error && session.error !== 'aborted' && session.error !== 'no-speech') {
    notify(copy('voice.error', 'Voice input could not start. Please check microphone access.', '语音输入启动失败，请检查麦克风权限。'));
  }
}

function finishSession(session: VoiceSession) {
  if (!session || session.finished) return;
  session.finished = true;

  if (session.animationFrame) browserWindow.cancelAnimationFrame(session.animationFrame);
  if (session.timerId) browserWindow.clearInterval(session.timerId);
  if (session.stopFallbackId) browserWindow.clearTimeout(session.stopFallbackId);

  cleanupAudio(session);
  setListening(session.surface, false);
  if (session.bar && session.bar.parentNode) session.bar.remove();
  if (activeSession === session) activeSession = null;

  const transcript = session.finalTranscript.trim();
  insertFinalTranscript(session, transcript);
  notifyFinishedSession(session, transcript);
}

function collectRecognitionResult(session: VoiceSession, event: SpeechResultEvent) {
  const results = event && event.results ? event.results : [];
  const finalParts: string[] = [];
  const interimParts: string[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const text = result && result[0] && result[0].transcript ? result[0].transcript : '';
    if (!text) continue;
    if (result.isFinal) finalParts.push(text);
    else interimParts.push(text);
  }
  session.finalTranscript = finalParts.join(' ').trim();
  session.interimTranscript = interimParts.join(' ').trim();
  updateLiveTranscript(session);
}

function wireRecognition(session: VoiceSession, recognition: SpeechRecognitionRuntime) {
  session.recognition = recognition;
  let voiceLanguage = 'auto';
  try { voiceLanguage = localStorage.getItem('socrates-voice-language') || 'auto'; } catch (error) { reportSwallow(error, 'ui/voiceInput.ts:331', 'expected'); }
  recognition.lang = voiceLanguage === 'auto' ? (document.documentElement.lang || navigator.language || 'en-US') : voiceLanguage;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = function () {
    if (session.startedAt === 0) startTimer(session);
    setListening(session.surface, true);
    setRecordingLabel(session, copy('voice.listening', 'Listening…', '正在聆听…'));
  };
  recognition.onresult = function (event: SpeechResultEvent) {
    collectRecognitionResult(session, event);
  };
  recognition.onerror = function (event: { error: string }) {
    setSessionError(session, event && event.error);
  };
  recognition.onend = function () {
    finishSession(session);
  };
}

async function startSpeechInput(surface: VoiceSession['surface']) {
  const Recognition = speechRecognitionConstructor();
  if (!Recognition) {
    notify(copy('voice.unsupported', 'Voice input is not supported in this browser.', '当前浏览器不支持语音输入。'));
    return;
  }

  const session: VoiceSession = {
    surface,
    bar: null,
    stream: null,
    audioContext: null,
    analyser: null,
    audioData: null,
    animationFrame: 0,
    timerId: 0,
    stopFallbackId: 0,
    startedAt: 0,
    wavePhase: 0,
    recognition: null,
    finalTranscript: '',
    interimTranscript: '',
    error: '',
    stopRequested: false,
    stopping: false,
    inserted: false,
    discard: false,
    finished: false,
  };
  activeSession = session;
  createRecordingBar(session);
  setListening(surface, true);

  try {
    session.stream = await requestMicStream();
    if (activeSession !== session || session.stopRequested) {
      stopTracks(session.stream);
      return;
    }

    setupAudioMeter(session);
    const recognition = new Recognition();
    wireRecognition(session, recognition);
    if (session.stopRequested) {
      finishSession(session);
      return;
    }
    recognition.start();
  } catch (error) {
    if (error && ((error as Error).name === 'NotAllowedError' || (error as Error).name === 'PermissionDeniedError')) {
      setSessionError(session, 'not-allowed');
    } else if (error && (error as Error).name === 'NotFoundError') {
      setSessionError(session, 'not-allowed');
    } else {
      setSessionError(session, error && (error as Error).message ? 'unknown' : 'unknown');
    }
    finishSession(session);
  }
}

export function stopSpeechInput() {
  const session = activeSession;
  if (!session) return false;
  if (session.stopping) return true;

  session.stopRequested = true;
  session.stopping = true;
  setRecordingLabel(session, copy('voice.processing', 'Processing voice input…', '正在处理语音…'));
  if (!session.recognition) {
    finishSession(session);
    return true;
  }

  try {
    session.recognition.stop();
    session.stopFallbackId = browserWindow.setTimeout(function () {
      finishSession(session);
    }, 2500);
  } catch (_) {
    finishSession(session);
  }
  return true;
}

/* Discard path — abort() drops pending recognition results instead of
   committing them, so nothing reaches the composer. finishSession still
   runs cleanup through the same onend/fallback path as a normal stop. */
export function cancelSpeechInput() {
  const session = activeSession;
  if (!session) return false;
  if (session.stopping) return true;

  session.discard = true;
  session.stopRequested = true;
  session.stopping = true;
  if (!session.recognition) {
    finishSession(session);
    return true;
  }

  try {
    session.recognition.abort();
    session.stopFallbackId = browserWindow.setTimeout(function () {
      finishSession(session);
    }, 1500);
  } catch (_) {
    finishSession(session);
  }
  return true;
}

export function toggleSpeechInput(surface: string) {
  if (activeSession) {
    stopSpeechInput();
    return;
  }
  const nextSurface = surface === 'chat' ? 'chat' : 'topic';
  void startSpeechInput(nextSurface);
}
