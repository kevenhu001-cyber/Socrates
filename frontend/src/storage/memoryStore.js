/* storage/memoryStore.js — Cross-session memory.
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

/* In-memory cache. */
var _memories = null;

/* Load memories from localStorage. Returns an array of
   { id, key, value, createdAt, updatedAt } objects. */
function loadMemories() {
  if (_memories) return _memories;
  try {
    var raw = localStorage.getItem(MEMORY_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        _memories = parsed;
        return _memories;
      }
    }
  } catch { /* ignore */ }
  _memories = [];
  return _memories;
}

/* Persist the current memory array to localStorage. The local store is
   the source of truth for the key/value UI; there is no bulk-sync
   endpoint — server-side memories live in the memories table behind
   /api/memory (GET/POST/PATCH/DELETE) and are recalled server-side. */
function saveMemories() {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(_memories || []));
  } catch { /* localStorage full or private mode */ }
}

/* Load memories from the server on boot. Server rows carry { text,
   enabled, scope, ... } rather than key/value, so map them into the
   local shape and merge by id — overwriting wholesale would drop any
   locally-added entries. */
function loadFromServer() {
  if (typeof window.apiFetch !== "function") return;
  try {
    window.apiFetch("/api/memory", { method: "GET" })
      .then(function (res) {
        if (!res || !Array.isArray(res.memories)) return;
        var serverRows = res.memories.map(function (m) {
          return m && {
            id: m.id || _genId(),
            key: m.key || (m.scope === "project" ? "project" : "fact"),
            value: m.value || m.text || "",
            createdAt: m.createdAt || Date.now(),
            updatedAt: m.updatedAt || m.createdAt || Date.now(),
          };
        }).filter(function (m) { return m && m.enabled !== false && m.value; });
        if (!serverRows.length) return;
        var seen = {};
        serverRows.forEach(function (m) { seen[m.id] = true; });
        var merged = serverRows.concat(
          loadMemories().filter(function (m) { return m && !seen[m.id]; })
        );
        _memories = merged.slice(-MEMORY_CAP);
        saveMemories();
      })
      .catch(function () { /* server fetch failed — use local */ });
  } catch { /* ignore */ }
}

/* Generate a short unique id for a memory entry. */
function _genId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

/* Add or update a memory. `key` is a short label (e.g. "name",
   "preference"), `value` is the text content. If a memory with the
   same key already exists, it is updated. Returns the entry. */
function setMemory(key, value) {
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
function removeMemory(id) {
  var memories = loadMemories();
  var idx = memories.findIndex(function (m) { return m.id === id; });
  if (idx < 0) return false;
  memories.splice(idx, 1);
  saveMemories();
  return true;
}

/* Remove a memory by key. Returns true if found and removed. */
function removeMemoryByKey(key) {
  var memories = loadMemories();
  var idx = memories.findIndex(function (m) { return m.key === key; });
  if (idx < 0) return false;
  memories.splice(idx, 1);
  saveMemories();
  return true;
}

/* Get all memories. Returns a copy of the array. */
function getAllMemories() {
  return (loadMemories() || []).slice();
}

/* Clear all memories. */
function clearAllMemories() {
  _memories = [];
  saveMemories();
}

/* Build a context string to inject into the system prompt.
   If there are no memories, returns an empty string. */
function injectMemoryContext() {
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
  window.memoryStore = _exports;
  window.setMemory = setMemory;
  window.removeMemory = removeMemory;
  window.getAllMemories = getAllMemories;
  window.clearAllMemories = clearAllMemories;
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
