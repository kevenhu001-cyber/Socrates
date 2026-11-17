/**
 * Authoritative message append path for the chat session.
 * Manages message normalization, scaffold HTML rendering, and store commit.
 */
import {
  dispatchBatch,
  dispatchSession,
  dispatchUi,
  kbBridge,
  sessionBridge,
  type SessionAction,
  type UiAction,
} from '../store/index.ts';
import type { ChatMessageShape } from '../state/session.ts';
import { hideNewReplyPill } from '../ui/scrollPill.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.ts';
import { appendLocalMemory } from '../storage/localMemory.ts';
import { formatMsg } from '../render/markdown.ts';
import { buildAssistantHtml } from '../render/assistantHtml.ts';
import { stripCitationMarkers } from '../render/text.ts';
import { getActiveProvider } from '../config/providerConfig.service.ts';
import { generateId } from '../util/ids.ts';
import { streamRetryViewport } from './turn/state.ts';
import { clearTurnViewportOwner } from './turn/anchor/ownership.ts';
import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';

function _renderAssistantHtml(text: string): string {
  try {
    return buildAssistantHtml(text);
  } catch {
    return formatMsg(text);
  }
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

function prepareUserMessageFollow(role: string): void {
  if (role !== 'user') return;
  streamRetryViewport.clearPendingViewport();
  dispatchUi({ type: 'ui/set', key: '_userScrolledAway', value: false });
  hideNewReplyPill();
  /* The previous answer's viewport reserve is retired by the send-time
     anchor (chat/turn/anchor/) after it glides past the reserve. */
  try {
    clearTurnViewportOwner(document.getElementById('msgList'));
  } catch {
    // empty-catch: intentional — viewport-owner cleanup is best effort.
  }
}

function renderMessageHtml(role: string, text: unknown): { html: string; displaySource: string } {
  let displaySource = String(text || '');
  if (role === 'assistant') displaySource = stripCitationMarkers(displaySource);
  if (
    role === 'assistant' &&
    /<(quiz|example|practice|definition|step|flashcard|proof|theorem|key-point|derivation)\b/i.test(
      displaySource,
    )
  ) {
    // empty-catch: intentional — a scaffold renderer failure falls back to plain markdown.
    try {
      return { html: _renderAssistantHtml(displaySource), displaySource };
    } catch {
      return { html: formatMsg(displaySource), displaySource };
    }
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
    if (provider)
      modelInfo = { label: provider.label || provider.model || '', model: provider.model || '' };
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

function createMessageBatchActions(
  role: string,
  entry: MessageEntry,
): {
  session: SessionAction;
  ui?: UiAction;
} {
  return {
    /* MessageEntry is the legacy row shape; the session reducer stores it
       verbatim, so the cast is the shape boundary, not a widening. */
    session: { type: 'session/append-message', payload: entry as unknown as ChatMessageShape },
    /* A message is not evidence that the learner knows more. KB confidence
       changes belong to an explicit diagnostic or confidence control. */
    ui: role === 'user' ? { type: 'ui/set', key: '_userScrolledAway', value: false } : undefined,
  };
}

function publishMessageSideEffects(role: string, text: unknown): void {
  try {
    if (role === 'user' || role === 'assistant') {
      // empty-catch: intentional — local memory must not block the message append.
      try {
        appendLocalMemory(role, typeof text === 'string' ? text : null);
      } catch (error) {
        reportEmptyCatch(error, 'empty catch: chat/messages.ts', 'expected');
        /* best effort */
      }
    }
    if (role === 'assistant') {
      if (
        sessionBridge.getSnapshot().phase === 'chat' ||
        (sessionBridge.getSnapshot().topic && kbBridge.getSnapshot().kbNodes.length)
      ) {
        const shell = window as { saveCurrentSession?: () => void };
        try {
          if (typeof shell.saveCurrentSession === 'function') shell.saveCurrentSession();
        } catch (error) {
          reportEmptyCatch(error, 'empty catch: chat/messages.ts', 'expected');
          /* best effort */
        }
      }
    }
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: chat/messages.ts', 'expected');
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
  /* append the message and update scroll intent in
     one notification walk. Knowledge confidence is deliberately not inferred
     from the fact that a user sent a message. */
  const batch = createMessageBatchActions(role, entry);
  dispatchBatch(batch);
  publishReactChatRuntime({ type: 'message-added', messageId: clientId });

  /* React owns the visible message list — the state push above is the
     authoritative write and React re-renders from the snapshot. The
     side effects below mirror the legacy DOM path's bookkeeping. */
  /* React's MessageList owns the post-commit scroll for finalized user
     messages. The legacy rAF write used to run before React committed and
     then race the smooth send scroll, causing a one-frame snap during
     composer collapse. Keep no second scroll owner here. */
  publishMessageSideEffects(role, text);
  /* Return the clientId so callers (e.g. startSession) can patch this
     entry in place once async work like buildMessageContent finishes —
     without re-running the side effects above. */
  return clientId;
}

/** Append a non-model assistant surface to the React transcript. This is for
 * locally generated UI flows such as retrying a tutor widget; it intentionally
 * skips assistant memory writes and saves so the owning workflow can persist
 * its complete state once after the message is appended. */
export function addAssistantUiMessage(text: string): string {
  const clientId = 'msg-' + generateId();
  const entry = createMessageEntry('assistant', text, null, null, [], clientId);
  dispatchSession({
    type: 'session/append-message',
    payload: entry as unknown as ChatMessageShape,
  });
  publishReactChatRuntime({ type: 'message-added', messageId: clientId });
  return clientId;
}
