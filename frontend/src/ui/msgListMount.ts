/** Transcript ownership belongs to actual DOM hosts. Both legacy streaming
 * and React consult this neutral module without importing each other's tree. */
let current: { host: HTMLElement; release: () => void } | null = null;
const sharedHosts = new WeakSet<HTMLElement>();

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
