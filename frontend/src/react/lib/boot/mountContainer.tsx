import { createElement, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ErrorBoundary } from '../../ErrorBoundary';
import { mountOwnedRoot, type OwnedRootHandle } from './ownedRoot';
import { clearHostMounted, hostIsMountedBy } from './ownership';
import type { MountSpec } from './registry';

interface Container {
  anchor: HTMLElement;
  root: OwnedRootHandle;
  hosts: Map<HTMLElement, { key: number; content: ReactNode }>;
}

/** Static shell hosts can share a root while keeping their DOM placement. */
export function createMountContainer(label: string) {
  const containers = new WeakMap<Document, Container>();
  let nextKey = 0;

  function render(container: Container): void {
    container.root.render(
      Array.from(container.hosts, ([host, { key, content }]) =>
        createPortal(<ErrorBoundary>{content}</ErrorBoundary>, host, key),
      ),
    );
  }

  function getContainer(doc: Document): Container {
    const existing = containers.get(doc);
    if (existing) return existing;

    const anchor = doc.createElement('div');
    anchor.hidden = true;
    anchor.dataset.reactMountContainer = label;
    doc.body.appendChild(anchor);
    const container: Container = {
      anchor,
      hosts: new Map(),
      root: mountOwnedRoot(anchor, label, null),
    };
    const observer = new MutationObserver((records) => {
      if (!records.some((record) => record.removedNodes.length)) return;
      let removedHost = false;
      for (const host of container.hosts.keys()) {
        if (host.isConnected) continue;
        container.hosts.delete(host);
        clearHostMounted(host);
        removedHost = true;
      }
      if (!removedHost) return;
      if (container.hosts.size) render(container);
      else {
        observer.disconnect();
        containers.delete(doc);
        container.root.destroy();
        container.anchor.remove();
      }
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    containers.set(doc, container);
    return container;
  }

  return function defineMount(
    hostId: string,
    ownership: string,
    load: () => Promise<ComponentType>,
    ensureHost?: MountSpec['ensureHost'],
  ): MountSpec {
    return {
      hostId,
      label: ownership,
      ensureHost,
      async mount(host) {
        const Component = await load();
        const doc = host.ownerDocument;
        if (doc.getElementById(hostId) !== host || !hostIsMountedBy(host, ownership)) return false;
        const container = getContainer(doc);
        // createRoot used to replace any static shell fallback on first render.
        // A portal appends to its target, so clear the fallback before adoption.
        host.replaceChildren();
        container.hosts.set(host, { key: nextKey++, content: createElement(Component) });
        render(container);
      },
    };
  };
}

/** Ensure a body-level container exists for portals/dialog roots. */
export function ensureBodyContainer(id: string, doc: Document = document): HTMLElement {
  let host = doc.getElementById(id);
  if (!host) {
    host = doc.createElement('div');
    host.id = id;
    doc.body.appendChild(host);
  }
  return host;
}
