import { openSources, type SourcesPanelEntry } from './sourcesStore';

let loading = false;

/**
 * Open the sources reader, loading its component on first use so the home
 * screen never pays for it.
 */
export function openSourcesPanel(entry: SourcesPanelEntry, trigger?: HTMLElement | null): void {
  openSources(entry, trigger);
  if (loading) return;
  loading = true;
  void import('./SourcesPanel')
    .then(({ mountSourcesPanel }) => mountSourcesPanel())
    .catch(() => {
      loading = false;
    });
}
