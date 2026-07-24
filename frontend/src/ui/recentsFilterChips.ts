import { esc } from '../render/helpers.js';

function chip(label: string, val: string | null, isActive: boolean, icon?: string): string {
  const safeVal: string = val == null ? "all" : val;
  const iconHtml = icon ? '<span class="recents-filter-chip-icon">' + icon + '</span>' : '';
  return '<button class="recents-filter-chip-btn' + (isActive ? " active" : "") +
    '" data-filter="' + esc(safeVal) +
    '" onclick="onRecentsFilterChipClick(\'' + esc(safeVal) + '\')">' +
    iconHtml + esc(label) + '</button>';
}

export interface RecentsFilterProject {
  id: string;
  name: string;
}

export function buildRecentsFilterChipsHTML(
  currentFilter: string | null | undefined,
  tags: string[],
  projects: RecentsFilterProject[],
): string {
  tags = (tags || []).slice();
  const html: string[] = [];
  html.push(chip("All", null, !currentFilter));

  /* Project chips — show the current project as a filter chip. */
  const projectChips: string[] = [];
  (projects || []).forEach(function (p: RecentsFilterProject) {
    const val = "project:" + p.id;
    const active = currentFilter === val;
    if (active || true) {
      projectChips.push(chip(p.name, val, active, "●"));
    }
  });
  if (projectChips.length) {
    html.push('<span class="recents-filter-chips-sep"></span>');
    html.push(...projectChips);
  }

  const tagSet: Record<string, boolean> = {};
  tags.forEach(function (t: string) { tagSet[t] = true; });
  if (currentFilter && currentFilter.indexOf("project:") !== 0 && !tagSet[currentFilter]) {
    tags.push(currentFilter);
  }
  if (tags.length) {
    html.push('<span class="recents-filter-chips-sep"></span>');
    tags.forEach(function (t: string) {
      html.push(chip("#" + t, t, currentFilter === t));
    });
  }
  return html.join("");
}

/* React mode owns the chip bar's children. The legacy renderer becomes a
   no-op the moment React sets this attribute so its writes don't clobber
   the React tree. Legacy mode never sees the attribute, so the guard
   never trips. */
function _reactOwnsChips(): boolean {
  const el = document.getElementById("recentsFilterChips");
  return !!(el && el.dataset && el.dataset.reactMigrationRuntime === "recents-filter-chips");
}

export interface RecentsFilterChipsOptions {
  targetId?: string;
  currentFilter?: string | null;
  tags?: string[];
  projects?: RecentsFilterProject[];
}

export function renderRecentsFilterChips(options?: RecentsFilterChipsOptions): void {
  options = options || {};
  if (_reactOwnsChips()) return;
  const el = document.getElementById(options.targetId || "recentsFilterChips");
  if (!el) return;
  el.innerHTML = buildRecentsFilterChipsHTML(options.currentFilter, options.tags || [], options.projects || []);
}
