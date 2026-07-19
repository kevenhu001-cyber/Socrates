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

  var tagSet = {};
  tags.forEach(function (t) { tagSet[t] = true; });
  if (currentFilter && !tagSet[currentFilter]) {
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
