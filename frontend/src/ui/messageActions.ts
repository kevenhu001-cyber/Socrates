/**
 * ui/messageActions.ts — per-message operations for the legacy shell.
 *
 * Extracted from main.js (Phase 6 split: feedback, lookup, rollback,
 * delete, and history-restore helpers). The React message list owns its
 * own actions via react/message-list/useMessageActions.ts.
 */

import { stateStore } from '../state/store.js';
import { apiFetch } from '../util/api.js';
import { showToast } from './toast.js';
import { buildAssistantHtml } from '../render/assistantHtml.ts';
import { formatMsg } from '../render/markdown.js';
import { wireCodeBlockHeaders, wireMsgBodyImages } from '../render/postRender.js';
import { publishReactChatRuntime } from './reactBridge.js';
import {
  appendFileChangeSummaryCards,
  appendInlineArtifact,
  appendToolModule,
  renderToolTextOutput,
} from './toolCards.js';
import { mountVisualization } from '../render/visualization.js';
import { processPendingMermaid, processPendingViz, processPendingVizActions } from '../render/viz.js';

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
  } catch {
    /* A synchronous throw (no fetch in this environment) is equally non-fatal. */
  }
}

/** Send feedback with optimistic toolbar highlighting. */
export function sendFeedback(
  messageId: string,
  rating: string,
  bar?: Element | null,
): void {
  fireFeedback(messageId, rating, null);
  /* Optimistic UI: highlight the chosen button, dim the other. */
  if (bar) {
    const up = bar.querySelector('[data-action="thumbs-up"]');
    const down = bar.querySelector('[data-action="thumbs-down"]');
    if (up) up.classList.toggle('active', rating === 'up');
    if (down) down.classList.toggle('active', rating === 'down');
  }
  showToast(rating === 'up' ? 'Thanks for the feedback' : "Got it — we'll improve");
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
 * Returns the number of dropped messages.
 */
export function rollbackMessagesAfter(userMessageId: string): number {
  const startIdx = findMessageIndex(userMessageId);
  if (startIdx < 0) return 0;
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
  return toDrop.length;
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
    if (!e || e.status !== 404) console.log('[msg-delete] not synced');
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
        } catch {}
        try {
          processPendingViz();
        } catch {}
        try {
          processPendingVizActions();
        } catch {}
        return;
      } catch {}
    }
    body.innerHTML = formatMsg(raw);
  } else if (entry.html) {
    body.innerHTML = entry.html;
  } else {
    body.innerHTML = '';
  }
  try {
    processPendingMermaid();
  } catch {}
  try {
    processPendingViz();
  } catch {}
  try {
    processPendingVizActions();
  } catch {}
  try {
    wireCodeBlockHeaders(body);
  } catch {}
  try {
    wireMsgBodyImages(body);
  } catch {}
}

/* Restore non-HTML message content that is persisted separately from the
   assistant's markdown. React calls this after a history bubble commits;
   the public-share renderer uses the same helper so both paths stay in
   parity. The data marker makes repeated React renders idempotent. */
export function restorePersistedMessageExtras(
  body: HTMLElement,
  entry: MessageEntry,
  idPrefix?: string,
): void {
  if (!body || !entry) return;
  const messageKey = String(entry.clientId || entry.id || idPrefix || 'message');
  if (body.dataset && body.dataset.persistedExtrasFor === messageKey) return;
  const calls: ToolCallEntry[] = Array.isArray(entry.toolCalls) ? entry.toolCalls : [];
  for (let tci = 0; tci < calls.length; tci++) {
    const tc = calls[tci];
    if (!tc || !tc.name) continue;
    const vizSpec =
      tc.visualization && tc.visualization.version === 1
        ? tc.visualization
        : tc.name === 'render_visualization' &&
            typeof tc.input === 'object' &&
            tc.input !== null &&
            (tc.input as { version?: number }).version === 1
          ? (tc.input as { version?: number; [key: string]: unknown })
          : null;
    /* P_inline-restore — when the rebuilt HTML already carries the
       settled inline tool row (data-tcid), don't append a duplicate
       card at the bubble bottom; instead re-seat the tool's visual
       output (chart / image artifacts) right after its row so the
       restored layout matches the live streaming layout. */
    let inlineRow: Element | null = null;
    try {
      const sel =
        typeof CSS !== 'undefined' && CSS.escape
          ? CSS.escape(String(tc.id || ''))
          : String(tc.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (sel) inlineRow = body.querySelector('.tool-inline[data-tcid="' + sel + '"]');
    } catch {}
    if (inlineRow) {
      /* P_declarative-tool-run — nothing to mount means nothing to insert:
         react/tool-run already rendered the host for a call that has a chart
         or a file, and an empty .tool-inline-attachments div next to every
         restored row only adds a gap to the layout. */
      const hasArtifacts = Array.isArray(tc.artifacts) && tc.artifacts.length > 0;
      if (!vizSpec && !hasArtifacts) continue;
      let host = inlineRow.nextElementSibling;
      if (!host || !host.classList || !host.classList.contains('tool-inline-attachments')) {
        host = document.createElement('div');
        host.className = 'tool-inline-attachments';
        host.setAttribute('data-tool-anchor', String(tc.id || ''));
        inlineRow.insertAdjacentElement('afterend', host);
      }
      if (vizSpec) {
        try {
          mountVisualization(vizSpec, host, {
            toolCallId: tc.id || ((idPrefix || 'history') + '-viz-' + tci),
          });
        } catch {}
      }
      if (Array.isArray(tc.artifacts)) {
        for (let aj = 0; aj < tc.artifacts.length; aj++) {
          const artJ = tc.artifacts[aj];
          if (!artJ || !artJ.id) continue;
          try {
            appendInlineArtifact(artJ.id, artJ.mimeType, host, artJ.name);
          } catch {}
        }
      }
      continue;
    }
    let cardOut: Element | null = null;
    try {
      cardOut = appendToolModule(tc.name, tc.input || {}, body, {
        restored: true,
        isError: tc.isError === true,
      }) as Element | null;
      if (cardOut && tc.output != null) {
        renderToolTextOutput(cardOut, String(tc.output), {
          isError: tc.isError === true,
          kind: tc.isError === true ? 'error' : 'output',
        });
      }
    } catch {}
    if (vizSpec) {
      try {
        mountVisualization(vizSpec, body, {
          toolCallId: tc.id || ((idPrefix || 'history') + '-viz-' + tci),
        });
      } catch {}
    }
    if (cardOut && Array.isArray(tc.artifacts)) {
      for (let ai = 0; ai < tc.artifacts.length; ai++) {
        const art = tc.artifacts[ai];
        if (!art || !art.id) continue;
        const previewable =
          art.mimeType &&
          (art.mimeType.indexOf('image/') === 0 || art.mimeType.indexOf('text/html') === 0);
        try {
          appendInlineArtifact(
            art.id,
            art.mimeType || 'application/octet-stream',
            previewable ? body : cardOut,
            art.name,
          );
        } catch {}
      }
    }
  }
  try {
    appendFileChangeSummaryCards(body);
  } catch {}
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
  } catch {}
  container.appendChild(node);
}
