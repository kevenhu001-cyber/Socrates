/**
 * ui/messageActions.ts — per-message operations for the legacy shell.
 *
 * Extracted from main.js (Phase 6 split: feedback, lookup, rollback,
 * delete, and history-restore helpers). The React message list owns its
 * own actions via react/message-list/useMessageActions.ts.
 */

import { stateStore } from '../state/store.js';
import { apiFetch } from '../util/api.ts';
import { i18n } from '../react/legacy/gateway.ts';
import { showToast } from './toast.js';
import { buildAssistantHtml } from '../render/assistantHtml.ts';
import { visualizationSpecOf } from '../render/visualizationSpec.ts';
import { formatMsg } from '../render/markdown.ts';
import { wireCodeBlockHeaders, wireMsgBodyImages } from '../render/postRender.ts';
import { publishReactChatRuntime } from './reactBridge.js';
import {
  appendFileChangeSummaryCards,
  appendInlineArtifact,
  appendToolModule,
  renderToolTextOutput,
} from './toolCards.js';
import { mountVisualization } from '../render/vizStubs.js';
import { processPendingMermaid, processPendingViz, processPendingVizActions } from '../render/vizStubs.js';
import { queueMessageOp } from '../session/mutationOutbox.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

/**
 * Build the API path for one message, scoping client ids to the current
 * session. Server routes accept the clientId only when it is scoped to
 * the current session. This avoids the old unconditional 400 for `msg-*`
 * ids while preserving UUID ownership checks.
 */
export function messageApiPath(messageId: string, suffix?: string): string {
  let path = '/api/messages/' + encodeURIComponent(messageId) + (suffix || '');
  const sid = stateStore.read('currentSessionId') as string | null | undefined;
  if (
    sid &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sid))
  ) {
    path += '?sessionId=' + encodeURIComponent(sid);
  }
  return path;
}

/**
 * Fire a PUT /api/messages/<id>/feedback event. Backend may ignore
 * unknown events. Telemetry failures are non-fatal by design.
 */
export function fireFeedback(
  messageId: string,
  rating: string,
  categories?: unknown,
): void {
  try {
    if (!messageId) return;
    apiFetch(messageApiPath(messageId, '/feedback'), {
      method: 'PUT',
      body: { rating, categories: categories || null },
    }).catch(function () {
      /* Telemetry failures are non-fatal. */
      console.debug('[msg-feedback] not sent');
    });
  } catch (e) {
      /* A synchronous throw (no fetch in this environment) is equally non-fatal. */
      reportSwallow(e, 'ui/messageActions.fireFeedback');
    }
}

/** Send feedback and acknowledge the action. */
export function sendFeedback(
  messageId: string,
  rating: string,
): void {
  fireFeedback(messageId, rating, null);
  showToast(rating === 'up'
    ? i18n('message.feedbackThanks', 'Thanks for the feedback')
    : i18n('message.feedbackNoted', "Got it — we'll improve"));
}

/** Message entry as stored in stateStore.read("messages"). */
export interface MessageEntry {
  clientId?: string;
  id?: string;
  role?: string;
  rawText?: string;
  html?: string | null;
  toolCalls?: ToolCallEntry[];
  attachments?: unknown[];
  /** Send-time viewport anchor chrome (see chat/turnAnchor.ts). */
  _turnAnchorMinHeight?: number;
  _turnAnchorMode?: string;
  _turnViewportTarget?: number;
  _turnAnchorMarginTop?: number;
  /** Superseded empty placeholder kept as an invisible layout stub until
      the next turn's anchor glides past it (chat/turnAnchor.ts). */
  _supersededStub?: boolean;
  _toolRunRev?: number;
}

/** A tool call recorded on a message entry. */
export interface ToolCallEntry {
  id?: string;
  name?: string;
  input?: unknown;
  output?: unknown;
  isError?: boolean;
  status?: string;
  visualization?: { version?: number; [key: string]: unknown };
  artifacts?: Array<{ id: string; mimeType?: string; name?: string }>;
}

