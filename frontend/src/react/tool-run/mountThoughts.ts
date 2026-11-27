import { openThoughts, toggleThoughts, type ThoughtsPanelEntry } from './thoughtsStore';

let loading = false;

function ensurePanelLoaded(): void {
  if (loading) return;
  loading = true;
  void import('./ThoughtsPanel')
    .then(({ mountThoughtsPanel }) => mountThoughtsPanel())
    .catch(() => {
      loading = false;
    });
}

/**
 * Open or toggle the Thoughts drawer/sheet, lazy-loading its module on first
 * interaction so initial bundle and home screen pay zero cost.
 */
export function openThoughtsPanel(entry: ThoughtsPanelEntry, trigger?: HTMLElement | null): void {
  openThoughts(entry, trigger);
  ensurePanelLoaded();
}

export function toggleThoughtsPanel(entry: ThoughtsPanelEntry, trigger?: HTMLElement | null): void {
  toggleThoughts(entry, trigger);
  ensurePanelLoaded();
}
