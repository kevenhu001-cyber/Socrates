/* chat/messages.js — extracted from main.js (B4/B5 batch).
 * Authoritative message append path. Zero-behavior-change lift.
 * Main.js-local side effects (renderAssistantHTML, saveCurrentSession,
 * updateChatStats, updateKB) resolve via window.* at call time to
 * avoid circular imports.
 */
import { stateStore } from '../state/store.js';
import { hideNewReplyPill } from '../ui/scrollPill.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { appendLocalMemory } from '../storage/localMemory.js';
import { formatMsg } from '../render/markdown.js';
import { stripCitationMarkers } from '../render/helpers.js';
import { getActiveProvider } from '../pickers.js';
import { generateId } from '../util/ids.js';
import { streamRetryViewport } from './turnState.js';
import { updateChatStats } from './stats.js';
import { updateKB } from '../ui/knowledgePanel.js';

function _renderAssistantHtml(text) {
  if (typeof window !== 'undefined' && typeof window.renderAssistantHTML === 'function') {
    return window.renderAssistantHTML(text);
  }
  return formatMsg(text);
}

/* Post-commit bookkeeping (localStorage mirror, session save, stats, KB
   sidebar) is heavyweight relative to an interaction frame: it parses and
   re-serializes up to ~1 MB of localStorage JSON and builds the full
   session-save payload. When the session id already exists none of it
   feeds back into this task, so it runs one macrotask later — after the
   just-committed bubble has painted — and a burst of addMessage calls
   (history replay, rapid sends) coalesces into a single flush.
   First-message sends keep the synchronous path: doSave() stamps
   currentSessionId and the streaming placeholder created later in the
   same task captures that id as its session owner. */
var _postCommitQueue = [];
var _postCommitScheduled = false;
function _flushPostCommit() {
  _postCommitScheduled = false;
  var queue = _postCommitQueue;
  _postCommitQueue = [];
  for (var i = 0; i < queue.length; i++) {
    try { queue[i](); } catch (_) {}
  }
}
function _deferPostCommit(fn) {
  _postCommitQueue.push(fn);
  if (_postCommitScheduled) return;
  _postCommitScheduled = true;
  setTimeout(_flushPostCommit, 0);
}

function _deferAfterPaint(fn) {
  if (typeof requestAnimationFrame !== 'function') return _deferPostCommit(fn);
  requestAnimationFrame(function () { setTimeout(fn, 0); });
}

/* Flush the coalesced post-commit queue synchronously. Best-effort hook
   for pagehide/beforeunload so a deferred saveCurrentSession still gets
   a chance to run when the tab closes mid-turn. */
export function flushPostCommit() {
  if (_postCommitScheduled) _flushPostCommit();
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', function () { try { flushPostCommit(); } catch (_) {} });
  window.addEventListener('beforeunload', function () { try { flushPostCommit(); } catch (_) {} });
}

