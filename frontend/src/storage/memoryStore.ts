import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';

/* storage/memoryStore.ts — Cross-session memory.
 *
 * Lets the AI remember user preferences, facts, and goals across
 * conversations. Memories are stored as key-value pairs in
 * localStorage under "socrates-memory-store" and synced to the
 * server via /api/memory when available.
 *
 * The `injectMemoryContext()` function returns a string that can be
 * appended to the system prompt, listing all active memories.
 *
 * Users can view, edit, and delete memories from the settings UI.
 * The memory list is capped at 50 entries; oldest entries are
 * evicted first when the cap is reached.
 */

export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  createdAt: number;
  updatedAt: number;
}

/** Server rows carry { text, enabled, scope, … } instead of key/value. */
interface ServerMemoryRow {
  id?: string;
  key?: string;
  value?: string;
  text?: string;
  scope?: string;
  enabled?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

interface MemoryLegacyWindow extends Window {
  apiFetch?: (path: string, opts?: { method?: string }) => Promise<{ memories?: ServerMemoryRow[] }>;
  memoryStore?: typeof memoryStore;
  setMemory?: typeof setMemory;
  removeMemory?: typeof removeMemory;
  getAllMemories?: typeof getAllMemories;
  clearAllMemories?: typeof clearAllMemories;
}

const MEMORY_KEY = "socrates-memory-store";
const MEMORY_CAP = 50;

/* In-memory cache. */
let _memories: MemoryEntry[] | null = null;

/* Load memories from localStorage. Returns an array of
   { id, key, value, createdAt, updatedAt } objects. */
function loadMemories(): MemoryEntry[] {
  if (_memories) return _memories;
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        _memories = parsed as MemoryEntry[];
        return _memories;
      }
    }
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: storage/memoryStore.ts:64', 'expected');
    /* ignore */
  }
  _memories = [];
  return _memories;
}

/* Persist the current memory array to localStorage. The local store is
   the source of truth for the key/value UI; there is no bulk-sync
   endpoint — server-side memories live in the memories table behind
   /api/memory (GET/POST/PATCH/DELETE) and are recalled server-side. */
function saveMemories(): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(_memories || []));
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: storage/memoryStore.ts:76');
    /* localStorage full or private mode */
  }
}

/* Load memories from the server on boot. Server rows carry { text,
   enabled, scope, ... } rather than key/value, so map them into the
   local shape and merge by id — overwriting wholesale would drop any
   locally-added entries. */
function loadFromServer(): void {
  const apiFetch = (window as MemoryLegacyWindow).apiFetch;
  if (typeof apiFetch !== "function") return;
  try {
    apiFetch("/api/memory", { method: "GET" })
      .then(function (res) {
        if (!res || !Array.isArray(res.memories)) return;
        const serverRows = res.memories.map(function (m): MemoryEntry | null {
          return m && {
            id: m.id || _genId(),
            key: m.key || (m.scope === "project" ? "project" : "fact"),
            value: m.value || m.text || "",
            createdAt: m.createdAt || Date.now(),
            updatedAt: m.updatedAt || m.createdAt || Date.now(),
          };
        }).filter(function (m): m is MemoryEntry { return !!m && m.value !== ""; });
        if (!serverRows.length) return;
        const seen: Record<string, true> = {};
        serverRows.forEach(function (m) { seen[m.id] = true; });
        const merged = serverRows.concat(
          loadMemories().filter(function (m) { return m && !seen[m.id]; })
        );
        _memories = merged.slice(-MEMORY_CAP);
        saveMemories();
      })
      .catch(function () { /* server fetch failed — use local */ });
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: storage/memoryStore.ts:109', 'expected');
    /* ignore */
  }
}

/* Generate a short unique id for a memory entry. */
function _genId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

/* Add or update a memory. `key` is a short label (e.g. "name",
   "preference"), `value` is the text content. If a memory with the
   same key already exists, it is updated. Returns the entry. */
function setMemory(key: unknown, value: unknown): MemoryEntry | null {
  const memories = loadMemories();
  const keyStr = String(key || "").trim();
  const valStr = String(value || "").trim();
  if (!keyStr || !valStr) return null;
  const existing = memories.find(function (m) { return m.key === keyStr; });
  const now = Date.now();
  if (existing) {
    existing.value = valStr;
    existing.updatedAt = now;
  } else {
    /* Evict oldest if at cap. */
    if (memories.length >= MEMORY_CAP) {
      memories.sort(function (a, b) { return (a.updatedAt || 0) - (b.updatedAt || 0); });
      memories.shift();
    }
    memories.push({ id: _genId(), key: keyStr, value: valStr, createdAt: now, updatedAt: now });
  }
  saveMemories();
  return existing || memories[memories.length - 1];
}

/* Remove a memory by id. Returns true if found and removed. */
function removeMemory(id: string): boolean {
  const memories = loadMemories();
  const idx = memories.findIndex(function (m) { return m.id === id; });
  if (idx < 0) return false;
  memories.splice(idx, 1);
  saveMemories();
  return true;
}

/* Remove a memory by key. Returns true if found and removed. */
function removeMemoryByKey(key: string): boolean {
  const memories = loadMemories();
  const idx = memories.findIndex(function (m) { return m.key === key; });
  if (idx < 0) return false;
  memories.splice(idx, 1);
  saveMemories();
  return true;
}

/* Get all memories. Returns a copy of the array. */
function getAllMemories(): MemoryEntry[] {
  return (loadMemories() || []).slice();
}

/* Clear all memories. */
function clearAllMemories(): void {
  _memories = [];
  saveMemories();
}

/* Build a context string to inject into the system prompt.
   If there are no memories, returns an empty string. */
function injectMemoryContext(): string {
  const memories = loadMemories();
  if (!memories.length) return "";
  const lines = memories.map(function (m) {
    return "- " + m.key + ": " + m.value;
  });
  return "\n\n## MEMORY (things I know about the user)\n" + lines.join("\n") + "\n";
}

/* Export for use in main.js and window exports. */
const memoryStore = {
  loadMemories: loadMemories,
  setMemory: setMemory,
  removeMemory: removeMemory,
  removeMemoryByKey: removeMemoryByKey,
  getAllMemories: getAllMemories,
  clearAllMemories: clearAllMemories,
  injectMemoryContext: injectMemoryContext,
  loadFromServer: loadFromServer,
};

/* Attach to window for inline onclick access. */
if (typeof window !== "undefined") {
  const win = window as MemoryLegacyWindow;
  win.memoryStore = memoryStore;
  win.setMemory = setMemory;
  win.removeMemory = removeMemory;
  win.getAllMemories = getAllMemories;
  win.clearAllMemories = clearAllMemories;
}

export { memoryStore };
export {
  loadMemories,
  setMemory,
  removeMemory,
  removeMemoryByKey,
  getAllMemories,
  clearAllMemories,
  injectMemoryContext,
  loadFromServer,
};
