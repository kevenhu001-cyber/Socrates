/* chat/messages.js — extracted from main.js (B4/B5 batch).
 * Authoritative message append path. Zero-behavior-change lift.
 * Main.js-local side effects (renderAssistantHTML, saveCurrentSession,
 * updateKB) resolve via window.* at call time to
 * avoid circular imports.
 */
import { stateStore } from '../state/store.ts';
import { hideNewReplyPill } from '../ui/scrollPill.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.ts';
import { appendLocalMemory } from '../storage/localMemory.ts';
import { formatMsg } from '../render/markdown.ts';
import { stripCitationMarkers } from '../render/helpers.ts';
import { getActiveProvider } from '../pickers.ts';
import { generateId } from '../util/ids.ts';
import { streamRetryViewport } from './turnState.ts';
import { updateKB } from '../ui/knowledgePanel.ts';
import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';

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

interface KnowledgeNodeSnapshot {
  status?: string;
  questions?: number;
}

function prepareUserMessageFollow(role: string): void {
  if (role !== 'user') return;
  streamRetryViewport.clearPendingViewport();
  stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: false });
  hideNewReplyPill();
  /* The previous answer's viewport reserve is retired by the send-time
     anchor (chat/turnAnchor.ts) after it glides past the reserve. */
  try {
    const activeTurnList = document.getElementById('msgList') as
      (HTMLElement & { __socratesTurnViewportOwner?: unknown }) | null;
    if (activeTurnList) delete activeTurnList.__socratesTurnViewportOwner;
  } catch {
    // empty-catch: intentional — viewport-owner cleanup is best effort.
  }
}

function renderMessageHtml(role: string, text: unknown): { html: string; displaySource: string } {
  let displaySource = String(text || '');
  if (role === 'assistant') displaySource = stripCitationMarkers(displaySource);
  if (role === 'assistant' && /<(quiz|example|practice|definition|step|flashcard|proof|theorem|key-point|derivation)\b/i.test(displaySource)) {
    // empty-catch: intentional — a scaffold renderer failure falls back to plain markdown.
    try { return { html: _renderAssistantHtml(displaySource), displaySource }; }
    catch { return { html: formatMsg(displaySource), displaySource }; }
  }
  if (role === 'user') return { html: '', displaySource };
  return { html: formatMsg(displaySource), displaySource };
}

function createMessageEntry(
  role: string,
  text: unknown,
  type: string | null | undefined,
  actions: unknown,
  attachmentsArg: unknown[] | undefined,
  clientId: string,
): MessageEntry {
  const { html } = renderMessageHtml(role, text);
  let modelInfo: MessageEntry['modelInfo'] = null;
  if (role === 'assistant') {
    const provider = getActiveProvider();
    if (provider) modelInfo = { label: provider.label || provider.model || '', model: provider.model || '' };
  }
  const attachments = Array.isArray(attachmentsArg) ? attachmentsArg.slice(0, 20) : [];
  return {
    clientId,
    role,
    rawText: String(text || ''),
    html,
    type: type || null,
    actions: actions || null,
    modelInfo,
    attachments,
  };
}

function createMessageBatchActions(role: string, entry: MessageEntry): {
  actions: Array<Record<string, unknown>>;
  shouldUpdateKnowledgeNode: boolean;
} {
  const actions: Array<Record<string, unknown>> = [{ type: 'session/append-message', payload: entry }];
  let shouldUpdateKnowledgeNode = false;
  if (role === 'user') {
    actions.push({ type: 'state/set', key: '_userScrolledAway', value: false });
    const currentIndex = stateStore.read('currentNode') as number;
    const nodes = stateStore.read('kbNodes');
    const currentNode = nodes && nodes[currentIndex] as KnowledgeNodeSnapshot | undefined;
    if (currentNode && currentNode.status === 'blank') {
      shouldUpdateKnowledgeNode = true;
      actions.push({
        type: 'kb/patch-node',
        index: currentIndex,
        patch: { status: 'fuzzy', questions: (currentNode.questions || 0) + 1 },
      });
    }
  }
  return { actions, shouldUpdateKnowledgeNode };
}

function publishMessageSideEffects(
  role: string,
  text: unknown,
  shouldUpdateKnowledgeNode: boolean,
): void {
  try {
    if (role === 'user' || role === 'assistant') {
      // empty-catch: intentional — local memory must not block the message append.
      try { appendLocalMemory(role, typeof text === 'string' ? text : null); } catch (error) {
        reportEmptyCatch(error, 'empty catch: chat/messages.ts:129', 'expected');
        /* best effort */
      }
    }
    if (role === 'assistant') {
      if (stateStore.read('phase') === 'chat' || (stateStore.read('topic') && stateStore.read('kbNodes').length)) {
        const shell = window as { saveCurrentSession?: () => void };
        try { if (typeof shell.saveCurrentSession === 'function') shell.saveCurrentSession(); } catch (error) {
          reportEmptyCatch(error, 'empty catch: chat/messages.ts:134', 'expected');
          /* best effort */
        }
      }
    }
    if (role === 'user' && shouldUpdateKnowledgeNode) {
      try { updateKB(); } catch (error) {
        reportEmptyCatch(error, 'empty catch: chat/messages.ts:138', 'expected');
        /* best effort */
      }
    }
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: chat/messages.ts:140', 'expected');
    /* side effects are best effort */
  }
}

export function addMessage(
  role: string,
  text: unknown,
  type?: string | null,
  actions?: unknown,
  attachmentsArg?: unknown[],
): string {
  prepareUserMessageFollow(role);
  /* P1.1 — push to the authoritative stateStore.read("messages") first; the DOM
     is just a downstream view. */
  const clientId = 'msg-' + generateId();
  const entry = createMessageEntry(role, text, type, actions, attachmentsArg, clientId);
  /* P_send-batch-actions — the click frame used to fire 2–3 separate
     stateStore.dispatch calls (state/set _userScrolledAway,
     session/append-message, tutor kb/patch-node). Each one paid a
     notify() walk over every React subscriber. Route them through
     state/batch-actions so the listener walk happens once at the end of
     the batch and React commits a single coherent snapshot. */
  const batch = createMessageBatchActions(role, entry);
  stateStore.dispatch({ type: 'state/batch-actions', actions: batch.actions });
  publishReactChatRuntime({ type: 'message-added', messageId: clientId });

  /* React owns the visible message list — the state push above is the
     authoritative write and React re-renders from the snapshot. The
     side effects below mirror the legacy DOM path's bookkeeping. */
  /* React's MessageList owns the post-commit scroll for finalized user
     messages. The legacy rAF write used to run before React committed and
     then race the smooth send scroll, causing a one-frame snap during
     composer collapse. Keep no second scroll owner here. */
  publishMessageSideEffects(role, text, batch.shouldUpdateKnowledgeNode);
  /* Return the clientId so callers (e.g. startSession) can patch this
     entry in place once async work like buildMessageContent finishes —
     without re-running the side effects above. */
  return clientId;
}