/** Index of a message by client or server id, or -1 when absent. */
export function findMessageIndex(messageId: string): number {
  return stateStore.read('messages').findIndex(function (m: MessageEntry) {
    return m.clientId === messageId || m.id === messageId;
  });
}

/**
 * Drop every message after the given user turn from state + DOM.
 *
 * Returns the dropped entries (empty when the anchor isn't found). The
 * caller needs the actual entries, not just a count: when the matching
 * server-side prune fails, each dropped clientId is queued for replay in
 * session/mutationOutbox.js, because the whole-session save can rewrite
 * rows but can never delete them.
 */
export function rollbackMessagesAfter(userMessageId: string): MessageEntry[] {
  const startIdx = findMessageIndex(userMessageId);
  if (startIdx < 0) return [];
  /* Snapshot ids first — splicing the array while iterating
     backwards is safe, but collecting the list up front keeps the
     DOM removal straightforward. */
  const toDrop: MessageEntry[] = [];
  const messages = stateStore.read('messages') as MessageEntry[];
  for (let i = startIdx + 1; i < messages.length; i++) {
    toDrop.push(messages[i]);
  }
  stateStore.dispatch({ type: 'session/truncate-messages-after', index: startIdx });
  toDrop.forEach(function (m) {
    if (!m || !m.clientId) return;
    const div = document.querySelector('[data-client-id="' + m.clientId + '"]');
    /* React-owned bubbles are removed by React itself when the
       state-synced event below re-renders from the spliced state.
       Detaching them here would crash React's next commit. */
    if (div && div.hasAttribute('data-react-owned')) return;
    if (div && div.parentNode) div.parentNode.removeChild(div);
  });
  publishReactChatRuntime({ type: 'state-synced', reason: 'rollback' });
  return toDrop;
}

/** Delete one user message locally and server-side. */
export function deleteUserMessage(messageId: string): void {
  const idx = findMessageIndex(messageId);
  if (idx < 0) return;
  stateStore.dispatch({ type: 'session/remove-message-at', index: idx, clientId: messageId });
  const div = document.querySelector('[data-client-id="' + messageId + '"]');
  if (div && !div.hasAttribute('data-react-owned')) div.remove();
  publishReactChatRuntime({ type: 'state-synced', reason: 'message-deleted' });
  apiFetch(messageApiPath(messageId), {
    method: 'DELETE',
  }).catch(function (e: { status?: number } | null) {
    if (!e || e.status !== 404) {
      /* P0.1 A4 — the row is gone locally but still on the server, and
         the whole-session save only upserts, so a reload would bring the
         deleted message straight back. Queue it for replay instead. */
      queueMessageOp(stateStore.read('currentSessionId') as string | null, messageId, 'delete');
      console.log('[msg-delete] not synced — queued for replay');
    }
  });
}

/**
 * Re-render one message body in place so the latest renderer (KaTeX,
 * weak-model fixes, scaffold widgets) applies to every message — not
 * the frozen html from when it was first saved.
 */
