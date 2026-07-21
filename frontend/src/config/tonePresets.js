/* config/tonePresets.js — AI tone/voice presets.
 *
 * Lets the user choose how the AI speaks. Each preset modifies the
 * VOICE section of the system prompt. Presets are stored in
 * localStorage as "socrates-tone" and exposed via window.tonePreset.
 *
 * Available presets:
 *   "default"    — The default careful scholar voice (existing behavior)
 *   "friendly"   — Warm, approachable, slightly more conversational
 *   "efficient"  — Direct, concise, minimal preamble
 *   "professional" — Formal, technical, precise
 *   "candid"     — Straightforward, honest, no flattery
 *   "tutor"      — Patient, encouraging, Socratic (default for tutor mode)
 */

var TONE_KEY = "socrates-tone";
var _currentTone = "default";

/* Tone definitions: each has a label, description, and a voice snippet
   that replaces the VOICE section of CHAT_SYSTEM_PROMPT. */
var TONE_PRESETS = {
  "default": {
    label: "Default",
    labelZh: "默认",
    description: "Careful, scholarly, precise",
    descriptionZh: "严谨、学者风格、精确",
    voice: `A scholar reasons out loud. They weigh considerations, acknowledge what is uncertain, and arrive at a conclusion that follows from the reasoning rather than asserting facts and stopping there. A scholar has a point of view when the evidence supports one, and states it plainly.

A scholar is not chatty, not warm, and not eager to please. They are precise, careful, and willing to think slowly when the question deserves it. They do not pad, do not summarize at the end, do not offer platitudes, and do not perform helpfulness.`,
  },
  "friendly": {
    label: "Friendly",
    labelZh: "友好",
    description: "Warm, approachable, conversational",
    descriptionZh: "温暖、亲切、对话式",
    voice: `You are warm and approachable. You speak like a knowledgeable friend who genuinely enjoys helping. You are encouraging without being saccharine, and you explain things in a way that feels like a conversation, not a lecture.

You are precise but not stiff. You can use analogies and everyday language to make complex ideas accessible. You never condescend or oversimplify, but you also never hide behind jargon when a simpler word would do.`,
  },
  "efficient": {
    label: "Efficient",
    labelZh: "高效",
    description: "Direct, concise, no preamble",
    descriptionZh: "直接、简洁、无铺垫",
    voice: `You are direct and efficient. You answer the question at hand with minimal preamble. You do not summarize, pad, or repeat yourself. You state the answer, provide the reasoning if needed, and stop.

You are not rude, but you are not chatty. Every sentence carries information. If the user wants elaboration, they can ask. You assume the user is competent and wants the fastest path to the answer.`,
  },
  "professional": {
    label: "Professional",
    labelZh: "专业",
    description: "Formal, technical, precise",
    descriptionZh: "正式、技术性、精确",
    voice: `You are a technical expert writing a formal document. You use precise terminology, cite sources where relevant, and structure your response logically. You maintain a professional distance and never use casual language or contractions.

Your tone is appropriate for a technical report or a business memo. You are thorough, structured, and fact-oriented. You avoid opinions and stick to verifiable information.`,
  },
  "candid": {
    label: "Candid",
    labelZh: "坦诚",
    description: "Straightforward, honest, no flattery",
    descriptionZh: "直率、诚实、不奉承",
    voice: `You are candid and straightforward. You do not soften the truth or add unnecessary pleasantries. When the user is wrong, you say so plainly. When you do not know, you say so without hedging.

You are not rude, but you value honesty over politeness. You assume the user wants the unvarnished truth and can handle direct feedback. You avoid phrases like "great question" or "that is a good point" unless you genuinely mean them.`,
  },
};

/* Load the saved tone preset. */
function loadTonePreset() {
  try {
    var saved = localStorage.getItem(TONE_KEY);
    if (saved && TONE_PRESETS[saved]) {
      _currentTone = saved;
      return _currentTone;
    }
  } catch (e) { /* ignore */ }
  _currentTone = "default";
  return _currentTone;
}

/* Set and persist the tone preset. */
function setTonePreset(tone) {
  if (!TONE_PRESETS[tone]) return;
  _currentTone = tone;
  try { localStorage.setItem(TONE_KEY, tone); } catch (e) { /* ignore */ }
  /* Sync the UI if the settings modal is open. */
  syncTonePresetUI();
}

/* Get the current tone preset id. */
function getTonePreset() {
  return _currentTone;
}

/* Get the voice snippet for the current tone. */
function getToneVoice() {
  var preset = TONE_PRESETS[_currentTone];
  return preset ? preset.voice : TONE_PRESETS["default"].voice;
}

/* Get all available presets as an array of { id, label, labelZh, description, descriptionZh }. */
function getAvailablePresets() {
  return Object.keys(TONE_PRESETS).map(function (id) {
    var p = TONE_PRESETS[id];
    return { id: id, label: p.label, labelZh: p.labelZh, description: p.description, descriptionZh: p.descriptionZh };
  });
}

/* Sync the tone preset UI in the settings overlay. */
function syncTonePresetUI() {
  var container = document.getElementById("tonePresetOptions");
  if (!container) return;
  var btns = container.querySelectorAll(".tone-preset-btn");
  btns.forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.tone === _currentTone);
  });
}

/* Render the tone preset radio buttons into the settings overlay. */
function renderTonePresets() {
  var container = document.getElementById("tonePresetOptions");
  if (!container) return;
  var presets = getAvailablePresets();
  var lang = (typeof window._currentLang === "string" && window._currentLang.indexOf("zh") === 0) ? "zh" : "en";
  container.innerHTML = presets.map(function (p) {
    var label = lang === "zh" ? (p.labelZh || p.label) : p.label;
    var desc = lang === "zh" ? (p.descriptionZh || p.description) : p.description;
    return '<button class="tone-preset-btn' + (p.id === _currentTone ? ' active' : '') + '" data-tone="' + p.id + '" onclick="window.setTonePreset(\'' + p.id + '\')">' +
      '<span class="tone-preset-label">' + label + '</span>' +
      '<span class="tone-preset-desc">' + desc + '</span>' +
      '</button>';
  }).join("");
}

/* Export for window bridge. */
if (typeof window !== "undefined") {
  window.TONE_PRESETS = TONE_PRESETS;
  window.loadTonePreset = loadTonePreset;
  window.setTonePreset = setTonePreset;
  window.getTonePreset = getTonePreset;
  window.getToneVoice = getToneVoice;
  window.getAvailablePresets = getAvailablePresets;
  window.renderTonePresets = renderTonePresets;
  window.syncTonePresetUI = syncTonePresetUI;
}

export {
  TONE_PRESETS,
  loadTonePreset,
  setTonePreset,
  getTonePreset,
  getToneVoice,
  getAvailablePresets,
  renderTonePresets,
  syncTonePresetUI,
};
