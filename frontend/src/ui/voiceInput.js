/* Browser speech-to-text for both composers. It uses the platform Web
   Speech API when available, so audio is processed by the browser's
   configured speech service and never sent through the chat endpoint. */
var activeRecognition = null;
var activeButton = null;
var activeInput = null;

function notify(message) {
  if (typeof window.showToast === "function") window.showToast(message);
  else if (typeof console !== "undefined") console.info("[voiceInput]", message);
}
function syncInput(input) {
  if (!input) return;
  if (typeof window.autoResize === "function") window.autoResize(input);
  if (input.id === "topicInput" && typeof window.updateStartBtn === "function") window.updateStartBtn();
  if (input.id === "chatInputArea" && typeof window.updateSendBtn === "function") window.updateSendBtn();
}
function setListening(button, listening) {
  if (!button) return;
  button.classList.toggle("is-listening", listening);
  button.setAttribute("aria-pressed", String(listening));
  button.setAttribute("aria-label", listening ? "Stop voice input" : "Voice input");
  button.title = listening ? "Stop listening" : "Voice input";
}
function stopVoiceInput() {
  if (activeRecognition) { try { activeRecognition.stop(); } catch (_) {} }
}
function startVoiceInput(button, input) {
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    notify("Voice input is not supported in this browser.");
    return;
  }
  if (activeRecognition) {
    if (activeButton === button) { stopVoiceInput(); return; }
    stopVoiceInput();
  }
  var original = input.value;
  var recognition = new Recognition();
  activeRecognition = recognition;
  activeButton = button;
  activeInput = input;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = (document.documentElement.lang || navigator.language || "en-US");
  recognition.onstart = function () { setListening(button, true); };
  recognition.onresult = function (event) {
    var finalText = "";
    var interimText = "";
    for (var i = 0; i < event.results.length; i++) {
      var text = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += text + " "; else interimText += text;
    }
    input.value = (original + (original && (finalText || interimText) ? " " : "") + finalText + interimText).replace(/\s+/g, " ");
    syncInput(input);
  };
  recognition.onerror = function (event) {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") notify("Microphone permission is needed for voice input.");
    else if (event.error !== "aborted" && event.error !== "no-speech") notify("Voice input could not start. Please try again.");
  };
  recognition.onend = function () {
    if (activeRecognition === recognition) { activeRecognition = null; activeButton = null; activeInput = null; }
    setListening(button, false);
    syncInput(input);
  };
  try { recognition.start(); } catch (_) { notify("Voice input is already starting. Please try again."); }
}

function wireVoiceInput() {
  [["topicMicBtn", "topicInput"], ["chatMicBtn", "chatInputArea"]].forEach(function (pair) {
    var button = document.getElementById(pair[0]);
    var input = document.getElementById(pair[1]);
    if (!button || !input || button.dataset.voiceWired === "1") return;
    button.dataset.voiceWired = "1";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", function () { startVoiceInput(button, input); });
  });
}

if (typeof window !== "undefined") {
  window.wireVoiceInput = wireVoiceInput;
  window.stopVoiceInput = stopVoiceInput;
}
export { wireVoiceInput, stopVoiceInput };
