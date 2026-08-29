// src/ui/suggestions.js — prompt-suggestion engine.
//
// Two surfaces pull from this module:
//   1. The landing composer (above #topicInputWrap).
//   2. The in-session composer (above #chatInputWrap), when the running
//      conversation is empty enough to benefit from a nudge.
//
// Each surface renders two chips. The selection rules:
//   • If there is at least one user turn in the active conversation,
//     derive follow-up prompts from the latest user + assistant turn.
//   • Otherwise pick two prompts from the built-in library, biased by
//     the user's locale so Chinese UI gets Chinese suggestions and
//     English UI gets English ones.
//
// The module emits DOM updates through a small rAF-coalesced renderer
// (see #scheduleRender) so a flood of events — the React message list
// committing, lang flipping, a fresh user bubble — does not flash or
// jank. New chips fade in over ~180ms; removed chips fade out the
// same way so the row never snaps.

import { focusComposer, setComposerMarkdown } from '../react/composer-input/controller.ts';

/* Built-in prompt library, keyed by category. Each category has an
   English (`en`) and Chinese (`zh`) prompt; the renderer picks the
   current locale's copy. Library size is intentionally small — the
   picker rotates through it on a stable per-session offset so the
   same two prompts never repeat back-to-back. */
const PROMPT_LIBRARY = [
  {
    id: 'daily-briefing',
    category: 'productivity',
    icon: 'briefing',
    en: 'Give me a morning briefing — top three things I should know today',
    zh: '给我一份晨间简报 — 列出今天最该知道的三件事',
  },
  {
    id: 'inbox-triage',
    category: 'productivity',
    icon: 'inbox',
    en: 'Help me triage my inbox: I have a stack of unread emails and need a plan',
    zh: '帮我分一下收件箱：有一堆未读邮件需要一份处理计划',
  },
  {
    id: 'meeting-notes',
    category: 'productivity',
    icon: 'notes',
    en: 'Turn my meeting notes into a clean recap with action items',
    zh: '把会议笔记整理成一份干净的纪要，附上待办事项',
  },
  {
    id: 'code-review',
    category: 'engineering',
    icon: 'code',
    en: 'Review this code for bugs and suggest concrete improvements',
    zh: '审查这段代码，找 bug 并给出可执行的改进建议',
  },
  {
    id: 'sql-explainer',
    category: 'engineering',
    icon: 'database',
    en: 'Explain what this SQL query does, step by step',
    zh: '逐行解释这条 SQL 在做什么',
  },
  {
    id: 'regex-builder',
    category: 'engineering',
    icon: 'regex',
    en: 'Help me write a regex that matches …',
    zh: '帮我写一条匹配 …… 的正则表达式',
  },
  {
    id: 'concept-teach',
    category: 'learning',
    icon: 'teach',
    en: 'Teach me [topic] like I am a curious teenager — start with the intuition',
    zh: '像给好奇的青少年讲 [topic] 一样教我 — 先讲直觉',
  },
  {
    id: 'quiz-me',
    category: 'learning',
    icon: 'quiz',
    en: 'Quiz me on [topic] — give me five questions and grade my answers',
    zh: '考考我 [topic] — 给我五道题，并批改我的回答',
  },
  {
    id: 'compare',
    category: 'analysis',
    icon: 'compare',
    en: 'Compare [A] vs [B] — pros, cons, and when to pick each',
    zh: '对比 [A] 与 [B] — 各自优缺点，以及什么时候该选哪个',
  },
  {
    id: 'summarize',
    category: 'analysis',
    icon: 'summarize',
    en: 'Summarize the attached document into five bullet points',
    zh: '把附件文档压缩成五条要点',
  },
  {
    id: 'brainstorm',
    category: 'creative',
    icon: 'spark',
    en: 'Brainstorm ten angles for a short story about …',
    zh: '围绕 …… 给我十个短篇故事的切入角度',
  },
  {
    id: 'rewrite',
    category: 'writing',
    icon: 'pen',
    en: 'Rewrite this paragraph to sound more confident and concise',
    zh: '把这段话改写得更自信、更精炼',
  },
  {
    id: 'translate-tone',
    category: 'writing',
    icon: 'globe',
    en: 'Translate this passage into natural, idiomatic English',
    zh: '把这段文字翻译成自然、地道的中文',
  },
  {
    id: 'decision-frame',
    category: 'productivity',
    icon: 'scale',
    en: 'I am weighing two options — help me build a simple decision frame',
    zh: '我在两个选项之间犹豫 — 帮我搭一个简单的决策框架',
  },
];

