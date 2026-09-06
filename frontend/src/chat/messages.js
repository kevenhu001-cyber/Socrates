/* chat/messages.js — extracted from main.js (B4/B5 batch).
 * Authoritative message append path. Zero-behavior-change lift.
 * Main.js-local side effects (renderAssistantHTML, saveCurrentSession,
 * updateChatStats, updateKB) resolve via window.* at call time to
 * avoid circular imports.
 */
import { stateStore } from '../state/store.js';
import { hideNewReplyPill } from '../ui/scrollPill.js';
import { updateMessageSnapshot } from '../ui/messageSnapshot.js';
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

export function addMessage(role, text, type, actions, attachmentsArg) {
  /* User sending a message = explicitly wants to follow the conversation. */
  if (role === 'user') {
    streamRetryViewport.clearPendingViewport();
    stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: false });
    hideNewReplyPill();
    /* The previous answer reserves viewport space so a short reply can stay
       anchored below its prompt. Retire that reserve only when a new turn
       begins; collapsing it earlier makes the completed page jump. */
    for (var _ami = 0; _ami < stateStore.read('messages').length; _ami++) {
      if (stateStore.read('messages')[_ami] && (
        stateStore.read('messages')[_ami]._turnAnchorMinHeight ||
        stateStore.read('messages')[_ami]._turnAnchorMarginTop
      )) {
        updateMessageSnapshot(stateStore.read('messages')[_ami], {
          _turnAnchorMinHeight: undefined,
          _turnAnchorMarginTop: undefined,
          _turnAnchorMode: undefined,
          _turnViewportTarget: undefined
        }, true);
      }
    }
    try {
      var _oldAnchors = document.querySelectorAll('#msgList .turn-viewport-anchor');
      for (var _oai = 0; _oai < _oldAnchors.length; _oai++) {
        _oldAnchors[_oai].classList.remove('turn-viewport-anchor');
        _oldAnchors[_oai].style.minHeight = '';
        _oldAnchors[_oai].style.marginTop = '';
      }
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
  if (role === 'assistant' && /<(quiz|example|practice|definition|step|flashcard|proof|theorem|key-point|derivation)\b/i.test(_displaySource)) {
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
  stateStore.dispatch({ type: 'session/append-message', payload: entry });
  publishReactChatRuntime({ type: 'message-added', messageId: clientId });

  /* React owns the visible message list — the state push above is the
     authoritative write and React re-renders from the snapshot. The
     side effects below mirror the legacy DOM path's bookkeeping. */
  /* React's MessageList owns the post-commit scroll for finalized user
     messages. The legacy rAF write used to run before React committed and
     then race the smooth send scroll, causing a one-frame snap during
     composer collapse. Keep no second scroll owner here. */
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
  /* Return the clientId so callers (e.g. startSession) can patch this
     entry in place once async work like buildMessageContent finishes —
     without re-running the side effects above. */
  return clientId;
}
