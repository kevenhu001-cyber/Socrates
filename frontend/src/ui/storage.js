/* ui/storage.js — Wave 1c of main-js-split plan.
 * Storage modal: archived sessions list with restore / purge actions.
 * Extracted from main.js (in post-Wave-1b): openStorageModal at L9872,
 * closeStorageModal at L9885, renderArchivedList at L10011.
 *
 * Under the always-on React runtime the modal DOM (#storageModalOverlay)
 * is fully owned by React (frontend/src/react/storageModal/), which
 * renders the archived rows from the published `archived` data. This
 * module therefore never writes modal DOM; it only publishes state
 * through window.__socratesStorageBridge.
 *
 * Touches the following globals:
 *   - getArchivedSessions (from main.js)
 */

var _storageOpen = false;

function _publishStorageState() {
  try {
    var bridge = window.__socratesStorageBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({
        archived: (window.getArchivedSessions ? window.getArchivedSessions() : []).map(function (s) {
          return { id: s.id, title: s.title, topic: s.topic, archivedAt: s.archivedAt };
        }),
        open: _storageOpen,
      });
    }
  } catch (_) { /* swallow */ }
}

function openStorageModal() {
  _storageOpen = true;
  _publishStorageState();
}

function closeStorageModal() {
  _storageOpen = false;
  _publishStorageState();
}

/* Re-publishes the archived list so the React modal refreshes.
   Kept under its legacy name because main.js calls it after
   restore / purge mutations. */
function renderArchivedList() {
  _publishStorageState();
}

export { openStorageModal, closeStorageModal, renderArchivedList };
