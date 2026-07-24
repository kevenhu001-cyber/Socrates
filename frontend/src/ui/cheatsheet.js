// src/ui/cheatsheet.js — Phase 1.3 extraction (main.js A.3)
// Cmd+/ shortcut cheatsheet modal. Builds the four-section table
// (Navigation / Sharing & search / Toggles / Composing) on first
// open and caches it in the DOM. The inline `onclick="closeCheatsheet()"`
// in the modal markup references `window.closeCheatsheet`; the bridge
// in main.js's window-export block (Phase B will move it to
// windowExports.js) keeps the lookup working.
import { esc } from '../render/helpers.js';

/* React migration bridge — publishes cheatsheet open state. */
function _publishCheatsheetState(open) {
  try {
    var bridge = window.__socratesCheatsheetBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({ open: !!open });
    }
  } catch (_) { /* swallow */ }
}

export function openCheatsheet(){
  _publishCheatsheetState(true);
}

export function buildCheatsheetSection(title,rows){
  var html='<div class="cheatsheet-section"><div class="cmd-k-section-label">'+esc(title)+'</div>';
  rows.forEach(function(row){
    html+='<div class="cheatsheet-row">';
    for(var i=0;i<row[1].length;i++){
      html+='<kbd class="cheatsheet-kbd">'+esc(row[1][i])+'</kbd>';
    }
    html+='<span class="cheatsheet-desc">'+esc(row[0])+'</span>';
    html+='</div>';
  });
  html+='</div>';
  return html;
}

export function closeCheatsheet(){
  _publishCheatsheetState(false);
}