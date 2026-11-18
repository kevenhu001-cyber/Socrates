/* Fullscreen and source dialogs for sandboxed visualization cards. */
import { createElement } from 'react';
import { mountOwnedRoot, type OwnedRootHandle } from '../react/lib/boot/ownedRoot';
import { VizModal, type VizModalProps } from '../react/visualization/VizModal.tsx';

export function decodeSrcdoc(srcdoc: string | null | undefined): string {
  return String(srcdoc || '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

type MountedModal = Omit<VizModalProps, 'onClose'>;

/**
 * Mount one modal root and return focus to whatever opened it when React
 * unmounts the shell. The body content is still produced by the markdown /
 * visualization pipeline; only the modal chrome and lifecycle are React.
 */
function mountModal(props: MountedModal): void {
  const opener = document.activeElement as HTMLElement | null;
  const host = document.createElement('div');
  document.body.appendChild(host);
  let closed = false;
  let handle: OwnedRootHandle | null = null;

  const close = (): void => {
    if (closed) return;
    closed = true;
    handle?.destroy();
    host.remove();
    if (opener?.isConnected && typeof opener.focus === 'function') opener.focus();
  };

  try {
    handle = mountOwnedRoot(
      host,
      'viz-modal',
      createElement(VizModal, { ...props, onClose: close }),
    );
  } catch (error) {
    host.remove();
    throw error;
  }
}

export function openVizModal(srcdoc: string | null | undefined, title?: string): void {
  if (!srcdoc) return;
  // srcdoc is HTML-attribute-encoded when it comes from data-srcdoc. Decode
  // it back to raw HTML before putting it into the iframe.
  mountModal({
    variant: 'sandbox',
    content: decodeSrcdoc(srcdoc),
    title: title || 'Canvas',
  });
}

/* like openVizModal but the body is raw HTML, not a sandboxed iframe. Used by
   the image lightbox (matplotlib output) and the code-block fullscreen view.
   The content is our own, not user input. */
export function openVizModalRaw(html: string | null | undefined, title?: string): void {
  if (!html) return;
  mountModal({ variant: 'raw', content: html, title: title || 'Fullscreen' });
}

export function openVizSourceModal(srcdoc: string | null | undefined, title?: string): void {
  if (!srcdoc) return;
  mountModal({
    variant: 'source',
    content: decodeSrcdoc(srcdoc),
    title: (title || 'Canvas') + ' source',
    onCopy: async () => {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function')
        throw new Error('Clipboard is unavailable');
      await navigator.clipboard.writeText(decodeSrcdoc(srcdoc));
    },
  });
}
