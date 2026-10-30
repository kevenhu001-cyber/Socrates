
import { reportSwallow } from '../util/reportSwallow.ts';

/* ── Modal focus + Esc helper ──
   Wire focus management and Escape-to-close onto the legacy modal
   overlays. Pattern from `morePopover.js` (capture-phase Esc listener
   on the open function) and `closeCmdK()` (publish state on close).

   Each modal opens imperatively (legacy code) and closes via a data-action
   handler (delegate.js). Centralize the focus/Esc behavior here so a single
   helper consistent across:
     - #cmdKOverlay   (cmdK.js → closeCmdK)
     - #settingsOverlay (typed settings service → closeSettings; React owns title)
     - #shareOverlay  (share.js → closeShareModal)
     - #usageOverlay  (usage.js → closeUsageModal)
     - #profileOverlay (profile.js → closeProfile)

   Confirm dialog is excluded — it has its own resolver semantics in
   confirm.js; closing on Esc means "false" which the resolver handles.

   Reactive lifecycle: when the legacy renderer pushes an open=true →
   false transition we also need to revert focus to the previous active
   element so screen-reader/keyboard navigation returns to where the user
   was before activating the modal. The publisher callbacks fire from
   each module on close. */

const _wired: Record<string, boolean> = {};
const _openTracker = new Map<string, Element | null>(); // overlay id -> previous activeElement
const _managedFocus = new Set<string>(); // primitive-managed modals skip the legacy Tab trap
type ModalElement = HTMLElement & {
  __onEsc?: (event: KeyboardEvent) => void;
  __handleOpen?: () => void;
  __handleClose?: () => void;
};

function updateAppShellInert() {
  if (typeof document === 'undefined') return;
  const appShell = document.getElementById('appShell');
  if (!appShell) return;
  if (_openTracker.size > 0) {
    appShell.setAttribute('inert', '');
  } else {
    appShell.removeAttribute('inert');
  }
}

/**
 * @param {string} id
 * @param {boolean} isOpen
 * @param {HTMLElement | null} [previousElement]
 * @param {{ focusManaged?: boolean }} [options]
 */
export function setModalOpen(id: string, isOpen: boolean, previousElement: HTMLElement | null = null, options: { focusManaged?: boolean } = {}) {
  if (isOpen) {
    _openTracker.set(id, previousElement || (typeof document !== 'undefined' ? document.activeElement : null));
    if (options.focusManaged) _managedFocus.add(id);
    else _managedFocus.delete(id);
  } else {
    _openTracker.delete(id);
    _managedFocus.delete(id);
  }
  updateAppShellInert();
}

export function trapFocus(e: KeyboardEvent, container: HTMLElement) {
  if (e.key !== 'Tab' || !container) return;
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(function (el) {
    return el.offsetParent !== null || el.getClientRects().length > 0;
  });
  if (candidates.length === 0) {
    e.preventDefault();
    return;
  }
  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first || !container.contains(document.activeElement)) {
      e.preventDefault();
      try { last.focus(); } catch (error) { reportSwallow(error, 'ui/modalA11y.ts:73', 'expected'); }
    }
  } else {
    if (document.activeElement === last || !container.contains(document.activeElement)) {
      e.preventDefault();
      try { first.focus(); } catch (error) { reportSwallow(error, 'ui/modalA11y.ts:78', 'expected'); }
    }
  }
}

function bindModalTabTrap(overlay: HTMLElement) {
  overlay.addEventListener('keydown', function (e: any) {
    trapFocus(e, overlay);
  }, true);
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || _openTracker.size === 0) return;
    const keys = Array.from(_openTracker.keys());
    const activeOverlayId = keys[keys.length - 1];
    if (_managedFocus.has(activeOverlayId)) return;
    const overlay = document.getElementById(activeOverlayId);
    if (overlay && !overlay.classList.contains('hidden')) {
      trapFocus(e, overlay);
    }
  }, true);
}

function focusFirst(overlay: HTMLElement|null) {
  /* Find the first focusable element inside the overlay.
     Focus is normally directed at inputs/textareas/selects; modals
     that need an action button as the primary focus can set
     `data-initial-focus` on that element. */
  const explicit = overlay!.querySelector('[data-initial-focus]');
  if (explicit) { focusEl((explicit as HTMLElement | null)); return; }
  const candidates = overlay!.querySelectorAll(
    'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  for (let i = 0; i < candidates.length; i++) {
    if (focusEl((candidates[i] as HTMLElement | null))) return;
  }
}

function focusEl(el: HTMLElement | null) {
  if (!el || ('disabled' in el && el.disabled)) return false;
  try { el.focus({ preventScroll: true }); return true; }
  catch (_) { try { el.focus(); return true; } catch (__) { return false; } }
}

function bindModalEsc(overlay: HTMLElement, closeFn: () => void) {
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    closeFn();
  }
  overlay.addEventListener('keydown', onKey, true);
  // expose for cleanup if module wants it
  (overlay as ModalElement).__onEsc = onKey;
}

/* installModalA11y — call once per modal at boot.
   opts:
     overlayId  — required, id of the overlay element
     isOpenId   — id of an "open" boolean on the snapshot publisher (legacy
                  uses classList-based open, so we poll MutationObserver).
     onOpen()   — called when the overlay becomes visible (focus first input)
     onClose()  — called when the overlay hides (revert focus)
     closeFn    — function to call when user presses Escape inside overlay
     skipObserve — when true, installModalA11y will NOT install a class
                  MutationObserver; the host module must call handleOpen()
                  and handleClose() itself (useful for showConfirm-style
                  flows where the overlay's state is driven imperatively
                  and an observer would race with the host's logic).
*/
export function installModalA11y(opts: { overlayId: any; closeFn: any; onOpen?: any; onClose?: any; skipObserve?: any; }) {
  const overlay = document.getElementById(opts.overlayId);
  if (!overlay || _wired[opts.overlayId]) return;
  _wired[opts.overlayId] = true;

  function handleOpen() {
    try { _openTracker.set(opts.overlayId, document.activeElement); } catch (error) { reportSwallow(error, 'ui/modalA11y.ts:154'); }
    updateAppShellInert();
    setTimeout(function () { focusFirst(overlay); }, 50);
    if (typeof opts.onOpen === 'function') opts.onOpen();
  }

  function handleClose() {
    const prev = _openTracker.get(opts.overlayId);
    _openTracker.delete(opts.overlayId);
    updateAppShellInert();
    if (prev && typeof (prev as HTMLElement).focus === 'function') {
      try { (prev as HTMLElement).focus({ preventScroll: true }); } catch (error) { reportSwallow(error, 'ui/modalA11y.ts:165', 'expected'); }
    }
    if (typeof opts.onClose === 'function') opts.onClose();
  }

  if (opts.closeFn) bindModalEsc(overlay, opts.closeFn);
  bindModalTabTrap(overlay);

  if (opts.skipObserve) {
    (overlay as ModalElement).__handleOpen = handleOpen;
    (overlay as ModalElement).__handleClose = handleClose;
    return;
  }

  let prevOpen = !overlay.classList.contains('hidden');
  new MutationObserver(function () {
    const open = !overlay.classList.contains('hidden');
    if (open === prevOpen) return;
    prevOpen = open;
    if (open) handleOpen(); else handleClose();
  }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
}