export function restoreMessageBody(entry: MessageEntry, body: HTMLElement): void {
  if (entry.rawText) {
    const raw = entry.rawText;
    if (entry.role === 'assistant') {
      try {
        body.innerHTML = buildAssistantHtml(raw);
        try {
          processPendingMermaid();
        } catch (e) {reportSwallow(e, 'ui/messageActions.restoreMessageBody'); }
        try {
          processPendingViz();
        } catch (e) {reportSwallow(e, 'ui/messageActions.restoreMessageBody#2'); }
        try {
          processPendingVizActions();
        } catch (e) {reportSwallow(e, 'ui/messageActions.restoreMessageBody#3'); }
        return;
      } catch (e) {reportSwallow(e, 'ui/messageActions.restoreMessageBody#4'); }
    }
    body.innerHTML = formatMsg(raw);
  } else if (entry.html) {
    body.innerHTML = entry.html;
  } else {
    body.innerHTML = '';
  }
  try {
    processPendingMermaid();
  } catch (e) {reportSwallow(e, 'ui/messageActions.restoreMessageBody#5'); }
  try {
    processPendingViz();
  } catch (e) {reportSwallow(e, 'ui/messageActions.restoreMessageBody#6'); }
  try {
    processPendingVizActions();
  } catch (e) {reportSwallow(e, 'ui/messageActions.restoreMessageBody#7'); }
  try {
    wireCodeBlockHeaders(body);
  } catch (e) {reportSwallow(e, 'ui/messageActions.restoreMessageBody#8'); }
  try {
    wireMsgBodyImages(body);
  } catch (e) {reportSwallow(e, 'ui/messageActions.restoreMessageBody#9'); }
}

/* Restore non-HTML message content that is persisted separately from the
   assistant's markdown. React calls this after a history bubble commits;
   the public-share renderer uses the same helper so both paths stay in
   parity. The data marker makes repeated React renders idempotent. */
