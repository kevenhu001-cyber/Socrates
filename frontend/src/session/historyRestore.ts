/* Restore persisted session messages and their local recovery paths.
 * These helpers own the boundary between saved session data, the transcript
 * store, and browser-local history. */
import { whenSessionIdle } from './afterSessionPaint.ts';
import { normalizeTurnRuntime } from '@socrates/core';
import { stateStore } from '../state/store.ts';
import { buildUserContentParts } from '../chat/history.ts';
import { quietTurn } from '../chat/turnUi.ts';
import { apiFetch } from '../util/api.ts';
import { loadLocalMemory, LOCAL_MEMORY_MAX, _memKey } from '../storage/localMemory.ts';
import { batchSetItem } from '../batchStorage.ts';
import { formatMsg } from '../render/markdown.ts';
import { esc } from '../render/helpers.ts';
import { buildAssistantHtml } from '../render/assistantHtml.ts';
import { generateId } from '../util/ids.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.ts';
import { showToast } from '../ui/toast.js';
import { reportSwallow } from '../util/reportSwallow.ts';

/** A persisted message row from GET /api/sessions/:id. */
export interface PersistedMessage {
  id?: string | null;
  clientId?: string | null;
  role?: string;
  rawText?: string | null;
  content?: string | null;
  html?: string | null;
  type?: string | null;
  reasoningContent?: string | null;
  reasoning_content?: string | null;
  reasoningDurationSec?: number | null;
  reasoning_duration_sec?: number | null;
  summary?: unknown;
  turnRuntime?: unknown;
  attachments?: unknown[];
  toolCalls?: PersistedToolCall[];
  [key: string]: unknown;
}

export interface PersistedToolCall {
  id?: unknown;
  name?: unknown;
  input?: unknown;
  output?: unknown;
  isError?: unknown;
  artifacts?: Array<{ id?: unknown; mimeType?: string | null; name?: string | null }> | null;
  results?: unknown[];
  textOffset?: unknown;
  visualization?: unknown;
  outputs?: unknown;
  status?: unknown;
  durationMs?: unknown;
  error?: unknown;
  errorCode?: unknown;
  retryable?: unknown;
  userMessage?: unknown;
  stderr?: unknown;
  detail?: unknown;
  [key: string]: unknown;
}

/** The transcript shape the React-owned message list consumes. */
export interface RestoredMessage {
  clientId: string;
  serverId: string | null;
  role: string | undefined;
  rawText: string;
  html: string;
  type: string | null;
  restoredFromHistory: true;
  reasoningContent: string | null;
  reasoningDurationSec: number | null;
  summary: unknown;
  turnRuntime: ReturnType<typeof normalizeTurnRuntime>;
  _liveStatus?: { phase: 'error'; label: string; retryable: true; retryMode: 'restored' };
  attachments: unknown[];
  toolCalls: unknown[];
  actions: null;
}

/** The session payload these helpers read; both server and local rows fit. */
export interface RestorableSession {
  id: string;
  topic?: string | null;
  streamingText?: string | null;
  messages?: PersistedMessage[];
}


interface ChatTurnWindow extends Window {
  askChatTurn?: (text: string, parts: unknown) => unknown;
}

function restoredClientId(message: PersistedMessage): string {
  return message.clientId || message.id || ('loaded-' + generateId());
}

