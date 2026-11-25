import { t } from '../../../i18n/index';
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
      host.innerHTML =
        '<div class="workspace-chunk-loading" role="status"><span class="workspace-chunk-loading-label shimmer-text"></span><span class="workspace-chunk-loading-line workspace-skeleton-shimmer"></span><span class="workspace-chunk-loading-line workspace-skeleton-shimmer workspace-chunk-loading-line-short"></span></div>';
      host.querySelector('.workspace-chunk-loading-label')!.textContent = t('common.loading');
      host.setAttribute('aria-busy', 'true');
    }
    current.pending = Promise.resolve()
      .then(load)
      .then((mount) => {
        if (!isCurrentHost()) return false;
        mount(host);
        current.loaded = true;
        return true;
      })
      .catch((error) => {
        reportSwallow(error, `react:page:${hostId}`);
        // Never replace an already-mounted React tree with an error string.
        if (isCurrentHost() && !current.loaded && !hasOwnedRoot(host)) {
          const panel = document.createElement('div');
          panel.className = 'workspace-chunk-loading';
          const message = document.createElement('span');
          message.className = 'workspace-chunk-loading-label';
          message.setAttribute('role', 'alert');
          message.textContent = t('page.loadFailed');
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'btn workspace-chunk-retry';
          retry.textContent = t('common.retry');
          retry.addEventListener('click', () => void loadPage(hostId, load, afterMount));
          panel.append(message, retry);
          host.replaceChildren(panel);
        }
        return false;
      })
      .finally(() => {
        host.removeAttribute('aria-busy');
        current.pending = undefined;
      });
  }
  const pending = current.pending;
  if (!afterMount) return pending;
  return pending
    .then(async (loaded) => {
      if (loaded && isCurrentHost()) await afterMount();
      return loaded;
    })
    .catch((error) => {
      reportSwallow(error, `react:page:${hostId}:after-mount`);
      return false;
    });
}
