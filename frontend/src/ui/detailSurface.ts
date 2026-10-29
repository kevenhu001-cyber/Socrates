import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { mountOwnedRoot, type OwnedRootHandle } from '../react/lib/boot/ownedRoot';
import type { DetailSurfaceOptions } from '../react/detailSurface/DetailSurfaceView';
import { reportSwallow } from '../util/reportSwallow.ts';

/** Reusable detail shell for artifact previews. */
type DetailOptions = DetailSurfaceOptions;
type DetailView = typeof import('../react/detailSurface/DetailSurfaceView').DetailSurfaceView;

type Surface = {
  root: HTMLElement;
  reactRoot: OwnedRootHandle;
  backdrop: HTMLButtonElement;
  panel: HTMLElement;
  title: HTMLElement;
  meta: HTMLElement;
  close: HTMLButtonElement;
  body: HTMLElement;
  view: DetailView;
  active: DetailOptions | null;
  trigger: HTMLElement | null;
  inert: boolean | null;
};
const surfaces = new WeakMap<Document, Surface>();
const pendingOptions = new WeakMap<Document, DetailOptions>();
const openRequests = new WeakMap<Document, number>();

function syncLayout(doc: Document, surface: Surface) {
  const app = doc.getElementById('appShell');
  const sidebar = doc.getElementById('sidebar');
  const available = (doc.defaultView?.innerWidth ?? 0) - (sidebar?.getBoundingClientRect().width ?? 0);
  const docked = available >= 1060;
  doc.documentElement.dataset.detailLayout = docked ? 'docked' : 'modal';
  surface.panel.setAttribute('aria-modal', String(!docked));
  surface.backdrop.hidden = docked;
  if (app) {
    if (surface.inert === null) surface.inert = app.inert;
    app.inert = docked ? surface.inert : true;
  }
}

function ensureSurface(doc: Document, DetailSurfaceView: DetailView): Surface {
  const existing = surfaces.get(doc);
  if (existing) return existing;
  const root = doc.createElement('div');
  root.className = 'detail-root';
  root.hidden = true;
  doc.body.appendChild(root);
  const onClose = () => closeDetailSurface(undefined, doc);
  let reactRoot!: OwnedRootHandle;
  flushSync(() => {
    reactRoot = mountOwnedRoot(root, 'detail-surface', createElement(DetailSurfaceView, { options: null, onClose }));
  });
  const surface: Surface = {
    root,
    reactRoot,
    backdrop: root.querySelector<HTMLButtonElement>('.detail-backdrop')!,
    panel: root.querySelector<HTMLElement>('.detail-surface')!,
    title: root.querySelector<HTMLElement>('h2')!,
    meta: root.querySelector<HTMLElement>('.detail-meta')!,
    close: root.querySelector<HTMLButtonElement>('.detail-close')!,
    body: root.querySelector<HTMLElement>('.detail-body')!,
    view: DetailSurfaceView,
    active: null, trigger: null, inert: null,
  };
  surfaces.set(doc, surface);
  doc.addEventListener('keydown', (event) => {
    if (!surface.active || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab' && surface.panel.getAttribute('aria-modal') === 'true') {
      const controls = [...surface.panel.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, iframe, [tabindex="0"]')]
        .filter((el) => !el.hasAttribute('disabled') && !el.hidden && el.getClientRects().length > 0);
      const first = controls[0] ?? surface.close;
      const last = controls[controls.length - 1] ?? surface.close;
      if (event.shiftKey && (doc.activeElement === first || !surface.panel.contains(doc.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (doc.activeElement === last || !surface.panel.contains(doc.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
  });
  doc.defaultView?.addEventListener('resize', () => {
    if (surface.active) syncLayout(doc, surface);
  });
  const sidebar = doc.getElementById('sidebar');
  const Observer = doc.defaultView?.ResizeObserver;
  if (sidebar && Observer) {
    new Observer(() => {
      if (surface.active) syncLayout(doc, surface);
    }).observe(sidebar);
  }
  return surface;
}

export function openDetailSurface(options: DetailOptions, doc: Document = document): void {
  let surface = surfaces.get(doc);
  if (!surface) {
    const previousPending = pendingOptions.get(doc);
    if (previousPending && previousPending.owner !== options.owner) previousPending.onClose?.();
    const request = (openRequests.get(doc) || 0) + 1;
    openRequests.set(doc, request);
    pendingOptions.set(doc, options);
    void import('../react/detailSurface/DetailSurfaceView').then(({ DetailSurfaceView }) => {
      if (openRequests.get(doc) !== request) return;
      const pending = pendingOptions.get(doc);
      if (!pending) return;
      pendingOptions.delete(doc);
      surface = ensureSurface(doc, DetailSurfaceView);
      activateSurface(surface, pending, doc);
    }).catch((error) => {
      if (openRequests.get(doc) === request) {
        pendingOptions.delete(doc);
        options.onClose?.();
      }
      reportSwallow(error, 'ui/detailSurface.ts:openDetailSurface');
    });
    return;
  }
  activateSurface(surface, options, doc);
}

function activateSurface(surface: Surface, options: DetailOptions, doc: Document): void {
  const previous = surface.active;
  if (!previous) surface.trigger = doc.activeElement as HTMLElement | null;
  surface.active = options;
  // Ownership changes replace content in place, without a second entrance.
  if (previous && previous.owner !== options.owner) previous.onClose?.();
  surface.root.hidden = false;
  flushSync(() => surface.reactRoot.render(createElement(surface.view, { options, onClose: () => closeDetailSurface(undefined, doc) })));
  doc.documentElement.dataset.detailOpen = 'true';
  syncLayout(doc, surface);
  if (!previous) surface.close.focus();
}

export function updateDetailSurface(owner: string, meta: string, doc: Document = document): void {
  const pending = pendingOptions.get(doc);
  if (pending?.owner === owner) {
    pendingOptions.set(doc, { ...pending, meta });
    return;
  }
  const surface = surfaces.get(doc);
  if (surface?.active?.owner !== owner) return;
  surface.meta.textContent = meta;
  surface.meta.hidden = !meta;
}

function cancelPendingOpen(owner: string | undefined, doc: Document): void {
  const pending = pendingOptions.get(doc);
  if (!pending || (owner && pending.owner !== owner)) return;
  pendingOptions.delete(doc);
  openRequests.set(doc, (openRequests.get(doc) || 0) + 1);
  pending.onClose?.();
}

export function closeDetailSurface(owner?: string, doc: Document = document, restoreFocus = true): void {
  cancelPendingOpen(owner, doc);
  const surface = surfaces.get(doc);
  if (!surface?.active || (owner && surface.active.owner !== owner)) return;
  const previous = surface.active;
  surface.active = null;
  surface.root.hidden = true;
  flushSync(() => surface.reactRoot.render(createElement(surface.view, { options: null, onClose: () => closeDetailSurface(undefined, doc) })));
  delete doc.documentElement.dataset.detailOpen;
  delete doc.documentElement.dataset.detailLayout;
  const app = doc.getElementById('appShell');
  if (app && surface.inert !== null) app.inert = surface.inert;
  surface.inert = null;
  previous.onClose?.();
  if (restoreFocus && surface.trigger?.isConnected) surface.trigger.focus();
  surface.trigger = null;
}
