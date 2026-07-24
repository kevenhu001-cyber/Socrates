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

var MEMORY_KEY = "socrates-memory-store";
var MEMORY_CAP = 50;

interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  createdAt: number;
  updatedAt: number;
}

interface ApiResponse {
  memories?: MemoryEntry[];
}

/* In-memory cache. */
var _memories: MemoryEntry[] | null = null;

/* Load memories from localStorage. Returns an array of MemoryEntry objects. */
function loadMemories(): MemoryEntry[] {
  if (_memories) return _memories;
  try {
    var raw = localStorage.getItem(MEMORY_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        _memories = parsed as MemoryEntry[];
        return _memories;
      }
    }
  } catch (_e) { /* ignore */ }
  _memories = [];
  return _memories;
}

/* Persist the current memory array to localStorage. */
function saveMemories(): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(_memories || []));
  } catch (_e) { /* localStorage full or private mode */ }
  /* Fire-and-forget sync to server. */
  _syncToServer();
}

/* Sync memories to the server. Non-blocking; failures are ignored. */
function _syncToServer(): void {
  if (typeof (window as any).apiFetch !== "function") return;
  try {
    (window as any).apiFetch("/api/memory", {
      method: "PUT",
      body: { memories: _memories || [] },
      timeoutMs: 10000,
    }).catch(function () { /* server sync failed — local state is preserved */ });
  } catch (_e) { /* ignore */ }
}

/* Load memories from the server on boot. Merges with local state. */
function loadFromServer(): void {
  if (typeof (window as any).apiFetch !== "function") return;
  try {
    (window as any).apiFetch("/api/memory", { method: "GET", timeoutMs: 10000 })
      .then(function (res: ApiResponse) {
        if (res && Array.isArray(res.memories) && res.memories.length) {
          _memories = res.memories as MemoryEntry[];
          saveMemories();
        }
      })
      .catch(function () { /* server fetch failed — use local */ });
  } catch (_e) { /* ignore */ }
}

/* Generate a short unique id for a memory entry. */
function _genId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

/* Add or update a memory. `key` is a short label (e.g. "name",
   "preference"), `value` is the text content. If a memory with the
   same key already exists, it is updated. Returns the entry. */
function setMemory(key: string, value: string): MemoryEntry | null {
  var memories = loadMemories();
  var keyStr = String(key || "").trim();
  var valStr = String(value || "").trim();
  if (!keyStr || !valStr) return null;
  var existing = memories.find(function (m) { return m.key === keyStr; });
  var now = Date.now();
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
  var memories = loadMemories();
  var idx = memories.findIndex(function (m) { return m.id === id; });
  if (idx < 0) return false;
  memories.splice(idx, 1);
  saveMemories();
  return true;
}

/* Remove a memory by key. Returns true if found and removed. */
function removeMemoryByKey(key: string): boolean {
  var memories = loadMemories();
  var idx = memories.findIndex(function (m) { return m.key === key; });
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
  var memories = loadMemories();
  if (!memories.length) return "";
  var lines = memories.map(function (m) {
    return "- " + m.key + ": " + m.value;
  });
  return "\n\n## MEMORY (things I know about the user)\n" + lines.join("\n") + "\n";
}

/* Export for use in main.js and window exports. */
var _exports = {
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
  (window as any).memoryStore = _exports;
  (window as any).setMemory = setMemory;
  (window as any).removeMemory = removeMemory;
  (window as any).getAllMemories = getAllMemories;
  (window as any).clearAllMemories = clearAllMemories;
}

export { _exports as memoryStore };
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
