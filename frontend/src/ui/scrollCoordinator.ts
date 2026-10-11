/**
 * One arbitration point for programmatic transcript scroll writes.
 *
 * Several UI surfaces can legitimately request a position in the same frame:
 * streamed content wants the bottom, keyboard compensation wants to preserve
 * the reader's offset, and a newly submitted turn wants the prompt at the
 * top. The last write used to win, so those requests could visibly fight.
 * Claims give those requests an explicit priority without changing native
 * user scrolling.
 */

export type ScrollOwner =
  | 'content'
  | 'history'
  | 'keyboard'
  | 'finish'
  | 'retry'
  | 'turn'
  | 'user';

interface ScrollClaim {
  owner: ScrollOwner;
  priority: number;
  token: number;
}

const PRIORITY: Record<ScrollOwner, number> = {
  content: 10,
  history: 20,
  keyboard: 30,
  finish: 40,
  retry: 50,
  turn: 60,
  user: 100,
};

const claims = new WeakMap<HTMLElement, ScrollClaim>();
let nextToken = 0;

function priorityFor(owner: ScrollOwner | string): number {
  return PRIORITY[owner as ScrollOwner] || 0;
}

/** Claim the right to animate or repeatedly correct a transcript. */
export function beginScrollOwner(
  list: HTMLElement | null,
  owner: ScrollOwner,
): number | null {
  if (!list) return null;
  const current = claims.get(list);
  const priority = priorityFor(owner);
  if (current && current.priority > priority) return null;
  const token = ++nextToken;
  claims.set(list, { owner, priority, token });
  return token;
}

/** Release only the claim created by this particular motion. */
export function endScrollOwner(list: HTMLElement | null, token: number | null): void {
  if (!list || token == null) return;
  if (claims.get(list)?.token === token) claims.delete(list);
}

/**
 * Apply a programmatic scroll position if a higher-priority motion does not
 * currently own the list. Same-priority writes remain allowed because a new
 * send/retry legitimately supersedes the previous operation of that class.
 */
export function writeScrollTop(
  list: HTMLElement | null,
  top: number,
  owner: ScrollOwner = 'content',
): boolean {
  if (!list || !Number.isFinite(top)) return false;
  const current = claims.get(list);
  if (current && priorityFor(owner) < current.priority) return false;
  list.scrollTop = top;
  return true;
}