function restoredHtml(message: PersistedMessage): string {
  let html = message.html || '';
  if (typeof html === 'string' && html.indexOf('think-block') !== -1) {
    html = html.replace(/<details class="think-block[\s\S]*?<\/details>/gi, '');
  }
  return html;
}

function restoredReasoning(message: PersistedMessage): Pick<RestoredMessage, 'reasoningContent' | 'reasoningDurationSec'> {
  return {
    reasoningContent: message.reasoningContent || message.reasoning_content || null,
    reasoningDurationSec: message.reasoningDurationSec || message.reasoning_duration_sec || null,
  };
}

function restoredToolIdentity(call: PersistedToolCall): Record<string, unknown> {
  return {
    id: String(call.id || ''),
    name: String(call.name || ''),
    input: call.input == null ? null : call.input,
    output: call.output == null ? null : call.output,
    isError: call.isError === true,
  };
}

function restoredToolArtifacts(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((artifact: { id?: unknown; mimeType?: string | null; name?: string | null }) => ({
    id: String(artifact.id || ''),
    mimeType: artifact.mimeType || null,
    name: artifact.name || null,
  }));
}

function restoredToolVisualFields(call: PersistedToolCall): Record<string, unknown> {
  const visualization = call.visualization as { version?: number } | null | undefined;
  return {
    /* Preserve the split offset and versioned visualization spec so
       inline tool layout survives a reload. */
    textOffset: typeof call.textOffset === 'number' ? call.textOffset : undefined,
    visualization: (visualization && visualization.version === 1) ? visualization : undefined,
    visualizations: Array.isArray(call.visualizations) ? call.visualizations.slice(0, 8) : undefined,
    /* Keep the normalized output list when present. The renderer
       validates entries and can fall back to legacy output fields. */
    outputs: Array.isArray(call.outputs) ? call.outputs : undefined,
  };
}

function restoredToolTerminalFields(call: PersistedToolCall): Record<string, unknown> {
  return {
    /* Terminal fields drive the restored tool row's state and error UI. */
    status: call.status == null ? null : String(call.status),
    durationMs: typeof call.durationMs === 'number' ? call.durationMs : undefined,
    error: call.error == null ? null : call.error,
    errorCode: call.errorCode == null ? null : call.errorCode,
    retryable: typeof call.retryable === 'boolean' ? call.retryable : undefined,
    userMessage: call.userMessage == null ? undefined : call.userMessage,
    stderr: call.stderr == null ? undefined : call.stderr,
    detail: call.detail == null ? undefined : call.detail,
  };
}

function restoredToolCall(call: PersistedToolCall): Record<string, unknown> {
  return {
    ...restoredToolIdentity(call),
    artifacts: restoredToolArtifacts(call.artifacts),
    results: Array.isArray(call.results) ? call.results.slice(0, 20) : [],
    ...restoredToolVisualFields(call),
    ...restoredToolTerminalFields(call),
  };
}

function restoredCollections(message: PersistedMessage): Pick<RestoredMessage, 'attachments' | 'toolCalls'> {
  return {
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    toolCalls: Array.isArray(message.toolCalls) ? message.toolCalls.map(restoredToolCall) : [],
  };
}

function _t(key: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const value = window.t(key);
      if (value && value !== key) return value;
    }
  } catch (error) { reportSwallow(error, 'session/historyRestore._t'); }
  return key;
}

/* Translate one persisted API row into the transcript shape consumed by the
   React-owned message list. */
export function restoreSessionMessage(m: PersistedMessage): RestoredMessage {
  /* Keep the stable clientId for DOM/state and retain the database UUID
     separately. Replacing clientId with m.id makes the next save insert a
     duplicate row and causes message actions to lose their client identity. */
  const clientId = restoredClientId(m);
  /* MessageBody/AssistantTurn render canonical rawText when a row mounts.
     Building markup here parses offscreen history and schedules scaffold
     mounts for discarded slots. Retain supplied snapshots for compatibility
     and persistence; leave raw-only rows raw until they actually mount. */
  const html = restoredHtml(m);
  const reasoning = restoredReasoning(m);
  const collections = restoredCollections(m);
  return {
    clientId: clientId,
    serverId: m.id || null,
    role: m.role,
    rawText: m.rawText || '',
    html: html,
    type: m.type || null,
    restoredFromHistory: true,
    /* The API uses the camelCase schema key. Keep the snake_case fallback
       for any legacy payloads. */
    ...reasoning,
    /* P_turn-summary — carry the persisted retrospective so the Summary
       sheet reads the same after a reload as it did live. */
    summary: m.summary || null,
    turnRuntime: normalizeTurnRuntime(m.turnRuntime),
    ...collections,
    actions: null,
  };
}

/* The server save can lag behind a refresh. Restore assistant messages that
   were already mirrored locally but have not reached the session response. */
export function restoreLocalAssistantFallback(session: RestorableSession): void {
  try {
    const localRecord = loadLocalMemory(session.id);
    const serverMessages = Array.isArray(session.messages) ? session.messages : [];
    if (!localRecord || !Array.isArray(localRecord.messages) || localRecord.messages.length <= serverMessages.length) return;
    const extras = localRecord.messages.slice(serverMessages.length);
    for (let i = 0; i < extras.length; i++) {
      const message = extras[i];
      if (!message || !message.content || message.role !== 'assistant') continue;
      stateStore.dispatch({ type: 'session/append-message', payload: {
        clientId: 'local-recovered-' + generateId(),
        role: 'assistant',
        rawText: message.content,
        html: buildAssistantHtml(message.content),
        type: 'assistant',
        reasoningContent: null,
        attachments: [],
        toolCalls: [],
        actions: null,
      } });
    }
    publishReactChatRuntime({ type: 'state-synced', reason: 'local-recovered-react' });
  } catch (error) { reportSwallow(error, 'session/historyRestore.restoreLocalAssistantFallback'); }
}

