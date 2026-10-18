/* chat/promptQueue.ts — in-flight prompt queue (Prompt Queueing).
 *
 * When the model is generating, follow-up thoughts from the user are queued
 * rather than aborting the stream or being ignored. The queue is drained
 * automatically when the streaming turn finishes.
 */

export interface QueuedPrompt {
  id: string;
  text: string;
  sessionId: string | null;
  createdAt: number;
}

type QueueListener = (queue: ReadonlyArray<QueuedPrompt>) => void;

const listeners = new Set<QueueListener>();
let queuedPrompts: QueuedPrompt[] = [];

function emit(): void {
  const snapshot = queuedPrompts.slice();
  for (const listener of listeners) {
    try { listener(snapshot); } catch { /* swallow */ }
  }
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('socrates:promptqueuechange', { detail: { count: queuedPrompts.length } }));
  }
}

export function subscribePromptQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  listener(queuedPrompts.slice());
  return () => { listeners.delete(listener); };
}

export function getQueuedPrompts(): ReadonlyArray<QueuedPrompt> {
  return queuedPrompts;
}

export function enqueuePrompt(input: { text: string; sessionId?: string | null }): QueuedPrompt {
  const item: QueuedPrompt = {
    id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: input.text,
    sessionId: input.sessionId ?? null,
    createdAt: Date.now(),
  };
  queuedPrompts.push(item);
  emit();
  return item;
}

export function dequeuePrompt(sessionId?: string | null): QueuedPrompt | undefined {
  if (!queuedPrompts.length) return undefined;
  if (sessionId) {
    const idx = queuedPrompts.findIndex((p) => !p.sessionId || p.sessionId === sessionId);
    if (idx >= 0) {
      const [item] = queuedPrompts.splice(idx, 1);
      emit();
      return item;
    }
    return undefined;
  }
  const item = queuedPrompts.shift();
  emit();
  return item;
}

export function removeQueuedPrompt(id: string): void {
  const prevLen = queuedPrompts.length;
  queuedPrompts = queuedPrompts.filter((p) => p.id !== id);
  if (queuedPrompts.length !== prevLen) emit();
}

export function clearPromptQueue(): void {
  if (queuedPrompts.length > 0) {
    queuedPrompts = [];
    emit();
  }
}