/* Categories that translate well when paired with the latest assistant
   turn. Used by `deriveFromConversation` below to convert a previous
   exchange into a follow-up suggestion. */
const FOLLOW_UP_TEMPLATES = {
  en: [
    'Summarize what we just covered into a checklist I can act on',
    'What are the most common counter-arguments to what you said, and how would you respond?',
    'Give me a worked example that illustrates the same idea in a different domain',
    'Now critique your own answer — what is weakest about it?',
    'Turn this into a five-question quiz I can use to test myself',
    'Rewrite the answer for a complete beginner',
  ],
  zh: [
    '把我们刚聊的内容整理成一份可执行的清单',
    '针对你刚才的回答，最常见的反驳是什么？你会如何回应？',
    '换一个领域给一个例子，说明同一个思路',
    '请你自我反驳 — 刚才回答里最薄弱的地方是什么？',
    '把它改成五道自测题，让我检验自己是否真的懂了',
    '把它改写成完全零基础的人也能听懂的版本',
  ],
};

/* Per-session picker offset so the same two suggestions don't repeat
   back-to-back. The Math.random call below is OK here because this
   module is loaded once per session and the offset is captured
   immediately. */
let _pickerOffset = 0;
try {
  _pickerOffset = Math.floor(Math.random() * PROMPT_LIBRARY.length);
} catch (_) {
  _pickerOffset = 0;
}

function getLang() {
  try {
    var lang = (typeof window !== "undefined" && window._currentLang) || "en";
    return lang === "zh" ? "zh" : "en";
  } catch (_) {
    return "en";
  }
}

/* Try to derive a contextual follow-up from the most recent assistant
   turn. Returns null if there is nothing meaningful to follow up on
   (the renderer will then fall back to the random library). */
function deriveFromConversation(messages, lang) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  var lastAssistant = null;
  for (var i = messages.length - 1; i >= 0; i--) {
    if (messages[i] && messages[i].role === "assistant" && (messages[i].rawText || messages[i].text)) {
      lastAssistant = messages[i];
      break;
    }
  }
  if (!lastAssistant) return null;
  var raw = String(lastAssistant.rawText || lastAssistant.text || "").trim();
  if (raw.length < 40) return null;
  var templates = FOLLOW_UP_TEMPLATES[lang] || FOLLOW_UP_TEMPLATES.en;
  var idx = (raw.length + (lastAssistant.clientId || "").length) % templates.length;
  return templates[idx];
}

/* Pick two library prompts at a session-stable offset, avoiding the
   one we just used. Returns an array of {id, prompt, icon} objects. */
function pickFromLibrary(lang, excludeIds) {
  excludeIds = excludeIds || [];
  var n = PROMPT_LIBRARY.length;
  var first = PROMPT_LIBRARY[(_pickerOffset) % n];
  var secondIdx = (_pickerOffset + 3 + (excludeIds.length ? 1 : 0)) % n;
  var second = PROMPT_LIBRARY[secondIdx];
  while (second && second.id === first.id) {
    secondIdx = (secondIdx + 1) % n;
    second = PROMPT_LIBRARY[secondIdx];
  }
  if (typeof _pickerOffset === "number") {
    _pickerOffset = (_pickerOffset + 2) % n;
  }
  return [
    { id: first.id, prompt: (first[lang] || first.en), icon: first.icon },
    { id: second.id, prompt: (second[lang] || second.en), icon: second.icon },
  ];
}

/* Public selector. Returns an array of two suggestions, derived when
   possible and otherwise randomly chosen from the library. */
export function pickSuggestions(messages, opts) {
  opts = opts || {};
  var lang = getLang();
  var contextual = deriveFromConversation(messages, lang);
  if (contextual) {
    return [
      { id: "follow-up", prompt: contextual, icon: "follow" },
      ...pickFromLibrary(lang),
    ].slice(0, 2);
  }
  return pickFromLibrary(lang);
}

/* SVG glyph cache so the renderer doesn't rebuild the same icon
   string on every render. Keys are icon ids, values are SVG markup. */
