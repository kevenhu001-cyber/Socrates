// src/ui/suggestions.js — prompt-suggestion engine.
//
// Two surfaces pull from this module:
//   1. The landing composer (above #topicInputWrap) — always live.
//   2. The in-session composer (above #chatInputWrap) — only while the
//      conversation is empty. The moment the user sends the first turn
//      the chip row retires; we do not surface follow-up chips during
//      the rest of the conversation. The picker comment further down
//      ("when empty enough to benefit from a nudge") captures the same
//      intent — the previous implementation honoured it in spirit but
//      forgot the gate, which produced the "flicker during chat" bug.
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

/* Per-session picker offset so a fresh session doesn't always show the same
   two suggestions. Captured once at module load and then treated as
   immutable — `pickFromLibrary` reads it but never advances it, so repeated
   renders within a session are stable (no chip-text churn / flicker). */
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

/* Pick two library prompts at the session-stable offset. This is a PURE
   function of (lang, _pickerOffset): calling it twice in the same session
   returns the same two prompts. The previous implementation advanced
   `_pickerOffset` on every call as a side effect, so each render produced a
   different pair — which changed the render signature and replayed the
   fade-in animation on every chat-runtime event (the "疯狂刷新" flicker).
   Keeping it pure means the row is stable for the life of the session. */
function pickFromLibrary(lang) {
  var n = PROMPT_LIBRARY.length;
  var firstIdx = _pickerOffset % n;
  var first = PROMPT_LIBRARY[firstIdx];
  /* Step by a coprime-ish stride so the two chips are never adjacent and
     never identical, without needing a mutation loop. */
  var secondIdx = (firstIdx + 3) % n;
  if (secondIdx === firstIdx) secondIdx = (firstIdx + 1) % n;
  var second = PROMPT_LIBRARY[secondIdx];
  return [
    { id: first.id, prompt: (first[lang] || first.en), icon: first.icon },
    { id: second.id, prompt: (second[lang] || second.en), icon: second.icon },
  ];
}

/* Public selector. Returns an array of two suggestions, derived when
   possible and otherwise picked from the library at the session-stable
   offset. The result is stable across calls within a session (same lang,
   same conversation state) so repeated renders never churn the chip text. */
export function pickSuggestions(messages, opts) {
  opts = opts || {};
  var lang = getLang();
  var contextual = deriveFromConversation(messages, lang);
  if (contextual) {
    return [
      { id: "follow-up", prompt: contextual, icon: "follow" },
      pickFromLibrary(lang)[0],
    ].slice(0, 2);
  }
  return pickFromLibrary(lang);
}

/* Gate the in-session chip row. The design intent — "when the running
   conversation is empty enough to benefit from a nudge" — means: only
   render chat-suggestions before the first user turn is sent. Once the
   user has produced even one message, the row retires for the rest of
   the conversation so the composer area stops flashing follow-ups on
   every React commit (streamed chunks, tool-run status, lang flips,
   etc., all re-publish socrates:chat-runtime-changed and used to
   cycle the chip prompts). */
function chatSurfaceShouldRender(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return true;
  }
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    if (m && m.role === "user") return false;
  }
  return true;
}

/* SVG glyph cache so the renderer doesn't rebuild the same icon
   string on every render. Keys are icon ids, values are SVG markup.

   All glyphs share one drawing system so the row reads as a set:
   • 24×24 viewBox, artwork inset to a ~16px optical box (x/y 4–20).
   • stroke-only, 1.6px, round caps + round joins, no fills except
     tiny dot accents rendered with fill="currentColor".
   • coordinates snapped to 0.5 steps where practical so the 1.6px
     stroke stays crisp instead of straddling a sub-pixel boundary.
   Redrawn 2026-08-30 for consistent weight and geometry. */
