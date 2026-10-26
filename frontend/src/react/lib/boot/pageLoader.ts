import { reportSwallow } from '../../../util/reportSwallow';
import { hasOwnedRoot } from './ownedRoot';

type PageMount = (host: HTMLElement) => void;
interface PageState {
  loaded: boolean;
  pending?: Promise<boolean>;
}
const pages = new WeakMap<HTMLElement, PageState>();

/** Import once per in-flight host. Resolve against the captured DOM node so
 * a late import cannot mount into a replacement panel or overwrite its UI. */
export function loadPage(
  hostId: string,
  load: () => Promise<PageMount>,
  afterMount?: () => void | Promise<void>,
): Promise<boolean> {
  const host = document.getElementById(hostId);
  if (!host) return Promise.resolve(false);
  let state = pages.get(host);
  if (!state) {
    state = { loaded: hasOwnedRoot(host) };
    pages.set(host, state);
  }
  const current = state;
  const isCurrentHost = () => document.getElementById(hostId) === host;
  if (!current.pending) {
    if (!current.loaded) {
      host.classList.remove('visually-hidden');
      host.innerHTML = '<div class="workspace-chunk-loading" role="status"><span class="workspace-chunk-loading-label shimmer-text">Loading…</span><span class="workspace-chunk-loading-line workspace-skeleton-shimmer"></span><span class="workspace-chunk-loading-line workspace-skeleton-shimmer workspace-chunk-loading-line-short"></span></div>';
      host.setAttribute('aria-busy', 'true');
    }
    current.pending = Promise.resolve().then(load).then((mount) => {
      if (!isCurrentHost()) return false;
      mount(host);
      current.loaded = true;
      return true;
    }).catch((error) => {
      reportSwallow(error, `react:page:${hostId}`);
      // Never replace an already-mounted React tree with an error string.
      if (isCurrentHost() && !current.loaded && !hasOwnedRoot(host)) {
        host.textContent = 'Could not load this page. Please try again.';
      }
      return false;
    }).finally(() => {
      host.removeAttribute('aria-busy');
      current.pending = undefined;
    });
  }
  const pending = current.pending;
  if (!afterMount) return pending;
  return pending.then(async (loaded) => {
    if (loaded && isCurrentHost()) await afterMount();
    return loaded;
  }).catch((error) => {
    reportSwallow(error, `react:page:${hostId}:after-mount`);
    return false;
  });
}
