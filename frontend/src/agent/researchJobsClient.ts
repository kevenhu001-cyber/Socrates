import { consumeResearchStream } from './researchStream.ts';
import type { Message, ResearchJob, ResearchJobRequest } from '@socrates/contracts';
import { apiFetch, apiFetchRaw } from '../util/api.ts';
import { stateStore } from '../state/store.js';
import { saveCurrentSession } from '../session/persistence.ts';
import { restoreSessionMessage } from '../session/historyRestore.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { createResearchController, type ResearchScope } from './researchController.ts';

function pending(scope: ResearchScope, value: ResearchJobRequest | null | undefined) {
  const key = `socrates-research-pending:${scope.userId}:${scope.sessionId}`;
  try {
    if (value === null) localStorage.removeItem(key);
    else if (value !== undefined) localStorage.setItem(key, JSON.stringify(value));
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 5000) return null;
    const saved = JSON.parse(raw) as ResearchJobRequest;
    return saved.sessionId === scope.sessionId && saved.projectId === scope.projectId
      && typeof saved.query === 'string' && saved.query.length <= 1200 && typeof saved.idempotencyKey === 'string' ? saved : null;
  } catch { /* empty-catch: intentional — unavailable browser storage cannot block research. */ return null; }
}

export const researchClient = createResearchController({
  list: async (scope, signal) => (await apiFetch<{ jobs: ResearchJob[] }>(`/api/research-jobs?sessionId=${encodeURIComponent(scope.sessionId)}`, { signal })).jobs,
  create: async (body, signal) => {
    if (body.sessionId === stateStore.read('currentSessionId')) await saveCurrentSession();
    signal.throwIfAborted();
    return (await apiFetch<{ job: ResearchJob }>('/api/research-jobs', { method: 'POST', body: { ...body }, signal })).job;
  },
  get: async (id, signal) => (await apiFetch<{ job: ResearchJob }>(`/api/research-jobs/${encodeURIComponent(id)}`, { signal })).job,
  control: async (id, action, signal) => (await apiFetch<{ job: ResearchJob }>(`/api/research-jobs/${encodeURIComponent(id)}/${action}`, { method: 'POST', signal })).job,
  watch: async (id, after, signal, onEvent) => {
    // A separate stream controller releases apiFetchRaw's linked abort
    // listener on every reconnect, including a clean server EOF.
    const stream = new AbortController();
    const abort = () => stream.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) stream.abort();
    try {
      const response = await apiFetchRaw(`/api/research-jobs/${encodeURIComponent(id)}/events`, { signal: stream.signal, headers: { 'Last-Event-ID': String(after) } });
      await consumeResearchStream(response, onEvent, stream.signal);
    } finally { stream.abort(); signal.removeEventListener('abort', abort); }
  },
  hasReport: (job) => (stateStore.read('messages') as Message[]).some((message) => message.clientId === `research-${job.id}`),
  report: async (job, signal) => (await apiFetch<{ message: Message | null }>(`/api/research-jobs/${encodeURIComponent(job.id)}/result`, { signal })).message,
  deliver: (job, message) => {
    if (stateStore.read('currentSessionId') !== job.sessionId) return;
    const messages = stateStore.read('messages') as Message[];
    if (messages.some((entry) => entry.clientId === message.clientId || entry.id === message.id)) return;
    stateStore.dispatch({ type: 'session/append-message', payload: restoreSessionMessage({
      id: message.id, clientId: message.clientId, role: message.role, rawText: message.rawText,
      content: message.content, type: message.type, createdAt: message.createdAt,
    }) });
    publishReactChatRuntime({ type: 'message-added', messageId: message.clientId });
  },
  pending,
  key: () => crypto.randomUUID(),
  delay: (ms, signal) => new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  }),
});

type ResearchWindow = Window & { CURRENT_USER?: { id?: string; tier?: string } | null; incognitoOn?: boolean };
function visibleScope(): ResearchScope | null {
  const win = window as ResearchWindow;
  const sessionId = stateStore.read('currentSessionId') as string | null;
  const userId = win.CURRENT_USER?.id;
  if (!userId || !sessionId || win.incognitoOn || stateStore.read('phase') !== 'chat') return null;
  return { userId, sessionId, projectId: stateStore.read('currentProjectId') as string | null || null };
}

export function installResearchTracking() {
  const sync = () => researchClient.open(visibleScope());
  const unsubscribe = stateStore.subscribe(sync);
  sync();
  return () => { unsubscribe(); researchClient.open(null); };
}

export async function submitResearch(query: string) {
  const scope = visibleScope();
  if (!scope) throw new Error('research_session_required');
  if (!query.trim() || query.trim().length > 1200) throw new Error('research_invalid_query');
  researchClient.open(scope);
  return researchClient.submit(query);
}
