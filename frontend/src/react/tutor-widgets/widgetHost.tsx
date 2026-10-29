import { flushSync } from 'react-dom';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import type { ReactNode } from 'react';

export function mountTutorWidget(slot: Element, label: string, content: ReactNode) {
  if (!slot.parentNode) return null;
  const host = document.createElement('div');
  slot.replaceWith(host);
  const root = mountOwnedRoot(host, `tutor-widget-${label}`, content);
  flushSync(() => root.render(content));
  return host;
}
