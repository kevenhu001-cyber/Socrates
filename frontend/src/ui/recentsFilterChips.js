import { esc } from '../render/helpers.js';

function chip(label, val, isActive, icon) {
  var safeVal = val == null ? "all" : val;
  var iconHtml = icon ? '<span class="recents-filter-chip-icon">' + icon + '</span>' : '';
  return '<button class="recents-filter-chip-btn' + (isActive ? " active" : "") +
    '" data-filter="' + esc(safeVal) +
    '" onclick="onRecentsFilterChipClick(\'' + esc(safeVal) + '\')">' +
    iconHtml + esc(label) + '</button>';
}

export function buildRecentsFilterChipsHTML(currentFilter, tags, projects) {
  tags = (tags || []).slice();
  var html = [];
  html.push(chip("All", null, !currentFilter));

  /* Project chips — show the current project as a filter chip. */
  var projectChips = [];
  (projects || []).forEach(function (p) {
    var val = "project:" + p.id;
    var active = currentFilter === val;
    if (active || true) {
      /* Always show the active project chip; show others only if they
         have sessions. Since we always render all, we show all. */
      projectChips.push(chip(p.name, val, active, "●"));
    }
  });
  if (projectChips.length) {
    html.push('<span class="recents-filter-chips-sep"></span>');
    html = html.concat(projectChips);
  }

  var tagSet = {};
  tags.forEach(function (t) { tagSet[t] = true; });
  if (currentFilter && currentFilter.indexOf("project:") !== 0 && !tagSet[currentFilter]) {
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
  el.innerHTML = buildRecentsFilterChipsHTML(options.currentFilter, options.tags || [], options.projects || []);
}
