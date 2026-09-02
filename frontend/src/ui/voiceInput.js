import { getComposerMarkdown, insertComposerText } from '../react/composer-input/controller.ts';

let activeSession = null;

function speechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function copy(key, english, chinese) {
  try {
    if (typeof window.t === 'function') {
      const translated = window.t(key);
      if (translated && translated !== key) return translated;
    }
  } catch (_) {}
  return document.documentElement.lang === 'zh' ? chinese : english;
}

function wrapForSurface(surface) {
  return document.getElementById(surface === 'topic' ? 'topicInputWrap' : 'chatInputWrap');
}

function mobileMicForSurface(surface) {
  return document.getElementById(surface === 'topic' ? 'topicMobileMicBtn' : 'chatMobileMicBtn');
}

function setListening(surface, listening) {
  const primary = document.getElementById(surface === 'topic' ? 'startBtn' : 'sendBtn');
  if (primary) {
    primary.classList.toggle('is-listening', !!listening);
    primary.setAttribute('aria-pressed', listening ? 'true' : 'false');
  }

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

function notify(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
}

function stopTracks(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return;
  try {
    stream.getTracks().forEach(function (track) {
      try { track.stop(); } catch (_) {}
    });
  } catch (_) {}
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
    if (error && error.name === 'OverconstrainedError') {
      return mediaDevices.getUserMedia({ audio: true });
    }
    throw error;
  }
}

function createRecordingBar(session) {
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

  const stopButton = document.createElement('button');
  stopButton.className = 'voice-recording-stop';
  stopButton.type = 'button';
  stopButton.dataset.voiceStop = 'true';
  stopButton.setAttribute('aria-label', copy('voice.stop', 'Stop voice input', '停止语音输入'));
  stopButton.title = copy('voice.stop', 'Stop voice input', '停止语音输入');
  stopButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';
  stopButton.addEventListener('click', stopSpeechInput);

  bar.appendChild(indicator);
  bar.appendChild(copyWrap);
  bar.appendChild(wave);
  bar.appendChild(stopButton);
  wrap.appendChild(bar);
  session.bar = bar;
  return bar;
}

function setRecordingLabel(session, value) {
  const label = session.bar && session.bar.querySelector('[data-voice-label]');
  if (label) label.textContent = value;
}

function updateRecordingTimer(session) {
  const timer = session.bar && session.bar.querySelector('[data-voice-timer]');
  if (!timer) return;
  const elapsed = session.startedAt
    ? Math.max(0, Math.floor((performance.now() - session.startedAt) / 1000))
    : 0;
  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, '0');
  timer.textContent = `${minutes}:${seconds}`;
}

function updateLiveTranscript(session) {
  const live = session.bar && session.bar.querySelector('[data-voice-live]');
  if (!live) return;
  const value = `${session.finalTranscript} ${session.interimTranscript}`.trim();
  live.textContent = value;
}

function renderWaveform(session, level) {
  if (!session.bar) return;
  const bars = session.bar.querySelectorAll('.voice-recording-wave > span');
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

function readAudioLevel(session) {
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

function animateWaveform(session) {
  if (activeSession !== session || !session.bar) return;
  renderWaveform(session, readAudioLevel(session));
  session.animationFrame = window.requestAnimationFrame(function () {
    animateWaveform(session);
  });
}

function setupAudioMeter(session) {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
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
      if (resume && typeof resume.catch === 'function') resume.catch(function () {});
    }
  } catch (_) {
    /* Recognition remains useful if a browser exposes a microphone but not
       the Web Audio analyser. The CSS/phase fallback keeps the affordance
       alive without blocking dictation. */
  }
  animateWaveform(session);
}

function startTimer(session) {
  session.startedAt = performance.now();
  updateRecordingTimer(session);
  session.timerId = window.setInterval(function () {
    updateRecordingTimer(session);
  }, 250);
}

function setSessionError(session, error) {
  session.error = error || 'unknown';
}

function cleanupAudio(session) {
  stopTracks(session.stream);
  if (session.audioContext && typeof session.audioContext.close === 'function') {
    try {
      const close = session.audioContext.close();
      if (close && typeof close.catch === 'function') close.catch(function () {});
    } catch (_) {}
  }
}

function finishSession(session) {
  if (!session || session.finished) return;
  session.finished = true;

  if (session.animationFrame) window.cancelAnimationFrame(session.animationFrame);
  if (session.timerId) window.clearInterval(session.timerId);
  if (session.stopFallbackId) window.clearTimeout(session.stopFallbackId);

  cleanupAudio(session);
  setListening(session.surface, false);
  if (session.bar && session.bar.parentNode) session.bar.remove();
  if (activeSession === session) activeSession = null;

  const transcript = session.finalTranscript.trim();
  if (transcript && !session.inserted) {
    session.inserted = true;
    const existing = getComposerMarkdown(session.surface).trim();
    insertComposerText(session.surface, `${existing ? ' ' : ''}${transcript}`);
  }

  if (session.error === 'not-allowed' || session.error === 'service-not-allowed') {
    notify(copy('voice.permission', 'Please allow microphone access to use voice input.', '请允许麦克风权限后使用语音输入。'));
  } else if (session.error === 'no-speech' && !transcript && !session.stopRequested) {
    notify(copy('voice.noSpeech', 'No speech detected.', '没有检测到语音。'));
  } else if (session.error && session.error !== 'aborted' && session.error !== 'no-speech') {
    notify(copy('voice.error', 'Voice input could not start. Please check microphone access.', '语音输入启动失败，请检查麦克风权限。'));
  }
}

function collectRecognitionResult(session, event) {
  const results = event && event.results ? event.results : [];
  const finalParts = [];
  const interimParts = [];
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

function wireRecognition(session, recognition) {
  session.recognition = recognition;
  recognition.lang = document.documentElement.lang || navigator.language || 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = function () {
    if (session.startedAt === 0) startTimer(session);
    setListening(session.surface, true);
    setRecordingLabel(session, copy('voice.listening', 'Listening…', '正在聆听…'));
  };
  recognition.onresult = function (event) {
    collectRecognitionResult(session, event);
  };
  recognition.onerror = function (event) {
    setSessionError(session, event && event.error);
  };
  recognition.onend = function () {
    finishSession(session);
  };
}

async function startSpeechInput(surface) {
  const Recognition = speechRecognitionConstructor();
  if (!Recognition) {
    notify(copy('voice.unsupported', 'Voice input is not supported in this browser.', '当前浏览器不支持语音输入。'));
    return;
  }

  const session = {
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
    if (error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
      setSessionError(session, 'not-allowed');
    } else if (error && error.name === 'NotFoundError') {
      setSessionError(session, 'not-allowed');
    } else {
      setSessionError(session, error && error.message ? 'unknown' : 'unknown');
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
    session.stopFallbackId = window.setTimeout(function () {
      finishSession(session);
    }, 2500);
  } catch (_) {
    finishSession(session);
  }
  return true;
}

export function toggleSpeechInput(surface) {
  if (activeSession) {
    stopSpeechInput();
    return;
  }
  const nextSurface = surface === 'chat' ? 'chat' : 'topic';
  void startSpeechInput(nextSurface);
}
