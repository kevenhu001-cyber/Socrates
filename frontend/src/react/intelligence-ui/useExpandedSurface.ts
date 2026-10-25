import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** True while another layer owns Escape.
 *
 * The expanded surface is lifted over the transcript, not modal: the chat
 * stays interactive underneath it. But a popover or an overlay that is open
 * above the surface closes itself with Escape, and this hook used to swallow
 * the key in the capture phase on `document` — before any of those handlers
 * could run. The command palette, the settings modal and the composer tools
 * popup therefore could not be dismissed with Escape while a surface was
 * expanded. */
function anotherLayerOwnsEscape(): boolean {
  // The composer tools popup is a plain popover, not an overlay: it marks
  // itself on <body> while open and keeps focus on its trigger, so the
  // event target does not reveal that it owns the key.
  if (document.body.classList.contains('composer-tools-open')) return true;
  // FoundationMenu popovers (model switcher, display mode, …).
  if (document.querySelector('[data-anchored-menu][data-state="open"]')) return true;
  // Modal overlays: command palette, settings, share, profile, usage, …
  if (document.querySelector('[id$="Overlay"]:not(.hidden)')) return true;
  return false;
}

/** Lift the existing document above the transcript without making chat inert.
 * Measuring the transcript follows composer growth, keyboard and sidebar resize. */
export function useExpandedSurface(ref: RefObject<HTMLDialogElement | null>, expanded: boolean, onClose: () => void) {
  /** The element that was focused before the surface was expanded. */
  const previousFocus = useRef<HTMLElement | null>(null);
  /** Whether the surface was expanded in the previous render. */
  const wasExpanded = useRef(expanded);

  useLayoutEffect(() => {
    const shell = ref.current;
    const transcript = document.getElementById('msgList');
    if (!expanded || !shell || !transcript) return;

    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const measure = () => {
      const rect = transcript.getBoundingClientRect();
      shell.style.setProperty('--intui-expanded-top', `${rect.top}px`);
      shell.style.setProperty('--intui-expanded-left', `${rect.left}px`);
      shell.style.setProperty('--intui-expanded-width', `${rect.width}px`);
      shell.style.setProperty('--intui-expanded-height', `${rect.height}px`);
    };
    measure();
    shell.querySelector<HTMLButtonElement>('.intui-surface-expand')?.focus({ preventScroll: true });

    const observer = new ResizeObserver(measure);
    observer.observe(transcript);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      if (anotherLayerOwnsEscape()) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    // The rich editor consumes Escape at the target; the expanded surface
    // owns it first, except while a nested menu or IME composition is active.
    document.addEventListener('keydown', dismiss, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      document.removeEventListener('keydown', dismiss, true);
      for (const axis of ['top', 'left', 'width', 'height']) shell.style.removeProperty(`--intui-expanded-${axis}`);
    };
  }, [expanded, onClose, ref]);

  // Focus restoration lives in a passive effect on purpose. React snapshots
  // the focused element when a commit starts and re-focuses it once that
  // commit is done, so a restore performed in the layout phase is undone by
  // React itself: collapsing the surface after typing in the composer left
  // the focus on the composer's tools trigger instead of the toggle.
  useEffect(() => {
    const collapsed = wasExpanded.current && !expanded;
    wasExpanded.current = expanded;
    if (!collapsed) return;
    const shell = ref.current ?? document.querySelector<HTMLElement>('.intui-surface-shell');
    const toggle = shell?.querySelector<HTMLElement>('.intui-surface-expand');
    const target = toggle ?? previousFocus.current;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }, [expanded, ref]);
}
