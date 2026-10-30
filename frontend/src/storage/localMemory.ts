// src/storage/localMemory.ts — Phase 1.5 extraction (main.js A.5)
// Per-session localStorage mirror of conversation messages. The server
// stores the rendered HTML of each message, but on a hard refresh the
// assistant text can drift (formatting changes, code-block re-render,
// etc.) and we lose the *raw* text we actually sent the model. To keep
// the model grounded in what it has seen, we also keep a localStorage
// copy of the last 200 plain-text messages per session.
//
// - key:    socrates-memory-<sessionId>
// - value:  { topic, ts, messages:[{role, content}] }
// - cap:    LOCAL_MEMORY_MAX messages / 1MB; older entries are dropped.
// - If localStorage is full or unavailable, every write is silently
//   dropped — never throws.
import { batchSetItem } from '../batchStorage.ts';
import { stateStore } from '../state/store.ts';
import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';

export interface LocalMemoryMessage {
  role: string;
  content: string;
}

export interface LocalMemoryRecord {
  topic: string;
  ts: number;
  messages: LocalMemoryMessage[];
}

export const LOCAL_MEMORY_MAX = 200;

export function _memKey(sid: string | null | undefined): string {
  return "socrates-memory-" + (sid || "default");
}

export function loadLocalMemory(sid: string | null | undefined): LocalMemoryRecord | null {
  if (!sid) return null;
  try {
    const raw = localStorage.getItem(_memKey(sid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalMemoryRecord | null;
    if (!parsed || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function appendLocalMemory(role: string, content: string | null | undefined): void {
  const sid = stateStore.read('currentSessionId') as string | null;
  if (!sid) return;
  /* Skip "suggest" placeholders — they are UI, not dialogue. */
  if (!content || (typeof content === "string" && !content.trim())) return;
  try {
    const rec: LocalMemoryRecord = loadLocalMemory(sid)
      || { topic: (stateStore.read('topic') as string) || "", ts: Date.now(), messages: [] };
    rec.topic = (stateStore.read('topic') as string) || rec.topic;
    rec.ts = Date.now();
    rec.messages.push({ role: role, content: String(content) });
    if (rec.messages.length > LOCAL_MEMORY_MAX) {
      /* Keep the most recent LOCAL_MEMORY_MAX; drop the oldest 50% to
         avoid trimming on every single message. */
      rec.messages = rec.messages.slice(-LOCAL_MEMORY_MAX);
    }
    /* P_context-race — re-read the session ID right before writing to
       localStorage. If the user switched sessions between the initial
       `sid` read and this write, we'd be appending to the OLD session's
       cache — the next load of the old session would show messages from
       the new session. Re-reading ensures we write to the correct key. */
    const currentSid = stateStore.read('currentSessionId') as string | null;
    if (!currentSid || currentSid !== sid) return;
    batchSetItem(_memKey(currentSid), JSON.stringify(rec));
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: storage/localMemory.ts:71');
    /* QuotaExceeded or private-mode: drop silently. */
  }
}

export function clearLocalMemory(sid: string | null | undefined): void {
  if (!sid) return;
  try { localStorage.removeItem(_memKey(sid)); } catch { /* empty-catch: intentional — storage unavailable */ }
}