var ICON_CACHE = {
  briefing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v13H6a2 2 0 0 1-2-2z"/><path d="M16 8h2.5A1.5 1.5 0 0 1 20 9.5v7a2 2 0 0 1-2 2h-2"/><path d="M7 8h6M7 11h6M7 14h4"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 13.5 6 6.2A1.5 1.5 0 0 1 7.4 5.2h9.2a1.5 1.5 0 0 1 1.4 1L20.5 13.5"/><path d="M3.5 13.5h4l1.2 2.2h6.6l1.2-2.2h4v3.9a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6z"/></svg>',
  notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h9l4 4v12a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V5.5A1.5 1.5 0 0 1 6 4z"/><path d="M14 4v4h4"/><path d="M9 12h7M9 15h7M9 18h5"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 8-5 4 5 4M15 8l5 4-5 4"/></svg>',
  database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6"/><path d="M5 11.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6"/></svg>',
  regex: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 4v16M7 8l-3 4 3 4M12 16h6"/></svg>',
  teach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9.5 12 5l9 4.5L12 14Z"/><path d="M7 11.5v4.2c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4.2"/></svg>',
  quiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5"/><circle cx="12" cy="16" r=".7" fill="currentColor"/></svg>',
  compare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h7v12H4z"/><path d="M13 6h7v12h-7z"/><path d="M11 12h2"/></svg>',
  summarize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14M5 10h14M5 15h9"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v6M12 14v6M4 12h6M14 12h6M6.3 6.3l4.2 4.2M13.5 13.5l4.2 4.2M17.7 6.3l-4.2 4.2M10.5 13.5l-4.2 4.2"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 20 4-1 11-11-3-3L5 16Z"/><path d="m14 6 3 3"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 4 5.5 4 8.5s-1.5 6-4 8.5M12 3.5c-2.5 2.5-4 5.5-4 8.5s1.5 6 4 8.5"/></svg>',
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v16M5 8h14M5 8l-2 6h4zM19 8l-2 6h4z"/></svg>',
  follow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
};

function iconMarkup(iconId) {
  return ICON_CACHE[iconId] || ICON_CACHE.follow;
}

/* The renderer keeps an `aria-label` translation through window.t()
   so screen readers hear the locale-correct label even though the
   prompts themselves are already localized. */
function labelFor(key, fallback) {
  try {
    if (typeof window !== "undefined" && typeof window.t === "function") {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (_) {}
  return fallback;
}

/* Build a single <button> element. Using createElement rather than
   innerHTML avoids re-parsing the whole list on every update. */
function buildButton(suggestion, surface) {
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "home-idea suggestion-chip suggestion-enter";
  btn.setAttribute("data-home-prompt", suggestion.prompt || "");
  btn.setAttribute("data-surface", surface);
  btn.setAttribute("aria-label", labelFor("home.idea.label", "Suggestion"));
  var icon = document.createElement("span");
  icon.className = "home-idea-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = iconMarkup(suggestion.icon || "follow");
  var text = document.createElement("span");
  text.className = "home-idea-text";
  text.textContent = suggestion.prompt || "";
  btn.appendChild(icon);
  btn.appendChild(text);
  return btn;
}

/* Wire a surface's chips: the chip click commits the prompt into the
   correct composer (topic for landing, chat for in-session). */
function wireSurface(container, surface) {
  if (!container || container.dataset.wired === "true") return;
  container.dataset.wired = "true";
  container.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-home-prompt]");
    if (!btn) return;
    var prompt = btn.getAttribute("data-home-prompt") || "";
    if (!prompt) return;
    setComposerMarkdown(surface, prompt);
    focusComposer(surface);
  });
}

/* Schedule one DOM render per frame regardless of how many state
   events arrive in the same tick. The RAF guard prevents the
   "stutter-then-flash" pattern that happens when React commits and
   the suggestion engine race for the same frame.

   First-call optimization: when the container is empty (initial
   paint or right after a view swap that just revealed a freshly
   built container), render synchronously so the user never sees an
   empty chip row. Subsequent renders batch via rAF so a flood of
   state-synced events only paints once. */
