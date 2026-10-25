import { useLayoutEffect, type RefObject } from 'react';

/** Lift the existing document above the transcript without making chat inert.
 * Measuring the transcript follows composer growth, keyboard and sidebar resize. */
export function useExpandedSurface(ref: RefObject<HTMLDialogElement | null>, expanded: boolean, onClose: () => void) {
  useLayoutEffect(() => {
    const shell = ref.current;
    const transcript = document.getElementById('msgList');
    if (!expanded || !shell || !transcript) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      if (document.querySelector('[data-anchored-menu][data-state="open"]')) return;
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
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [expanded, onClose, ref]);
}