var _SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
function _glyph(body) { return _SVG_OPEN + body + '</svg>'; }
var ICON_CACHE = {
  /* briefing — a briefcase: body + lid + handle. */
  briefing: _glyph('<rect x="4" y="8" width="16" height="11" rx="2"/><path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8"/><path d="M4 13h16"/>'),
  /* inbox — a tray with the classic notch where mail drops in. */
  inbox: _glyph('<path d="M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M4 13h4l1.5 2.5h5L16 13h4"/>'),
  /* notes — a document with a folded corner and text lines. */
  notes: _glyph('<path d="M6 4h8l4 4v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M14 4v4h4"/><path d="M8.5 12.5h7M8.5 15.5h7M8.5 18h4.5"/>'),
  /* code — angle brackets with a slash, the universal "code" glyph. */
  code: _glyph('<path d="m8.5 8-4 4 4 4"/><path d="m15.5 8 4 4-4 4"/><path d="M13.5 6.5 10.5 17.5"/>'),
  /* database — a cylinder with two seams. */
  database: _glyph('<ellipse cx="12" cy="6" rx="6.5" ry="2.5"/><path d="M5.5 6v6c0 1.38 2.91 2.5 6.5 2.5s6.5-1.12 6.5-2.5V6"/><path d="M5.5 12v6c0 1.38 2.91 2.5 6.5 2.5s6.5-1.12 6.5-2.5v-6"/>'),
  /* regex — .* wildcard over an asterisk and a caret anchor. */
  regex: _glyph('<path d="M12 5v7"/><path d="m9 6.5 6 4M15 6.5l-6 4"/><path d="M6.5 17.5h4M14 17.5h3.5"/><circle cx="12" cy="17.5" r=".7" fill="currentColor"/>'),
  /* teach — a graduation cap with a tassel. */
  teach: _glyph('<path d="M12 5 3.5 9 12 13l8.5-4z"/><path d="M7 11v4c0 1.3 2.24 2.4 5 2.4s5-1.1 5-2.4v-4"/><path d="M20.5 9v4"/>'),
  /* quiz — a question mark inside a circle. */
  quiz: _glyph('<circle cx="12" cy="12" r="8"/><path d="M9.8 9.6a2.2 2.2 0 0 1 4.3.6c0 1.5-2.1 1.9-2.1 3.4"/><circle cx="12" cy="16.3" r=".7" fill="currentColor"/>'),
  /* compare — two panels weighed against each other. */
  compare: _glyph('<rect x="4" y="6" width="6.5" height="12" rx="1"/><rect x="13.5" y="6" width="6.5" height="12" rx="1"/><path d="M10.5 12h3"/>'),
  /* summarize — descending text lines (a condensed list). */
  summarize: _glyph('<path d="M5 6h14M5 10h14M5 14h10M5 18h6"/>'),
  /* spark — a four-point sparkle with two small accent stars. */
  spark: _glyph('<path d="M11 4c0 3.3-1.7 5-5 5 3.3 0 5 1.7 5 5 0-3.3 1.7-5 5-5-3.3 0-5-1.7-5-5z"/><path d="M17.5 13.5c0 1.4-.6 2-2 2 1.4 0 2 .6 2 2 0-1.4.6-2 2-2-1.4 0-2-.6-2-2z"/>'),
  /* pen — a slanted pen over its nib, drawing a stroke. */
  pen: _glyph('<path d="m5 19 1-3.5L15.5 6l3 3L9 18.5z"/><path d="m13.5 8 3 3"/><path d="M5 19l1.2-1.2"/>'),
  /* globe — a sphere with an equator and a meridian. */
  globe: _glyph('<circle cx="12" cy="12" r="8"/><path d="M4 12h16"/><path d="M12 4c2.2 2.1 3.4 5 3.4 8s-1.2 5.9-3.4 8c-2.2-2.1-3.4-5-3.4-8s1.2-5.9 3.4-8z"/>'),
  /* scale — a balance: center post, beam, and two hanging pans. */
  scale: _glyph('<path d="M12 5v14"/><path d="M8.5 19h7"/><path d="M5 8h14"/><path d="M5 8l-2.2 4.2a2.6 2.6 0 0 0 4.4 0z"/><path d="M19 8l-2.2 4.2a2.6 2.6 0 0 0 4.4 0z"/>'),
  /* follow — a forward arrow, used for contextual follow-ups. */
  follow: _glyph('<path d="M4.5 12h13.5"/><path d="m12.5 6.5 5.5 5.5-5.5 5.5"/>'),
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
  btn.className = (surface === "topic" ? "home-idea " : "") + "suggestion-chip suggestion-enter";
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

   Structural dedup: the chat-runtime-changed event fires on every
   React commit (katex-ready, session-load, tool-run status updates
   during streaming, message-added, langchange, etc.), so without
   this guard `pickFromLibrary` advances `_pickerOffset` on every
   pass and the chip *text* changes between renders. The diff in
   `renderNow` keys off the prompt string, so a fresh prompt was
   treated as a brand-new chip — every chip got the .suggestion-
   enter class and the fade-in replayed on every commit, producing
   the "疯狂刷新" flicker. Comparing the prompt signature before
   touching the DOM keeps the row stable when nothing meaningful
   changed.

   First-call optimization: when the container is empty (initial
   paint or right after a view swap that just revealed a freshly
   built container), render synchronously so the user never sees an
   empty chip row. Subsequent renders batch via rAF so a flood of
   state-synced events only paints once. */
var _pendingRenders = new WeakMap();
var _lastSignature = new WeakMap();
function scheduleRender(container, suggestions, surface) {
  if (!container) return;
  /* Use a control char as the join separator so two prompts that
     concatenate to the same string (e.g. "ab" + "" vs "a" + "b")
     still produce different signatures. */
  var SIG_SEP = "\x01";
  var sig = surface + SIG_SEP + suggestions.map(function (s) {
    return s && s.prompt ? s.prompt : "";
  }).join(SIG_SEP);
  var prev = _lastSignature.get(container);
  if (prev === sig && container.firstChild) {
    /* Same chips, same order, already painted — skip the DOM pass
       entirely so no enter/leave animation can replay. */
    var pending = _pendingRenders.get(container);
    if (pending) {
      try { cancelAnimationFrame(pending); } catch (_) {}
      _pendingRenders.delete(container);
    }
    return;
  }
  _lastSignature.set(container, sig);
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
    if (surface === "chat" && !chatSurfaceShouldRender(messages)) {
      /* Conversation has started — retire the chip row. Clear once
         so any stale chips from the empty-session paint disappear,
         then drop the cached signature so a later empty-session
         re-entry paints a fresh row. */
      if (container.firstChild || _lastSignature.has(container)) {
        try { container.replaceChildren(); } catch (_) {}
        _lastSignature.delete(container);
        var pending = _pendingRenders.get(container);
        if (pending) {
          try { cancelAnimationFrame(pending); } catch (_) {}
          _pendingRenders.delete(container);
        }
      }
      return;
    }
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

/* High-frequency chat-runtime events that CANNOT change which
   suggestions should show: they fire many times per second while a
   reply streams in (one `stream-delta` per chunk) or while a tool run
   ticks its status. Suggestions are gated on "is there a user turn
   yet", which these events never flip, so re-running the render engine
   on them only risks flicker and wastes frames. Skipping them at the
   source is what actually kills the "疯狂刷新" during a conversation. */
var HIGH_FREQUENCY_EVENTS = {
  "stream-delta": true,
  "tool-run-updated": true,
  "stream-started": true,
};

function onMessagesChanged(event) {
  /* Ignore the streaming firehose. `event` is the CustomEvent from
     `socrates:chat-runtime-changed`; its detail.type tells us the
     reason. Anything not in the high-frequency set (message-added,
     state-synced, message-deleted, rollback, langchange, initial
     paint with no event) proceeds to a normal re-derive. */
  try {
    var type = event && event.detail && event.detail.type;
    if (type && HIGH_FREQUENCY_EVENTS[type]) return;
  } catch (_) {}
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
