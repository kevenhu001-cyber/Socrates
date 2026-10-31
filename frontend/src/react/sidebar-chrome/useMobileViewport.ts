import { useSyncExternalStore } from 'react';

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
  return window.innerWidth < 768;
}

function getServerSnapshot(): boolean {
  return false;
}

/** Keep responsive React chrome aligned with the shell's 768px breakpoint. */
export function useMobileViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
