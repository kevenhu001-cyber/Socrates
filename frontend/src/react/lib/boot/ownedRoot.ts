import type { ReactNode } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { reportSwallow } from '../../../util/reportSwallow';
import { clearHostMounted, hostIsMounted, hostIsMountedBy, markHostMountedBy } from './ownership';

export interface OwnedRootHandle {
  root: Root;
  render: (content: ReactNode) => void;
  destroy: () => void;
}

const roots = new WeakMap<HTMLElement, { label: string; handle: OwnedRootHandle }>();

/** One root per actual host, including hosts reserved by the lazy boot registry.
 * Replacing a DOM node must not inherit the old node's mounted state.
 * An installer may return a disposer; bridge snapshot objects are ignored. */
function mountRoot(
  host: HTMLElement,
  label: string,
  content: ReactNode,
  install: (() => unknown) | undefined,
  hydrate: boolean,
): OwnedRootHandle {
  const existing = roots.get(host);
  if (existing?.label === label) return existing.handle;
  if (existing || (hostIsMounted(host) && !hostIsMountedBy(host, label))) {
    throw new Error(`React host #${host.id} already belongs to another surface.`);
  }

  const cleanup = install?.();
  let root: Root | null = null;
  try {
    root = hydrate ? hydrateRoot(host, content) : createRoot(host);
    if (!hydrate) root.render(content);
  } catch (error) {
    try {
      root?.unmount();
    } finally {
      if (typeof cleanup === 'function') cleanup();
      clearHostMounted(host);
    }
    throw error;
  }
  const mountedRoot = root;
  const handle: OwnedRootHandle = {
    root: mountedRoot,
    render: (nextContent) => {
      if (roots.get(host)?.handle === handle) mountedRoot.render(nextContent);
    },
    destroy: () => {
      // A stale handle must never release a newer root on the same host.
      if (roots.get(host)?.handle !== handle) return;
      try {
        mountedRoot.unmount();
      } finally {
        try {
          if (typeof cleanup === 'function') cleanup();
        } finally {
          roots.delete(host);
          clearHostMounted(host);
        }
      }
    },
  };
  roots.set(host, { label, handle });
  markHostMountedBy(host, label);
  return handle;
}

/** Ordinary roots replace fallback children on their first render. */
export function mountOwnedRoot(host: HTMLElement, label: string, content: ReactNode, install?: () => unknown): OwnedRootHandle {
  return mountRoot(host, label, content, install, false);
}

/** Hydration adopts existing shell nodes and shares ordinary root cleanup. */
export function hydrateOwnedRoot(host: HTMLElement, label: string, content: ReactNode, install?: () => unknown): OwnedRootHandle {
  return mountRoot(host, label, content, install, true);
}

/** Batch-managed roots for independent tool turns. Updates reuse their root;
 * every member is released before the legacy owner clears its containers. */
export function createRootGroup(label: string) {
  const members = new Map<HTMLElement, OwnedRootHandle>();
  const release = (host: HTMLElement) => {
    members.get(host)?.destroy();
  };
  return {
    render(host: HTMLElement, content: ReactNode): OwnedRootHandle {
      const existing = members.get(host);
      if (existing) { existing.render(content); return existing; }
      const handle = mountOwnedRoot(host, label, content, () => () => members.delete(host));
      members.set(host, handle);
      return handle;
    },
    release,
    releaseAll(): void {
      for (const host of [...members.keys()]) {
        try { release(host); }
        catch (error) { reportSwallow(error, `react:release:${label}`); }
      }
    },
  };
}

/** Root presence is distinct from a boot registry reservation. */
export function hasOwnedRoot(host: HTMLElement): boolean {
  return roots.has(host);
}

/** A feature has one current host. Release detached hosts before replacing
 * them, so their subscriptions and portals cannot survive a shell remount. */
export function createRootSlot(label: string) {
  let current: { host: HTMLElement; handle: OwnedRootHandle } | null = null;
  return {
    mount(host: HTMLElement, content: ReactNode, install?: () => unknown): OwnedRootHandle {
      if (current?.host === host) {
        current.handle.render(content);
        return current.handle;
      }
      if (current) {
        current.handle.destroy();
      }
      const handle = mountOwnedRoot(host, label, content, install);
      current = { host, handle };
      return handle;
    },
    destroy(): void {
      const previous = current;
      current = null;
      previous?.handle.destroy();
    },
  };
}
