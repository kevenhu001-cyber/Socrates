/**
 * Mount registry — single source of truth for the elements React takes
 * over at bootstrap time.
 *
 * Why this exists
 *  - The pre-M2 `bootstrap.tsx` was a 367-line if-else staircase that
 *    imperatively probed the DOM for every host element, installed its
 *    bridge, set a per-host migration marker, and called
 *    `hydrateXxx()` / `mountXxx()`. Each branch was slightly different
 *    from the next (some set the dataset attribute, some set it via the
 *    host's `hydrate` helper), so reading the bootstrap order required
 *    scrolling through every block.
 *  - M2 collapses all of that into a flat array of mount specs. The
 *    spec describes the host id, the mount function, and a label so
 *    `runMountRegistry` can mount the component and record ownership
 *    outside the DOM.
 *
 * Surface area
 *  - `MountSpec` is `{ hostId, label, mount, ensureHost? }`. The
 *    optional `ensureHost(document)` lets specs that need to lazily
 *    create their own host (storage modal, cheatsheet, prompt
 *    templates, workflow layer, thinking panel) do so before the
 *    registry looks the host up by id.
 *  - `runMountRegistry(document)` walks the spec list and dispatches
 *    each entry, recording which specs mounted and which were skipped
 *    (host missing, already mounted).
 *
 * Ownership semantics
 *  - The registry records mounted hosts in a module-private WeakMap.
 *  - Legacy code uses explicit module APIs for the few remaining ownership
 *    decisions, rather than inspecting migration attributes in the DOM.
 */

import { hostIsMounted, hostIsMountedBy as ownsHost, markHostMountedBy as markOwnership } from './ownership.ts';

export type EnsureHostFn = (document: Document) => HTMLElement | null;

/**
 * Mount callback. Receives the host element. Return `false` when the host
 * intentionally remains legacy-owned; every other result records success.
 */
export type MountFn = (host: HTMLElement) => unknown;

export interface MountSpec {
  /** DOM id the React root mounts into. Required. */
  hostId: string;
  /**
   * Stable ownership label. A label may be
   * shared by equivalent hosts (for example both composer roots). It is what
   * shared by equivalent roots.
   */
  label: string;
  /**
   * Optional factory that materialises the host element when it
   * doesn't yet exist on the page (lazy portal roots). When present,
   * the registry calls this BEFORE looking up `hostId`.
   */
  ensureHost?: EnsureHostFn;
  /** Mount callback; receives the host element. */
  mount: MountFn;
}

export interface MountRegistryResult {
  mounted: MountSpec[];
  skipped: MountSpec[];
}

/**
 * Walk every spec in declaration order, find (or create) the host
 * element, skip hosts that already have a `mountedBy` label (idempotent
 * re-runs), call the spec's `mount(host)`, then record the ownership label.
 */
export function runMountRegistry(document: Document): MountRegistryResult {
  const mounted: MountSpec[] = [];
  const skipped: MountSpec[] = [];

  for (const spec of mountRegistry) {
    if (spec.ensureHost) {
      spec.ensureHost(document);
    }
    const host = document.getElementById(spec.hostId);
    if (!host) {
      skipped.push(spec);
      continue;
    }
    if (hostIsMounted(host)) {
      skipped.push(spec);
      continue;
    }
    const result = spec.mount(host);
    if (result === false) {
      skipped.push(spec);
      continue;
    }
    if (spec.label !== 'msg-list') markHostMountedBy(host, spec.label);
    mounted.push(spec);
  }

  return { mounted, skipped };
}

/**
 * Read whether a host element has been mounted by the given label.
 * Convenience helper for the `main.js` style `reactOwnsXxx()` probes
 * that need to decide whether React owns a legacy host.
 */
export function hostIsMountedBy(
  document: Document,
  hostId: string,
  label: string,
): boolean {
  const host = document.getElementById(hostId);
  return ownsHost(host, label);
}

/**
 * Record that a host element is mounted by the given label.
 */
export function markHostMountedBy(host: HTMLElement, label: string): void {
  markOwnership(host, label);
}

/**
 * Master mount list. Populated by `bootstrap.tsx` from a flat array of
 * `MountSpec` literals so the bootstrap sequence stays in declaration
 * order and the registry stays a pure data structure.
 */
export const mountRegistry: MountSpec[] = [];

/** Replace the active specs so repeated bootstrap/HMR runs stay bounded. */
export function configureMountRegistry(specs: ReadonlyArray<MountSpec>): void {
  mountRegistry.splice(0, mountRegistry.length, ...specs);
}
