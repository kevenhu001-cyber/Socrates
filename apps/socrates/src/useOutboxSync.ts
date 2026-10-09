import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { createMessageOutbox } from '@socrates/chat';
import { api } from './runtime';
import { storage } from './storage';

/** Owns durable edit operations and retries them on startup, reconnect, and explicit turn drains. */
export function useOutboxSync() {
  const [offlineNotice, setOfflineNotice] = useState(false);
  const outbox = useMemo(() => createMessageOutbox({
    storage,
    // Replay rewrites the text only; stale rows are explicit deletes alongside.
    patchMessage: (sessionId, id, content) => api.messages.patch(id, { content, discardFollowing: false }, sessionId),
    deleteMessage: (sessionId, id) => api.messages.remove(id, sessionId),
    isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  }), []);

  const drainOutbox = useCallback(async () => {
    try {
      await outbox.drainMessageOutbox();
      setOfflineNotice((await outbox.pendingOpCount()) > 0);
    } catch {
      /* empty-catch: intentional — queued edits persist and the next retry can drain them. */
    }
  }, [outbox, setOfflineNotice]);

  useEffect(() => {
    void drainOutbox();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const onOnline = () => { void drainOutbox(); };
      window.addEventListener('online', onOnline);
      return () => window.removeEventListener('online', onOnline);
    }
    return undefined;
  }, [drainOutbox]);

  const resetNotice = useCallback(() => setOfflineNotice(false), []);

  return { outbox, drainOutbox, offlineNotice, setOfflineNotice, resetNotice };
}