var _pendingRenders = new WeakMap();
function scheduleRender(container, suggestions, surface) {
  if (!container) return;
  var pendingRender = _pendingRenders.get(container);
  if (!container.firstChild) {
    if (pendingRender) {
      try { cancelAnimationFrame(pendingRender); } catch (_) {}
      _pendingRenders.delete(container);
    }
    renderNow(container, suggestions, surface);
    return;
  }
  if (pendingRender) {
    try { cancelAnimationFrame(pendingRender); } catch (_) {}
  }
  var frameId = requestAnimationFrame(function () {
    _pendingRenders.delete(container);
    renderNow(container, suggestions, surface);
  });
  _pendingRenders.set(container, frameId);
}

function renderNow(container, suggestions, surface) {
  if (!container) return;
  /* Diff by id so chips that are still relevant don't get torn down.
     Removed chips get the .suggestion-leave class first; the next
     rAF removes them from the DOM after the fade completes. */
  var existing = new Map();
  Array.from(container.querySelectorAll(".suggestion-chip")).forEach(function (el) {
    existing.set(el.getAttribute("data-home-prompt") || "", el);
  });
  var seenPrompts = new Set();
  var orderedNodes = [];
  suggestions.forEach(function (s) {
    var prompt = s.prompt || "";
    seenPrompts.add(prompt);
    var node = existing.get(prompt);
    if (!node) {
      node = buildButton(s, surface);
      node.classList.add("suggestion-enter");
      requestAnimationFrame(function () {
        node.classList.remove("suggestion-enter");
      });
    } else {
      existing.delete(prompt);
      /* Drop the enter animation if the node was reused so the chip
         doesn't replay its fade-in every time the list rerenders. */
      node.classList.remove("suggestion-enter");
    }
    orderedNodes.push(node);
  });
  /* Anything still in `existing` after the loop is a chip that no
     longer belongs. Fade it out, then remove on the next rAF. */
  existing.forEach(function (el) {
    el.classList.add("suggestion-leave");
    requestAnimationFrame(function () {
      try { el.parentNode && el.parentNode.removeChild(el); } catch (_) {}
    });
  });
  /* Re-attach in the new order. appendChild on an existing node
     moves it without recreating it, preserving focus / animation
     state. */
  orderedNodes.forEach(function (node) {
    container.appendChild(node);
  });
}

/* Public entry point — `messages` is whatever slice of the chat
   store the caller wants the engine to consider (state.messages for
   chat, [] for landing). The engine handles both surfaces with the
   same code path; only the DOM target and the composer they write
   to differ. */
export function renderSuggestions(surface, messages) {
  try {
    var container = document.querySelector(
      surface === "chat"
        ? ".chat-suggestions"
        : ".home-ideas"
    );
    if (!container) return;
    wireSurface(container, surface);
    var suggestions = pickSuggestions(messages, {});
    scheduleRender(container, suggestions, surface);
  } catch (_) {}
}

/* Hook into the React message store + lang switch so suggestions
   re-render whenever the conversation grows or the UI language
   changes. Each trigger fires renderSuggestions on both surfaces so
   the chat composer stays in sync when the user just sent the first
   message and the landing screen is about to disappear. */
function onMessagesChanged() {
  var state = (typeof window !== "undefined" && window.state) || null;
  var messages = state && Array.isArray(state.messages) ? state.messages : [];
  renderSuggestions("topic", []);
  renderSuggestions("chat", messages);
}

function onLangChange() {
  /* Lang change is a no-op on already-rendered chips (the prompt text
     is part of the chip itself, so a re-render is the right move).
     The CSS .suggestion-enter transition handles the swap without a
     flash. */
  onMessagesChanged();
}

let _wired = false;
export function initSuggestions() {
  if (_wired) return;
  _wired = true;
  /* Re-render whenever React commits a message-list change. The
     event is namespaced under window so we don't collide with the
     legacy publish path. */
  try {
    if (typeof window !== "undefined") {
      window.addEventListener("socrates:chat-runtime-changed", onMessagesChanged);
    }
  } catch (_) {}
  try {
    document.addEventListener("socrates:langchange", onLangChange);
  } catch (_) {}
  /* Initial paint — call twice so both surfaces render on first load. */
  renderSuggestions("topic", []);
  renderSuggestions("chat", []);
}

/* Replace the legacy initHomeIdeas entry point with the new engine.
   The old function only wired click handlers; it can stay around so
   older imports don't break, but main.js now prefers initSuggestions. */
export function initHomeIdeas() {
  initSuggestions();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSuggestions, { once: true });
} else {
  initSuggestions();
}
