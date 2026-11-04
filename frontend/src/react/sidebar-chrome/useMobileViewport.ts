import { useSyncExternalStore } from 'react';

import { isMobileViewport } from '../../sidebar/breakpoints.ts';

const listeners = new Set<() => void>();
let listening = false;

function emitResize(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!listening) {
    window.addEventListener('resize', emitResize);
    listening = true;
  }
  return () => {
    listeners.delete(listener);
    if (listening && listeners.size === 0) {
      window.removeEventListener('resize', emitResize);
      listening = false;
    }
  };
}

function getSnapshot(): boolean {
  return isMobileViewport();
}

function getServerSnapshot(): boolean {
  return false;
}

/** Keep responsive React chrome aligned with the shell's 768px breakpoint
    (sidebar/breakpoints.ts is the single encoding). */
export function useMobileViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
