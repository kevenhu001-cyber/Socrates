// frontend/src/extensions/chipSync.ts
// M4 increment: quick-action chip active-state sync lives here, not in
// windowExports.js. windowExports.js only re-exports this module and keeps
// a `window.syncQuickChips` alias for the legacy extension context.
//
// Ownership:
// - `#quickResearchChip` reflects `window.webSearchOn`
// - `#quickDeepResearchChip` reflects `window.deepResearchOn`
// Both chips are static shell controls in index.html until the composer is
// fully React-owned (M4 Step 4.5). This module mounts its own listeners
// instead of relying on the deleted document-wide data-action dispatcher.

export function syncQuickChips(root: ParentNode = document): void {
  try {
    const research = (root as Document).getElementById?.('quickResearchChip')
      ?? (root as HTMLElement).querySelector?.('#quickResearchChip');
    if (research) research.classList.toggle('active', !!(window as unknown as { webSearchOn?: unknown }).webSearchOn);
    const deep = (root as Document).getElementById?.('quickDeepResearchChip')
      ?? (root as HTMLElement).querySelector?.('#quickDeepResearchChip');
    if (deep) deep.classList.toggle('active', !!(window as unknown as { deepResearchOn?: unknown }).deepResearchOn);
  } catch {
    /* empty-catch: intentional — chip mirror is best-effort, never throws into extension flow */
  }
}

let mounted = false;

export function mountChipSyncListeners(): () => void {
  if (mounted) return () => undefined;
  mounted = true;
  const onReady = () => { try { syncQuickChips(); } catch { /* empty-catch: intentional — boot-time mirror, safe to skip */ } };
  window.addEventListener('DOMContentLoaded', onReady);
  if (document.readyState !== 'loading') onReady();
  return () => {
    window.removeEventListener('DOMContentLoaded', onReady);
    mounted = false;
  };
}
