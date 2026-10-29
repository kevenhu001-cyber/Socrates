import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { mountOwnedRoot, type OwnedRootHandle } from './ownedRoot';

export interface ObservedRootGroupOptions {
  /** Render before returning when legacy callers immediately inspect the DOM. */
  synchronous?: boolean;
}

/** Owns one React root per host and releases roots when legacy DOM removes them. */
export function createObservedRootGroup(label: string, options: ObservedRootGroupOptions = {}) {
  const roots = new Map<HTMLElement, OwnedRootHandle>();
  let observer: MutationObserver | null = null;

  const stopObserving = () => {
    observer?.disconnect();
    observer = null;
  };

  const release = (host: HTMLElement) => {
    const root = roots.get(host);
    if (!root) return;
    roots.delete(host);
    try {
      root.destroy();
    } finally {
      if (roots.size === 0) stopObserving();
    }
  };

  const releaseDetached = () => {
    for (const host of [...roots.keys()]) {
      if (!host.isConnected) release(host);
    }
  };

  const observe = () => {
    if (observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) return;
    observer = new MutationObserver(releaseDetached);
    observer.observe(document.body, { childList: true, subtree: true });
  };

  const render = (host: HTMLElement, content: ReactNode): OwnedRootHandle => {
    observe();
    let root = roots.get(host);
    const commit = () => {
      if (root) {
        root.render(content);
      } else {
        root = mountOwnedRoot(host, label, content);
        roots.set(host, root);
      }
    };
    if (options.synchronous) flushSync(commit);
    else commit();
    return root!;
  };

  return {
    render,
    release,
    releaseAll(): void {
      stopObserving();
      for (const host of [...roots.keys()]) release(host);
    },
  };
}
