/* chat/messages.js — extracted from main.js (B4/B5 batch).
 * Authoritative message append path. Zero-behavior-change lift.
 * Main.js-local side effects (renderAssistantHTML, saveCurrentSession,
 * updateKB) resolve via window.* at call time to
 * avoid circular imports.
 */
import { stateStore } from '../state/store.js';
import { hideNewReplyPill } from '../ui/scrollPill.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { appendLocalMemory } from '../storage/localMemory.ts';
import { formatMsg } from '../render/markdown.ts';
import { stripCitationMarkers } from '../render/helpers.ts';
import { getActiveProvider } from '../pickers.js';
import { generateId } from '../util/ids.ts';
import { streamRetryViewport } from './turnState.ts';
import { updateKB } from '../ui/knowledgePanel.js';

function _renderAssistantHtml(text: string): string {
  const shell = window as { renderAssistantHTML?: (t: string) => string };
  if (typeof window !== 'undefined' && typeof shell.renderAssistantHTML === 'function') {
    return shell.renderAssistantHTML(text);
  }
  return formatMsg(text);
}

/** The in-memory message entry pushed into the store. */
interface MessageEntry {
  clientId: string;
  role: string;
  rawText: string;
  html: string;
  type: string | null;
  actions: unknown;
  modelInfo: { label: string; model: string } | null;
  attachments: unknown[];
}

export function addMessage(
  role: string,
  text: unknown,
  type?: string | null,
  actions?: unknown,
  attachmentsArg?: unknown[],
): string {
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
      const _activeTurnList = document.getElementById('msgList') as (HTMLElement & { __socratesTurnViewportOwner?: unknown }) | null;
      if (_activeTurnList) delete _activeTurnList.__socratesTurnViewportOwner;
    } catch {
      // empty-catch: intentional — the viewport-owner cleanup is best effort.
    }
  }
  /* P1.1 — push to the authoritative stateStore.read("messages") first; the DOM
     is just a downstream view. */
  const clientId = 'msg-' + generateId();

  /* Use renderAssistantHTML for assistant messages containing scaffold
     XML tags so every Tutor scaffold, including the math-book blocks,
     is converted to its typed widget instead of raw XML text. */
  let html: string;
  let _displaySource = String(text || '');
  if (role === 'assistant') {
    /* P_strip-citations — assistant bubbles never show [1]/[2] search
       markers, including this direct-add path (re-explains, replayed
       turns). User messages keep whatever the user typed. */
    _displaySource = stripCitationMarkers(_displaySource);
  }
  if (role === 'assistant' && /<(quiz|example|practice|definition|step|flashcard|proof|theorem|key-point|derivation)\b/i.test(_displaySource)) {
    // empty-catch: intentional — a scaffold renderer failure falls back to plain markdown.
    try { html = _renderAssistantHtml(_displaySource); } catch { html = formatMsg(_displaySource); }
  } else if (role === 'user') {
    /* P_user-msg-no-format — user bubbles render from `rawText` via
       MessageBody's empty-html fallback. formatMsg() runs synchronous
       markdown over the whole paste, costing 30–80ms on a 50KB paste,
       and the parsed HTML was never read. Skip it. The empty html tells
       MessageBody to render rawText as React children, which auto-escapes
       and is therefore safe without DOMPurify. */
    html = '';
  } else {
    html = formatMsg(_displaySource);
  }
  let modelInfo: { label: string; model: string } | null = null;
  if (role === 'assistant') {
    const mp = getActiveProvider();
    if (mp) modelInfo = { label: mp.label || mp.model || '', model: mp.model || '' };
  }
  /* P_attachments — keep the attachments array on the in-memory entry
   * so saveCurrentSession round-trips it. We normalise to the same
   * shape persistMessageList() expects. */
  const atts = Array.isArray(attachmentsArg) ? attachmentsArg.slice(0, 20) : [];
  const entry: MessageEntry = { clientId: clientId, role: role, rawText: String(text || ''), html: html, type: type || null, actions: actions || null, modelInfo: modelInfo, attachments: atts };
  /* P_send-batch-actions — the click frame used to fire 2–3 separate
     stateStore.dispatch calls (state/set _userScrolledAway,
     session/append-message, tutor kb/patch-node). Each one paid a
     notify() walk over every React subscriber. Route them through
     state/batch-actions so the listener walk happens once at the end of
     the batch and React commits a single coherent snapshot. */
  const _batchActions: Array<Record<string, unknown>> = [{ type: 'session/append-message', payload: entry }];
  let _curIdx: number;
  let _curNode: { status?: string; questions?: number } | undefined | null;
  if (role === 'user') {
    _batchActions.push({ type: 'state/set', key: '_userScrolledAway', value: false });
    /* KB read happens before dispatch so the array passed into the
       batch reflects the pre-click state, and so the conditional
       `kb/patch-node` action is only queued when there is real work. */
    _curIdx = stateStore.read('currentNode') as number;
    const _nodes = stateStore.read('kbNodes');
    _curNode = _nodes && _nodes[_curIdx];
    if (_curNode && _curNode.status === 'blank') {
      _batchActions.push({
        type: 'kb/patch-node',
        index: _curIdx,
        patch: { status: 'fuzzy', questions: (_curNode.questions || 0) + 1 },
      });
    }
  }
  stateStore.dispatch({ type: 'state/batch-actions', actions: _batchActions });
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
      // empty-catch: intentional — local memory must not block the message append.
      try { appendLocalMemory(role, typeof text === 'string' ? text : null); } catch { /* best effort */ }
    }
    if (role === 'assistant') {
      if (stateStore.read('phase') === 'chat' || (stateStore.read('topic') && stateStore.read('kbNodes').length)) {
        const shell = window as { saveCurrentSession?: () => void };
        try { if (typeof shell.saveCurrentSession === 'function') shell.saveCurrentSession(); } catch { /* best effort */ }
      }
    }
    /* P_kb-patch-node — the previous path rebuilt the entire kbNodes array
       via .map (O(N) Object.assign on every node) and dispatched it as
       state/set kbNodes, which fires a kb-bridge commit and re-renders every
       KB row. The new kb/patch-node action updates only the touched index,
       so the reducer still has to clone the array (one slot) but skips the
       per-row rebuild. The action is queued inside `_batchActions` above so
       it commits in the same notify as session/append-message. */
    if (role === 'user' && _curNode && _curNode.status === 'blank') {
      try { updateKB(); } catch { /* best effort */ }
    }
  } catch { /* side effects are best effort */ }
  /* Return the clientId so callers (e.g. startSession) can patch this
     entry in place once async work like buildMessageContent finishes —
     without re-running the side effects above. */
  return clientId;
}