function toolCallSelector(id: string | undefined): string {
  const raw = String(id || '');
  try {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(raw);
  } catch (error) {
    reportSwallow(error, 'ui/messageActions.restorePersistedMessageExtras');
  }
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

function inlineToolRow(body: HTMLElement, selector: string): Element | null {
  if (!selector) return null;
  try {
    return body.querySelector('.tool-inline[data-tcid="' + selector + '"]');
  } catch (error) {
    reportSwallow(error, 'ui/messageActions.restorePersistedMessageExtras');
    return null;
  }
}

function inlineArtifactHost(body: HTMLElement, row: Element, selector: string, callId?: string): Element {
  let host: Element | null = null;
  try {
    host = body.querySelector('.tool-inline-attachments[data-tool-anchor="' + selector + '"]');
  } catch (error) {
    reportSwallow(error, 'ui/messageActions.restorePersistedMessageExtras#2');
  }
  if (host) return host;
  const next = row.nextElementSibling;
  if (next?.classList.contains('tool-inline-attachments')) return next;
  host = document.createElement('div');
  host.className = 'tool-inline-attachments';
  host.setAttribute('data-tool-anchor', String(callId || ''));
  row.insertAdjacentElement('afterend', host);
  return host;
}

function mountRestoredVisualization(
  spec: NonNullable<ReturnType<typeof visualizationSpecOf>>,
  host: Element,
  toolCallId: string,
  reportContext: string,
): void {
  try {
    mountVisualization(spec, host, { toolCallId }).catch(() => { /* async: the surrounding try cannot see this */ });
  } catch (error) {
    reportSwallow(error, reportContext);
  }
}

function appendInlineArtifacts(artifacts: ToolCallEntry['artifacts'], host: Element): void {
  if (!Array.isArray(artifacts)) return;
  for (const artifact of artifacts) {
    if (!artifact?.id) continue;
    try {
      appendInlineArtifact(artifact.id, artifact.mimeType, host, artifact.name);
    } catch (error) {
      reportSwallow(error, 'ui/messageActions.restorePersistedMessageExtras#4');
    }
  }
}

function restoreInlineToolCall(
  body: HTMLElement,
  row: Element,
  selector: string,
  call: ToolCallEntry,
  spec: NonNullable<ReturnType<typeof visualizationSpecOf>> | null,
  toolCallId: string,
): void {
  const artifacts = call.artifacts;
  if (!spec && (!Array.isArray(artifacts) || artifacts.length === 0)) return;
  const host = inlineArtifactHost(body, row, selector, call.id);
  if (spec) mountRestoredVisualization(spec, host, toolCallId, 'ui/messageActions.restorePersistedMessageExtras#3');
  appendInlineArtifacts(artifacts, host);
}

function restoreStandaloneToolCall(
  body: HTMLElement,
  call: ToolCallEntry,
  spec: NonNullable<ReturnType<typeof visualizationSpecOf>> | null,
  toolCallId: string,
): void {
  let card: Element | null = null;
  try {
    card = appendToolModule(call.name!, call.input || {}, body, {
      restored: true,
      isError: call.isError === true,
    }) as Element | null;
    if (card && call.output != null) {
      renderToolTextOutput(card, String(call.output), {
        isError: call.isError === true,
        kind: call.isError === true ? 'error' : 'output',
      });
    }
  } catch (error) {
    reportSwallow(error, 'ui/messageActions.restorePersistedMessageExtras#5');
  }
  if (spec) mountRestoredVisualization(spec, body, toolCallId, 'ui/messageActions.restorePersistedMessageExtras#6');
  appendStandaloneArtifacts(body, card, call.artifacts);
}

function appendStandaloneArtifacts(
  body: HTMLElement,
  card: Element | null,
  artifacts: ToolCallEntry['artifacts'],
): void {
  if (!card || !Array.isArray(artifacts)) return;
  for (const artifact of artifacts) {
    if (!artifact?.id) continue;
    const previewable = artifact.mimeType?.startsWith('image/') || artifact.mimeType?.startsWith('text/html');
    try {
      appendInlineArtifact(
        artifact.id,
        artifact.mimeType || 'application/octet-stream',
        previewable ? body : card,
        artifact.name,
      );
    } catch (error) {
      reportSwallow(error, 'ui/messageActions.restorePersistedMessageExtras#7');
    }
  }
}

function restoreToolCallExtras(body: HTMLElement, call: ToolCallEntry, index: number, idPrefix?: string): void {
  if (!call.name) return;
  const selector = toolCallSelector(call.id);
  const row = inlineToolRow(body, selector);
  const spec = visualizationSpecOf(call);
  const toolCallId = call.id || ((idPrefix || 'history') + '-viz-' + index);
  if (row) {
    restoreInlineToolCall(body, row, selector, call, spec, toolCallId);
    return;
  }
  restoreStandaloneToolCall(body, call, spec, toolCallId);
}

export function restorePersistedMessageExtras(
  body: HTMLElement,
  entry: MessageEntry,
  idPrefix?: string,
): void {
  if (!body || !entry) return;
  const messageKey = String(entry.clientId || entry.id || idPrefix || 'message');
  if (body.dataset && body.dataset.persistedExtrasFor === messageKey) return;
  const calls: ToolCallEntry[] = Array.isArray(entry.toolCalls) ? entry.toolCalls : [];
  calls.forEach((call, index) => restoreToolCallExtras(body, call, index, idPrefix));
  try {
    appendFileChangeSummaryCards(body);
  } catch (error) {
    reportSwallow(error, 'ui/messageActions.restorePersistedMessageExtras#8');
  }
  if (body.dataset) body.dataset.persistedExtrasFor = messageKey;
}

/* Re-seat a live artifact / chart node after the final-render innerHTML
   pass. Anchored attachment hosts carry the data-tool-anchor of the
   inline row they belong to; the serialized row (same data-tcid) is in
   the fresh DOM, so the live node goes right back after it. Nodes with
   no anchor keep the old bottom-of-bubble placement. */
export function reseatSavedArtifact(container: Element, node: Element): void {
  try {
    const anchor = node.getAttribute && node.getAttribute('data-tool-anchor');
    if (anchor) {
      const sel =
        typeof CSS !== 'undefined' && CSS.escape
          ? CSS.escape(anchor)
          : anchor.replace(/[^a-zA-Z0-9_-]/g, '');
      const row = container.querySelector('[data-tcid="' + sel + '"]');
      if (row) {
        row.insertAdjacentElement('afterend', node);
        return;
      }
    }
  } catch (e) {reportSwallow(e, 'ui/messageActions.reseatSavedArtifact'); }
  container.appendChild(node);
}
