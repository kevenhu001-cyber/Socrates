import { insertComposerText } from '../react/composer-input/controller.ts';

let activeRecognition = null;
let activeSurface = null;

function speechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function setListening(surface, listening) {
  document.querySelectorAll('[data-action="toggleSpeechInput"]').forEach(function (button) {
    var matches = button.getAttribute('data-action-arg') === surface;
    button.classList.toggle('is-listening', !!(listening && matches));
    button.setAttribute('aria-pressed', listening && matches ? 'true' : 'false');
  });
  var primary = document.getElementById(surface === 'topic' ? 'startBtn' : 'sendBtn');
  if (primary) primary.classList.toggle('is-listening', !!listening);
}

function notify(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
}

export function toggleSpeechInput(surface) {
  var nextSurface = surface === 'chat' ? 'chat' : 'topic';
  if (activeRecognition) {
    try { activeRecognition.stop(); } catch (_) {}
    return;
  }

  var Recognition = speechRecognitionConstructor();
  if (!Recognition) {
    notify('Voice input is not supported in this browser.');
    return;
  }

  var recognition = new Recognition();
  activeRecognition = recognition;
  activeSurface = nextSurface;
  recognition.lang = document.documentElement.lang || navigator.language || 'en-US';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = function () { setListening(nextSurface, true); };
  recognition.onresult = function (event) {
    var transcript = '';
    for (var index = event.resultIndex || 0; index < event.results.length; index += 1) {
      transcript += event.results[index][0]?.transcript || '';
    }
    if (transcript.trim()) insertComposerText(nextSurface, transcript.trim());
  };
  recognition.onerror = function (event) {
    if (event.error !== 'aborted' && event.error !== 'no-speech') {
      notify('Voice input could not start. Please check microphone access.');
    }
  };
  recognition.onend = function () {
    setListening(activeSurface || nextSurface, false);
    activeRecognition = null;
    activeSurface = null;
  };

  try {
    recognition.start();
  } catch (_) {
    activeRecognition = null;
    activeSurface = null;
    setListening(nextSurface, false);
  }
}
