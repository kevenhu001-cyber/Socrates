/**
 * RN-14 — localStorage keys for the learner's own learning records (the
 * flashcard review deck, the cross-session mistake book). Scoped to the
 * signed-in user so a second account on the same browser never sees the
 * first one's cards or mistakes; the boot-time per-user cleanup does not
 * touch them, so they outlast reloads.
 */
export const REVIEW_DECK_BASE = 'socrates-review-deck-v1';
export const MISTAKE_ARCHIVE_BASE = 'socrates-mistake-archive-v1';

interface UserWindow { CURRENT_USER?: { id?: unknown } | null }

function ownerId(): string {
  try {
    const user = typeof window !== 'undefined' ? (window as unknown as UserWindow).CURRENT_USER : null;
    const id = user && (typeof user.id === 'string' || typeof user.id === 'number') ? String(user.id) : '';
    return id || 'guest';
  } catch (_) {
    return 'guest';
  }
}

/** `base:<user id>` (or `base:guest` before / without sign-in). */
export function learnerStorageKey(base: string): string {
  return `${base}:${ownerId()}`;
}

/** The current user's keys, for account deletion. */
export function learnerStorageKeys(): string[] {
  return [learnerStorageKey(REVIEW_DECK_BASE), learnerStorageKey(MISTAKE_ARCHIVE_BASE)];
}
