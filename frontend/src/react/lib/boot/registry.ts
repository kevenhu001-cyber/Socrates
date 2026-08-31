/**
 * Mount registry — single source of truth for the elements React takes
 * over at bootstrap time.
 *
 * Why this exists
 *  - The pre-M2 `bootstrap.tsx` was a 367-line if-else staircase that
 *    imperatively probed the DOM for every host element, installed its
 *    bridge, set `data-react-migration-runtime`, and called
 *    `hydrateXxx()` / `mountXxx()`. Each branch was slightly different
 *    from the next (some set the dataset attribute, some set it via the
 *    host's `hydrate` helper), so reading the bootstrap order required
 *    scrolling through every block.
 *  - M2 collapses all of that into a flat array of mount specs. The
 *    spec describes the host id, the mount function, and a label so
 *    `runMountRegistry` can both install the bridge and tag the host
 *    with `dataset.mountedBy = label` (M2's replacement for the
 *    `data-react-migration-runtime` sentinel).
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
 * Mount sentinel semantics
 *  - The registry owns `host.dataset.mountedBy` as the canonical
 *    "React is mounted here" sentinel. Mount functions MAY check it to
 *    throw on duplicate calls; the registry does NOT pre-set it (so the
 *    check fires only on real duplicates, not on every registry run).
 *  - `main.js`'s `reactOwnsMsgList()` (now `reactOwnsHost(label)`)
 *    reads `host.dataset.mountedBy` to decide whether the legacy
 *    pipeline may own the DOM underneath.
 */

export type EnsureHostFn = (document: Document) => HTMLElement | null;

/**
 * Mount callback. Receives the host element. May return a disposer
 * (so test setups can tear the root down) or `void` — the registry
 * only records success, it does not own the disposer.
 */
export type MountFn = (host: HTMLElement) => unknown;

export interface MountSpec {
  /** DOM id the React root mounts into. Required. */
  hostId: string;
  /**
   * Stable label used to set `host.dataset.mountedBy`. Must be unique
   * across specs (the registry refuses to mount a second host with
   * the same label so the sentinel never aliases). The label is what
   * `main.js`'s `reactOwnsHost(label)` checks, so it must match the
   * legacy `data-react-migration-runtime` string verbatim.
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
 * re-runs), and call the spec's `mount(host)`. Mount functions are
 * responsible for setting `host.dataset.mountedBy = label` (so they can
 * also detect duplicate calls and throw); the registry only verifies
 * the host is fresh.
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
    if (host.dataset.mountedBy) {
      skipped.push(spec);
      continue;
    }
    try {
      spec.mount(host);
      mounted.push(spec);
    } catch (err) {
      throw err;
    }
  }

  return { mounted, skipped };
}

/**
 * Read whether a host element has been mounted by the given label.
 * Convenience helper for the `main.js` style `reactOwnsXxx()` probes
 * that used to compare against `data-react-migration-runtime`.
 */
export function hostIsMountedBy(
  document: Document,
  hostId: string,
  label: string,
): boolean {
  const host = document.getElementById(hostId);
  return !!host && host.dataset.mountedBy === label;
}

/**
 * Tag a host element as mounted by the given label. Mount functions
 * call this once they're committed; legacy code (e.g. test teardown,
 * inline handlers) can use it to read whether React is the owner of
 * a DOM subtree.
 */
export function markHostMountedBy(host: HTMLElement, label: string): void {
  host.dataset.mountedBy = label;
}

/**
 * Master mount list. Populated by `bootstrap.tsx` from a flat array of
 * `MountSpec` literals so the bootstrap sequence stays in declaration
 * order and the registry stays a pure data structure.
 */
export const mountRegistry: MountSpec[] = [];
