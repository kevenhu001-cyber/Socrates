import { esc } from '../render/helpers.js';

function chip(label, val, isActive) {
  var safeVal = val == null ? "all" : val;
  return '<button class="recents-filter-chip-btn' + (isActive ? " active" : "") +
    '" data-filter="' + esc(safeVal) +
    '" onclick="onRecentsFilterChipClick(\'' + esc(safeVal) + '\')">' +
    esc(label) + '</button>';
}

export function buildRecentsFilterChipsHTML(currentFilter, tags) {
  tags = (tags || []).slice();
  var html = [];
  html.push(chip("All", null, !currentFilter));

  var pinActive = currentFilter === "pinned";
  html.push('<button class="recents-filter-chip-btn' + (pinActive ? " active" : "") +
    '" data-filter="pinned" onclick="onRecentsFilterChipClick(\'pinned\')" title="Pinned">' +
    '<svg class="icon-inline" viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2 H12 V14 L8 11 L4 14 Z"/></svg>' +
    '<span class="recents-filter-chip-label">Pinned</span></button>');

  var tagSet = {};
  tags.forEach(function (t) { tagSet[t] = true; });
  if (currentFilter && currentFilter !== "pinned" && !tagSet[currentFilter]) {
    tags.push(currentFilter);
  }
  if (tags.length) {
    html.push('<span class="recents-filter-chips-sep"></span>');
    tags.forEach(function (t) {
      html.push(chip("#" + t, t, currentFilter === t));
    });
  }
  return html.join("");
}

export function renderRecentsFilterChips(options) {
  options = options || {};
  var el = document.getElementById(options.targetId || "recentsFilterChips");
  if (!el) return;
  el.innerHTML = buildRecentsFilterChipsHTML(options.currentFilter, options.tags || []);
}
