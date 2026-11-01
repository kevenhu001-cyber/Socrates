import { flushSync } from 'react-dom';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import type { ReactNode } from 'react';

/** Replace a scaffold slot with an owned root. The host div carries
 * `sc-host` + `data-scaffold` so the stream preview and the mounted card
 * share one outer box (see styles/features/learn-scaffolds.css). */
export function mountTutorWidget(slot: Element, label: string, content: ReactNode) {
  if (!slot.parentNode) return null;
  const host = document.createElement('div');
  host.className = 'sc-host';
  host.setAttribute('data-scaffold', label);
  slot.replaceWith(host);
  const root = mountOwnedRoot(host, `tutor-widget-${label}`, content);
  flushSync(() => root.render(content));
  return host;
}