/* Show server-persisted partial output after a refresh and attach its retry
   action to the React-owned message list. */
export function restoreInterruptedResponse(session: RestorableSession, msgList: HTMLElement): void {
  if (!session.streamingText) return;
  const partialText = session.streamingText || '(partial content)';
  let partialRendered: string;
  try { partialRendered = formatMsg(partialText); }
  catch { partialRendered = '<p>' + esc(partialText) + '</p>'; }
  const partialHtml = '<div class="msg-content">' + partialRendered + '</div>' +
    '<div class="msg-error" style="margin-top:8px">' +
      '<span class="msg-error-text">(response interrupted — tap Retry to continue)</span>' +
    '</div>';
  const partialClientId = 'stream-recovered-' + Date.now();
  const partialIdx: number = stateStore.dispatch({ type: 'session/append-message', payload: {
    role: 'assistant',
    clientId: partialClientId,
    rawText: partialText,
    html: partialHtml,
    type: 'assistant',
    _liveStatus: { phase: 'error', label: '(response interrupted — tap Retry to continue)', retryable: true, retryMode: 'restored' },
  } });
  const retryDelegated = function (ev: MouseEvent): void {
    const target = ev.target as Element | null;
    if (!(target && target.matches && target.matches('[data-stream-retry]'))) return;
    msgList.removeEventListener('click', retryDelegated);
    stateStore.dispatch({
      type: 'session/remove-message-at', index: partialIdx, clientId: partialClientId,
    });
    apiFetch('/api/sessions/' + encodeURIComponent(session.id), {
      method: 'PATCH',
      body: { streamingText: null, streamingReasoning: null },
    }).catch(function () { /* empty-catch: intentional — clearing the partial marker is best-effort */ });
    let lastUserEntry: PersistedMessage | null = null;
    let lastUserMessage: string | null = null;
    const messages = stateStore.read('messages') as PersistedMessage[];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i] && messages[i].role === 'user') {
        lastUserEntry = messages[i];
        lastUserMessage = lastUserEntry.rawText || lastUserEntry.content || null;
        break;
      }
    }
    const win = window as ChatTurnWindow;
    if (lastUserMessage && typeof win.askChatTurn === 'function') {
      /* askChatTurn slices this user turn out of history; carry multimodal
         parts explicitly so retry preserves its attachments. */
      let lastUserParts: unknown;
      try { lastUserParts = buildUserContentParts(lastUserMessage, lastUserEntry && lastUserEntry.attachments); } catch { lastUserParts = null; }
      quietTurn(win.askChatTurn(lastUserMessage, lastUserParts));
    } else {
      showToast(_t('toast.noRetryTarget'));
    }
  };
  msgList.addEventListener('click', retryDelegated);
  /* Avoid showing the same server-side partial message on the next reload. */
  apiFetch('/api/sessions/' + encodeURIComponent(session.id), {
    method: 'PATCH',
    body: { streamingText: null, streamingReasoning: null },
  }).catch(function () { /* empty-catch: intentional — clearing the partial marker is best-effort */ });
}

/* Build the local fast-path history from server rows only when no local copy
   exists, and defer the work until the browser is idle. */
export function mirrorSessionHistory(session: RestorableSession, isCurrent: () => boolean = () => stateStore.read('currentSessionId') === session.id, signal?: AbortSignal): void {
  const sync = function (): void {
    if (!isCurrent() || loadLocalMemory(session.id)) return;
    try {
      const record = { topic: session.topic || '', ts: Date.now(), messages: [] as Array<{ role: string | undefined; content: string }> };
      (session.messages || []).slice(-LOCAL_MEMORY_MAX).forEach(function (message) {
        let text = '';
        if (message.rawText) {
          text = message.rawText;
        } else if (message.html) {
          text = message.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        text = text.replace(/^Thinking\.\.\.\s*/i, '').replace(/^Thinking\s*/i, '').trim();
        if (!text) return;
        record.messages.push({ role: message.role, content: text });
      });
      let bytes = record.messages.reduce((total, message) => total + message.content.length, 0);
      while (bytes > 1_000_000 && record.messages.length) bytes -= record.messages.shift()!.content.length;
      if (isCurrent() && record.messages.length) batchSetItem(_memKey(session.id), JSON.stringify(record));
    } catch (error) {
      /* mirror failed */
      reportSwallow(error, 'session/historyRestore.mirrorSessionHistory');
    }
  };
  whenSessionIdle(sync, 2000, signal);
}
