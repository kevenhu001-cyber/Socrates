/** Transcript ownership belongs to the concrete React host. Live message
 * state reaches it through the runtime snapshot, including streaming turns. */
let current: { host: HTMLElement; release: () => void } | null = null;
const sharedHosts = new WeakSet<HTMLElement>();
let restoreSharedRoot: ((host: HTMLElement) => void) | null = null;
let cleanupSharedView: (() => void) | null = null;

export function registerSharedMessageListRestorer(restore: (host: HTMLElement) => void): void {
  restoreSharedRoot = restore;
}

export function registerSharedViewCleanup(cleanup: () => void): void {
  cleanupSharedView = cleanup;
}

export function isMsgListMounted(): boolean {
  const host = typeof document === 'undefined' ? null : document.getElementById('msgList');
  return !!host && current?.host === host && !sharedHosts.has(host);
}

/** The disposer is scoped to this claim, so old cleanup cannot clear a new one. */
export function claimReactMessageList(host: HTMLElement, release: () => void): () => void {
  if (sharedHosts.has(host)) throw new Error('A read-only shared transcript cannot be claimed by the live renderer.');
  const claim = { host, release };
  current = claim;
  return () => { if (current === claim) current = null; };
}

export function isSharedMessageList(host: HTMLElement): boolean {
  return sharedHosts.has(host);
}

/** Release React before a share renderer replaces the host's children. */
export function takeOverSharedMessageList(host: HTMLElement): void {
  sharedHosts.add(host);
  if (current?.host === host) current.release();
}

/** Return a public share transcript to live ownership before a session switch. */
export function restoreLiveMessageList(host: HTMLElement): void {
  if (!sharedHosts.has(host)) return;
  sharedHosts.delete(host);
  cleanupSharedView?.();
  restoreSharedRoot?.(host);
}