export function addMessage(role, text, type, actions, attachmentsArg, internalOptions) {
  internalOptions = internalOptions || {};
  /* User sending a message = explicitly wants to follow the conversation. */
  if (role === 'user') {
    streamRetryViewport.clearPendingViewport();
    stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: false });
    hideNewReplyPill();
    /* The previous answer's viewport reserve is retired by the send-time
       anchor (chat/turnAnchor.ts) *after* it has glided past it. Clearing
       it here collapsed the scroll range before the new turn's reserve was
       stamped, so the browser clamped scrollTop and the transcript jumped
       by the reserve height on the send frame. */
    try {
      var _activeTurnList = document.getElementById('msgList');
      if (_activeTurnList) delete _activeTurnList.__socratesTurnViewportOwner;
    } catch (_) {}
  }
  /* P1.1 — push to the authoritative stateStore.read("messages") first; the DOM
     is just a downstream view. */
  var clientId = 'msg-' + generateId();

  /* Use renderAssistantHTML for assistant messages containing scaffold
     XML tags so every Tutor scaffold, including the math-book blocks,
     is converted to its typed widget instead of raw XML text. */
  var html;
  var _displaySource = String(text || '');
  if (role === 'assistant') {
    /* P_strip-citations — assistant bubbles never show [1]/[2] search
       markers, including this direct-add path (re-explains, replayed
       turns). User messages keep whatever the user typed. */
    _displaySource = stripCitationMarkers(_displaySource);
  }
  if (role === 'user') {
    /* The React row renders rawText as an escaped text node for its first
       paint. Markdown parsing and DOMPurify are deliberately kept out of the
       send interaction; the sanitized HTML replaces it after that paint. */
    html = null;
  } else if (role === 'assistant' && /<(quiz|example|practice|definition|step|flashcard|proof|theorem|key-point|derivation)\b/i.test(_displaySource)) {
    try { html = _renderAssistantHtml(_displaySource); } catch (_) { html = formatMsg(_displaySource); }
  } else {
    html = formatMsg(_displaySource);
  }
  var modelInfo = null;
  if (role === 'assistant') {
    var mp = getActiveProvider();
    if (mp) modelInfo = { label: mp.label || mp.model || '', model: mp.model || '' };
  }
  /* P_attachments — keep the attachments array on the in-memory entry
   * so saveCurrentSession round-trips it. We normalise to the same
   * shape persistMessageList() expects. */
  var atts = Array.isArray(attachmentsArg) ? attachmentsArg.slice(0, 20) : [];
  var entry = { clientId: clientId, role: role, rawText: String(text || ''), html: html, type: type || null, actions: actions || null, modelInfo: modelInfo, attachments: atts };
  if (!internalOptions.deferAppend) {
    stateStore.dispatch({ type: 'session/append-message', payload: entry });
  }
  /* First-turn persistence used to build and serialize the entire session in
     this click task solely so the following assistant placeholder could own a
     stable id. Allocate that id synchronously, then leave the expensive save
     payload and network work to the post-paint queue below — except for the
     very first turn, which still saves synchronously: deferring it leaves a
     window where closing the tab loses the turn entirely (the id exists but
     no save was ever issued). */
  var allocatedFirstTurnId = false;
  if (role === 'user' && !stateStore.read('currentSessionId') &&
      stateStore.read('topic') && typeof window !== 'undefined' && window.CURRENT_USER) {
    stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: generateId() });
    allocatedFirstTurnId = true;
  }
  var postCommitStarted = false;
  function runPostCommit(publish) {
    if (postCommitStarted) return;
    postCommitStarted = true;
    if (publish) publishReactChatRuntime({ type: 'message-added', messageId: clientId });
    if (role === 'user' && _displaySource) _deferAfterPaint(function () {
      var messages = stateStore.read('messages');
      var index = messages.findIndex(function (message) { return message && message.clientId === clientId; });
      if (index < 0) return;
      var formatted;
      try { formatted = formatMsg(_displaySource); } catch (_) { return; }
      stateStore.dispatch({
        type: 'session/update-message', index: index, clientId: clientId,
        patch: { html: formatted },
      });
      publishReactChatRuntime({ type: 'message-updated', messageId: clientId });
    });
    /* First turns keep the synchronous save so the session exists
       server-side even if the tab closes before the next macrotask. */
    if (allocatedFirstTurnId) bookkeeping();
    else _deferPostCommit(bookkeeping);
  }

  /* React owns the visible message list — the state push above is the
     authoritative write and React re-renders from the snapshot. The
     side effects below mirror the legacy DOM path's bookkeeping. */
  /* React's MessageList owns the post-commit scroll for finalized user
     messages. The legacy rAF write used to run before React committed and
     then race the smooth send scroll, causing a one-frame snap during
     composer collapse. Keep no second scroll owner here. */
  var bookkeeping = function () {
    try {
      if (role === 'user' || role === 'assistant') {
        try { appendLocalMemory(role, text); } catch (_) {}
      }
      if (stateStore.read('phase') === 'chat' || (stateStore.read('topic') && stateStore.read('kbNodes').length)) {
        try { if (typeof window.saveCurrentSession === 'function') window.saveCurrentSession(); } catch (_) {}
      }
      if (role === 'assistant') {
        try { updateChatStats(); } catch (_) {}
      }
      /* Update KB: if user is answering substantive questions, mark current node progress */
      if (role === 'user' && stateStore.read('kbNodes')[stateStore.read('currentNode')] && stateStore.read('kbNodes')[stateStore.read('currentNode')].status === 'blank') {
        var progressedKbNodes = stateStore.read('kbNodes').map(function (node, index) {
          return index === stateStore.read('currentNode') ? Object.assign({}, node, { status: 'fuzzy', questions: (node.questions || 0) + 1 }) : node;
        });
        stateStore.dispatch({ type: 'state/set', key: 'kbNodes', value: progressedKbNodes });
        try { updateKB(); } catch (_) {}
      }
    } catch (_) {}
  };
  if (internalOptions.deferAppend) {
    return {
      clientId: clientId,
      entry: entry,
      commitPaired: function () { runPostCommit(false); },
      commitFallback: function () {
        stateStore.dispatch({ type: 'session/append-message', payload: entry });
        runPostCommit(true);
      },
    };
  }
  runPostCommit(true);
  /* Return the clientId so callers (e.g. startSession) can patch this
     entry in place once async work like buildMessageContent finishes —
     without re-running the side effects above. */
  return clientId;
}
