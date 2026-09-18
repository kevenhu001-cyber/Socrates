import type { OutboxItem, Session } from '@socrates/contracts';

const memory = new Map<string, string>();
const prefix = 'socrates.rn.';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = typeof localStorage === 'undefined' ? memory.get(key) : localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  try {
    if (typeof localStorage === 'undefined') memory.set(key, raw);
    else localStorage.setItem(key, raw);
  } catch {
    memory.set(key, raw);
  }
}

function sessions() {
  return read<Session[]>(`${prefix}sessions`, []);
}

function drafts() {
  return read<Record<string, string>>(`${prefix}drafts`, {});
}

function outbox() {
  return read<OutboxItem[]>(`${prefix}outbox`, []);
}

function canvasEdits() {
  return read<Record<string, string>>(`${prefix}canvas-edits`, {});
}

export function cacheSession(session: Session) {
  const next = sessions().filter((item) => item.id !== session.id);
  next.push({ ...session, updatedAt: session.updatedAt || new Date().toISOString() });
  write(`${prefix}sessions`, next.slice(-50));
}

export function readCachedSessions() {
  return sessions().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 50);
}

export function readCachedSession(id: string) {
  return sessions().find((session) => session.id === id) || null;
}

export function saveDraft(sessionId: string, content: string) {
  write(`${prefix}drafts`, { ...drafts(), [sessionId]: content });
}

export function readDraft(sessionId: string) {
  return drafts()[sessionId] || '';
}

/** Local-only Canvas edits mirror the web client's in-memory editedText.
 * They are intentionally device-scoped and never replace the original
 * assistant message sent to the server. */
export function saveCanvasEdit(canvasId: string, content: string) {
  const edits = canvasEdits();
  if (content) edits[canvasId] = content;
  else delete edits[canvasId];
  write(`${prefix}canvas-edits`, edits);
}

export function readCanvasEdit(canvasId: string) {
  return canvasEdits()[canvasId] || '';
}

export function enqueue(item: OutboxItem) {
  const next = outbox().filter((entry) => entry.id !== item.id);
  next.push(item);
  write(`${prefix}outbox`, next);
}

export function readOutbox() {
  return outbox().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function removeOutbox(id: string) {
  write(`${prefix}outbox`, outbox().filter((item) => item.id !== id));
}

export function incrementOutboxRetry(id: string) {
  write(`${prefix}outbox`, outbox().map((item) => item.id === id ? { ...item, retryCount: item.retryCount + 1 } : item));
}
