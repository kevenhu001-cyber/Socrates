/* Lazy page loader — shared by the mount registry specs and the
   sidebar nav's page-mount entry points (pageMounts.ts).

   The first call for a host shows a lightweight "Loading…" placeholder
   with aria-busy while the page chunk is imported; the hostId is then
   recorded so repeat navigations skip the placeholder. The load callback
   itself runs on every call — page mount functions are idempotent. */

const loadedPages = new Set<string>();

export function loadPage(hostId: string, load: () => Promise<void>): void {
  const host = document.getElementById(hostId);
  if (host && !loadedPages.has(hostId)) {
    host.classList.remove('visually-hidden');
    host.textContent = 'Loading…';
    host.setAttribute('aria-busy', 'true');
  }
  void load().then(() => loadedPages.add(hostId)).catch(() => {
    if (host) host.textContent = 'Could not load this page. Please try again.';
  }).finally(() => host?.removeAttribute('aria-busy'));
}
