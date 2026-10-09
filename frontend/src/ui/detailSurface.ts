/** One reusable detail shell for React reasoning and legacy previews. */
type DetailOptions = {
  owner: string;
  title: string;
  meta?: string;
  closeLabel: string;
  content: HTMLElement;
  onClose?: () => void;
};

type Surface = {
  root: HTMLElement;
  backdrop: HTMLButtonElement;
  panel: HTMLElement;
  title: HTMLElement;
  meta: HTMLElement;
  close: HTMLButtonElement;
  body: HTMLElement;
  active: DetailOptions | null;
  trigger: HTMLElement | null;
  inert: boolean | null;
};
const surfaces = new WeakMap<Document, Surface>();

function syncLayout(doc: Document, surface: Surface) {
  const app = doc.getElementById('appShell');
  const sidebar = doc.getElementById('sidebar');
  const available = (doc.defaultView?.innerWidth ?? 0) - (sidebar?.getBoundingClientRect().width ?? 0);
  /* P_summary-parity — the Summary sheet is a bottom sheet at every width
     (see detail.css), matching the reference. Only the artifact drawer docks
     into a reserved column on wide screens, so `thinking` never takes the
     docked branch: that would both reserve a right-hand column the sheet
     does not use and skip the backdrop the sheet relies on. */
  const owner = surface.active?.owner;
  const docked = owner !== 'thinking' && available >= 1060;
  doc.documentElement.dataset.detailLayout = docked ? 'docked' : 'modal';
  surface.panel.setAttribute('aria-modal', String(!docked));
  surface.backdrop.hidden = docked;
  if (app) {
    if (surface.inert === null) surface.inert = app.inert;
    app.inert = docked ? surface.inert : true;
  }
}

function ensureSurface(doc: Document): Surface {
  const existing = surfaces.get(doc);
  if (existing) return existing;
  const root = doc.createElement('div');
  root.className = 'detail-root';
  root.hidden = true;
  root.innerHTML = '<button type="button" class="detail-backdrop" tabindex="-1"></button>'
    + '<aside class="detail-surface" role="dialog" aria-labelledby="detailSurfaceTitle">'
    + '<header class="detail-header"><div class="detail-heading"><h2 id="detailSurfaceTitle"></h2>'
    + '<p class="detail-meta"></p></div><button type="button" class="detail-close">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
    + '</button></header><div class="detail-body"></div></aside>';
  doc.body.appendChild(root);
  const surface: Surface = {
    root,
    backdrop: root.querySelector<HTMLButtonElement>('.detail-backdrop')!,
    panel: root.querySelector<HTMLElement>('.detail-surface')!,
    title: root.querySelector<HTMLElement>('h2')!,
    meta: root.querySelector<HTMLElement>('.detail-meta')!,
    close: root.querySelector<HTMLButtonElement>('.detail-close')!,
    body: root.querySelector<HTMLElement>('.detail-body')!,
    active: null, trigger: null, inert: null,
  };
  surfaces.set(doc, surface);
  const close = () => closeDetailSurface(undefined, doc);
  surface.close.addEventListener('click', close);
  surface.backdrop.addEventListener('click', close);
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
  const surface = ensureSurface(doc);
  const previous = surface.active;
  if (!previous) surface.trigger = doc.activeElement as HTMLElement | null;
  surface.active = options;
  // Ownership changes replace content in place, without a second entrance.
  if (previous && previous.owner !== options.owner) previous.onClose?.();
  surface.root.hidden = false;
  surface.panel.dataset.detailOwner = options.owner;
  surface.panel.className = 'detail-surface' + (options.owner === 'thinking' ? ' thinking-panel' : ' artifact-preview-drawer');
  surface.close.className = 'detail-close' + (options.owner === 'thinking' ? ' thinking-panel-close' : ' artifact-preview-close');
  surface.backdrop.className = 'detail-backdrop';
  surface.panel.removeAttribute('data-thinking-panel');
  surface.backdrop.removeAttribute('data-thinking-panel-backdrop');
  if (options.owner === 'thinking') {
    surface.panel.dataset.thinkingPanel = '1';
    surface.backdrop.dataset.thinkingPanelBackdrop = '1';
  }
  surface.title.textContent = options.title;
  surface.meta.textContent = options.meta ?? '';
  surface.meta.hidden = !options.meta;
  surface.close.setAttribute('aria-label', options.closeLabel);
  surface.backdrop.setAttribute('aria-label', options.closeLabel);
  if (surface.body.firstChild !== options.content) surface.body.replaceChildren(options.content);
  doc.documentElement.dataset.detailOpen = 'true';
  syncLayout(doc, surface);
  if (!previous) surface.close.focus();
}

export function updateDetailSurface(owner: string, meta: string, doc: Document = document): void {
  const surface = surfaces.get(doc);
  if (surface?.active?.owner !== owner) return;
  surface.meta.textContent = meta;
  surface.meta.hidden = !meta;
}

export function closeDetailSurface(owner?: string, doc: Document = document, restoreFocus = true): void {
  const surface = surfaces.get(doc);
  if (!surface?.active || (owner && surface.active.owner !== owner)) return;
  const previous = surface.active;
  surface.active = null;
  surface.root.hidden = true;
  surface.panel.className = 'detail-surface';
  surface.panel.removeAttribute('data-thinking-panel');
  surface.panel.removeAttribute('data-detail-owner');
  surface.backdrop.removeAttribute('data-thinking-panel-backdrop');
  surface.body.replaceChildren();
  delete doc.documentElement.dataset.detailOpen;
  delete doc.documentElement.dataset.detailLayout;
  const app = doc.getElementById('appShell');
  if (app && surface.inert !== null) app.inert = surface.inert;
  surface.inert = null;
  previous.onClose?.();
  if (restoreFocus && surface.trigger?.isConnected) surface.trigger.focus();
  surface.trigger = null;
}
