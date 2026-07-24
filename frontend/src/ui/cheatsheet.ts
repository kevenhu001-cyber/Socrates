// src/ui/cheatsheet.ts — Phase 1.3 extraction (main.js A.3)
// Cmd+/ shortcut cheatsheet modal. Builds the four-section table
// (Navigation / Sharing & search / Toggles / Composing) on first
// open and caches it in the DOM. The inline `onclick="closeCheatsheet()"`
// in the modal markup references `window.closeCheatsheet`; the bridge
// in main.js's window-export block (Phase B will move it to
// windowExports.js) keeps the lookup working.

import { esc } from '../render/helpers.js';

/* React migration bridge — publishes cheatsheet open state. */
interface CheatsheetBridge {
  publish: (state: { open: boolean }) => void;
}

function _publishCheatsheetState(open: boolean): void {
  try {
    var bridge = (window as any).__socratesCheatsheetBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({ open: !!open });
    }
  } catch (_) { /* swallow */ }
}

function _reactOwnsCheatsheet(): boolean {
  var root = document.getElementById("cheatsheetReactRoot");
  return !!(root && root.dataset.reactMigrationRuntime === "cheatsheet");
}

/* P5.6 — open / close the shortcut cheatsheet modal. The
   content is a small static table so the user can learn the
   shortcuts without leaving the app. */
export function openCheatsheet(): void {
  if (_reactOwnsCheatsheet()) { _publishCheatsheetState(true); return; }
  var overlay = document.getElementById("cheatsheetOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "cheatsheetOverlay";
    overlay.className = "cmd-k-overlay hidden";
    overlay.onclick = function (ev: MouseEvent) { if (ev.target === overlay) closeCheatsheet(); };
    overlay.innerHTML = '<div class="cmd-k-modal cheatsheet" onclick="event.stopPropagation()"></div>';
    document.body.appendChild(overlay);
  }
  var body = overlay.querySelector(".cheatsheet") as HTMLElement | null;
  if (!body) return;
  body.innerHTML =
    '<div class="modal-head">' +
    '<span class="modal-title">Keyboard shortcuts</span>' +
    '<button class="modal-close" onclick="closeCheatsheet()">×</button>' +
    '</div>' +
    '<div class="cheatsheet-body">' +
    buildCheatsheetSection("Navigation", [
      ["Open search", ["⌘", "K"]],
      ["Toggle sidebar", ["⌘", "B"]],
      ["Open settings", ["⌘", "."]],
      ["New chat", ["⌘", "⇧", "O"]],
      ["Cycle project", ["⌘", "⇧", "P"]]
    ]) +
    buildCheatsheetSection("Sharing & search", [
      ["Share current chat", ["⌘", "⇧", "S"]],
      ["Open project picker", ["⌘", "⇧", "A"]]
    ]) +
    buildCheatsheetSection("Toggles", [
      ["Toggle theme", ["⌘", "⇧", "T"]],
      ["Toggle web search", ["⌘", "⇧", "F"]],
      ["Toggle thinking pill", ["⌘", "⇧", "M"]]
    ]) +
    buildCheatsheetSection("Composing", [
      ["Send (alternative)", ["⌘", "⏎"]],
      ["Edit last prompt", ["↑", "(empty input)"]],
      ["New line", ["⇧", "⏎"]]
    ]) +
    '</div>';
  overlay.classList.remove("hidden");
}

export function buildCheatsheetSection(title: string, rows: Array<[string, string[]]>): string {
  var html = '<div class="cheatsheet-section"><div class="cmd-k-section-label">' + esc(title) + '</div>';
  rows.forEach(function (row) {
    html += '<div class="cheatsheet-row">';
    for (var i = 0; i < row[1].length; i++) {
      html += '<kbd class="cheatsheet-kbd">' + esc(row[1][i]) + '</kbd>';
    }
    html += '<span class="cheatsheet-desc">' + esc(row[0]) + '</span>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

export function closeCheatsheet(): void {
  if (_reactOwnsCheatsheet()) { _publishCheatsheetState(false); return; }
  var overlay = document.getElementById("cheatsheetOverlay");
  if (overlay) overlay.classList.add("hidden");
}
