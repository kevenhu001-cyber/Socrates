/* ui/storage.js — Wave 1c of main-js-split plan.
 * Storage modal: archived sessions list with restore / purge actions.
 * Extracted from main.js (in post-Wave-1b): openStorageModal at L9872,
 * closeStorageModal at L9885, renderArchivedList at L10011.
 *
 * Touches the following globals:
 *   - getArchivedSessions, restoreSession, confirmPurgeSession (from main.js)
 *   - closeStorageModal (self-call)
 *   - window.esc (from render/helpers.js)
 */

/* React migration bridge — publishes storage state so the React
   compatibility root can render the modal. Installed by
   frontend/src/react/storageModal/storageModalStore.ts under `?react=1`. */
function _publishStorageState(open) {
  try {
    var bridge = window.__socratesStorageBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({
        archived: (window.getArchivedSessions ? window.getArchivedSessions() : []).map(function (s) {
          return { id: s.id, title: s.title, topic: s.topic, archivedAt: s.archivedAt };
        }),
        open: !!open,
      });
    }
  } catch (_) { /* swallow */ }
}

function _reactOwnsStorage() {
  return !!(document.getElementById("storageModalReactRoot") && document.getElementById("storageModalReactRoot").dataset.reactMigrationRuntime === "storage-modal");
}

function openStorageModal() {
  if (_reactOwnsStorage()) {
    _publishStorageState(true);
    return;
  }
  var overlay = document.getElementById("storageModalOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "storageModalOverlay";
    overlay.className = "cmd-k-overlay hidden";
    overlay.onclick = function (ev) { if (ev.target === overlay) closeStorageModal(); };
    overlay.innerHTML = '<div class="cmd-k-modal storage-modal" onclick="event.stopPropagation()"></div>';
    document.body.appendChild(overlay);
  }
  overlay.classList.remove("hidden");
  renderArchivedList();
}

function closeStorageModal() {
  if (_reactOwnsStorage()) {
    _publishStorageState(false);
    return;
  }
  var overlay = document.getElementById("storageModalOverlay");
  if (overlay) overlay.classList.add("hidden");
}

function renderArchivedList() {
  var body = document.querySelector("#storageModalOverlay .storage-modal");
  if (!body) return;
  var archived = window.getArchivedSessions();
  var html =
    '<div class="modal-head">' +
      '<span class="modal-title">Archived sessions (' + archived.length + ')</span>' +
      '<button class="modal-close" onclick="closeStorageModal()">×</button>' +
    '</div>' +
    '<div class="storage-modal-body">' +
      '<div class="storage-modal-desc">These sessions are pending permanent deletion. Deleting a session in Recents first archives it for up to 30 days as a safety net; this list shows any that have not yet been purged. Use Restore to bring one back, or Delete forever to remove it now.</div>' +
      (archived.length ?
        '<div class="storage-list">' + archived.map(function (s) {
          var ageDays = Math.max(0, Math.floor((Date.now() - (s.archivedAt || 0)) / (24 * 60 * 60 * 1000)));
          var remain = Math.max(0, 30 - ageDays);
          return '<div class="storage-row">' +
            '<div class="storage-row-main">' +
              '<div class="storage-row-title">' + window.esc(s.title || s.topic || "(untitled)") + '</div>' +
              '<div class="storage-row-meta">Archived ' + ageDays + ' day' + (ageDays === 1 ? "" : "s") + ' ago · ' + remain + ' day' + (remain === 1 ? "" : "s") + ' left</div>' +
            '</div>' +
            '<div class="storage-row-actions">' +
              '<button class="storage-btn-restore" onclick="restoreSession(\'' + window.esc(s.id) + '\')">Restore</button>' +
              '<button class="storage-btn-delete" onclick="confirmPurgeSession(\'' + window.esc(s.id) + '\')">Delete forever</button>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>' :
        '<div class="storage-empty">No archived sessions. Long-press a session in Recents to send it here.</div>'
      ) +
    '</div>';
  body.innerHTML = html;
}

export { openStorageModal, closeStorageModal, renderArchivedList };
