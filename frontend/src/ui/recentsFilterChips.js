import { esc } from '../render/helpers.js';

/* ─────────────────────────────────────────────────────────────
   ui/recentsFilterChips.js
   Renders the secondary filter chip row in the Recents panel.
   Upgraded for P_socratic-sidebar:
     - emits the unified .chip class (theme + state handled by
       sidebar/filterState.js's syncChipDOM)
     - uses data-chip attributes + aria-pressed that the unified
       apply loop targets, instead of the legacy .active class
       alone
     - uses onSidebarChipClick (unified route) instead of the
       legacy onRecentsFilterChipClick — both functions exist
       on window so this is a backwards-compatible change
     - carries the legacy .recents-filter-chip-btn class as a
       no-op alias so any old CSS that targets it (none in this
       codebase after the brand upgrade) still applies
   ───────────────────────────────────────────────────────────── */

function chip(label, val, isActive, opts) {
  opts = opts || {};
  var safeVal = val == null ? "all" : String(val);
  var isTag = !!opts.tag;
  var classes = ["chip"];
  if (isTag) classes.push("chip--tag");

  var aria = isActive ? "true" : "false";
  var cls = isActive ? " is-active" : "";
  var html = '<button type="button" class="' + classes.join(" ") + cls +
    '" data-chip="' + esc(safeVal) + '"' +
    ' aria-pressed="' + aria + '"' +
    ' onclick="onSidebarChipClick(\'' + esc(safeVal) + '\')">';

  if (isTag) {
    /* Tag chip — Newsreader serif label with a quiet "#" prefix
       in italic body type. Reads like a citation marker. */
    html += '<span class="chip-label">' +
              '<span class="chip-prefix" aria-hidden="true">#</span>' +
              esc(opts.tagLabel || label) +
            '</span>';
  } else {
    html += '<span class="chip-label">' + esc(label) + '</span>';
  }

  html += '</button>';
  return html;
}

export function buildRecentsFilterChipsHTML(currentFilter, tags) {
  tags = (tags || []).slice();
  var html = [];
  /* "All" chip — when no filter is set, all is pressed. */
  html.push(chip("All", null, !currentFilter));

  /* "Pinned" chip — inline SVG bookmark so it stays a one-button
     element. Inherits chip-icon sizing from the .chip class. */
  var pinActive = currentFilter === "pinned";
  html.push('<button type="button" class="chip' + (pinActive ? " is-active" : "") +
    '" data-chip="pinned" aria-pressed="' + (pinActive ? 'true' : 'false') +
    '" onclick="onSidebarChipClick(\'pinned\')" title="Pinned">' +
    '<svg class="chip-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2 H12 V14 L8 11 L4 14 Z"/></svg>' +
    '<span class="chip-label">Pinned</span></button>');

  /* Tag chips — render whatever tags the user has accumulated.
     Include the currently-active tag even if it isn't in the
     top-N list (e.g. user just typed a tag in the editor). */
  var tagSet = {};
  tags.forEach(function (t) { tagSet[t] = true; });
  if (currentFilter && currentFilter !== "pinned" && !tagSet[currentFilter]) {
    tags.push(currentFilter);
  }
  if (tags.length) {
    html.push('<span class="recents-filter-chips-sep" aria-hidden="true"></span>');
    tags.forEach(function (t) {
      html.push(chip(t, t, currentFilter === t, { tag: true, tagLabel: t }));
    });
  }
  return html.join("");
}

export function renderRecentsFilterChips(options) {
  options = options || {};
  var el = document.getElementById(options.targetId || "recentsFilterChips");
  if (!el) return;
  el.innerHTML = buildRecentsFilterChipsHTML(options.currentFilter, options.tags || []);
  /* Re-sync aria-pressed + .is-active based on the *current*
     filter, in case renderRecents() was triggered by a path
     other than onSidebarChipClick (e.g. switching back from a
     different panel). Cheap and idempotent. */
  try {
    if (typeof window.applySidebarFilter === "function") {
      window.applySidebarFilter();
    }
  } catch (_) {}
}
