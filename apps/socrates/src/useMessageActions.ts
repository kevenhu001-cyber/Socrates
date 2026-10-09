import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Message } from '@socrates/contracts';
import { buildBranchSession, findRegenerateTarget, useChatStore, type MessageOutbox } from '@socrates/chat';
import { useAuthStore } from '@socrates/auth';
import { api } from './runtime';
import { appStringsNow } from './strings';
import { uuidScope } from './sessionIdentity';

type RefCell<T> = { current: T };
type RunTurn = (
  sessionId: string,
  text: string,
  messageAttachments: Message['attachments'],
  persistAttachments?: (serverSessionId: string) => Promise<Message['attachments'] | undefined>,
  assistantPrompt?: string,
) => Promise<void>;

interface UseMessageActionsOptions {
  accountEpoch: RefCell<number>;
  streamAbort: RefCell<AbortController | null>;
  outbox: MessageOutbox;
  drainOutbox: () => Promise<void>;
  runTurn: RunTurn;
  onReturnToChat: () => void;
  setOfflineNotice: Dispatch<SetStateAction<boolean>>;
}

function messageKey(message: { clientId?: string | null; id?: string }): string | null {
  return message.clientId || message.id || null;
}

/** Owns edit, retry, regenerate and transcript branching actions. */
export function useMessageActions({
  accountEpoch,
  streamAbort,
  outbox,
  drainOutbox,
  runTurn,
  onReturnToChat,
  setOfflineNotice,
}: UseMessageActionsOptions) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const draftBackup = useRef<string | null>(null);

  const reset = useCallback(() => {
    setEditingId(null);
    draftBackup.current = null;
  }, []);

  // Queue one half of a failed server sync for replay: every dropped row
  // as an explicit delete plus (for edits) the rewritten text as a patch.
  // Never replay discardFollowing; it could eat turns made after reconnect.
  const queueSyncFailure = useCallback(async (
    sessionId: string, anchorKey: string, newText: string | null, dropped: Message[],
  ) => {
    const sid = uuidScope(sessionId);
    for (const row of dropped) {
      const key = messageKey(row);
      if (key) await outbox.queueMessageOp(sid, key, 'delete');
    }
    if (newText !== null) await outbox.queueMessageOp(sid, anchorKey, 'patch', newText);
    setOfflineNotice(true);
  }, [outbox, setOfflineNotice]);

  const syncAnchor = useCallback(async (
    sessionId: string, anchorKey: string, content: string, dropped: Message[],
  ): Promise<boolean> => {
    try {
      await api.messages.patch(anchorKey, { content, discardFollowing: true }, uuidScope(sessionId));
      return true;
    } catch (error) {
      // A local message may not have a server row yet; the next save persists it.
      if ((error as { status?: number })?.status === 404) return true;
      await queueSyncFailure(sessionId, anchorKey, content, dropped);
      return false;
    }
  }, [queueSyncFailure]);

  // Wait for the prune PATCH before asking again, so it cannot delete the new reply.
  const commitEdit = useCallback(async (anchorId: string, revised: string) => {
    const store = useChatStore.getState();
    const sessionId = store.activeSessionId;
    const session = store.sessions.find((item) => item.id === sessionId);
    const anchor = session?.messages?.find((item) => messageKey(item) === anchorId);
    const next = revised.trim();
    if (!sessionId || !anchor || !next || (anchor.rawText || '').trim() === next) return;
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { store.setStatus('error', appStringsNow().guestSendBlocked); return; }
    if (store.turnId) return;
    setEditingId(null);
    draftBackup.current = null;
    streamAbort.current?.abort();
    const dropped = store.rewindSession(sessionId, anchorId, next);
    if (!dropped) return;
    const anchorKey = messageKey(anchor) || anchorId;
    try {
      await syncAnchor(sessionId, anchorKey, next, dropped);
      await runTurn(sessionId, next, anchor.attachments?.length ? anchor.attachments : undefined);
    } catch (error) {
      store.setStatus('error', error instanceof Error ? error.message : appStringsNow().editFailed);
    }
  }, [runTurn, streamAbort, syncAnchor]);

  const startEdit = useCallback((anchorId: string, text: string) => {
    const store = useChatStore.getState();
    if (store.turnId) return;
    if (draftBackup.current === null) draftBackup.current = store.draft;
    setEditingId(anchorId);
    store.setDraft(text);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    if (draftBackup.current !== null) {
      useChatStore.getState().setDraft(draftBackup.current);
      draftBackup.current = null;
    }
  }, []);

  // Regenerate preserves the user text and queues deletes only if server cleanup fails.
  const regenerate = useCallback(async (assistantId: string) => {
    const store = useChatStore.getState();
    const sessionId = store.activeSessionId;
    const session = store.sessions.find((item) => item.id === sessionId);
    if (!sessionId || !session || store.turnId) return;
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { store.setStatus('error', appStringsNow().guestSendBlocked); return; }
    const target = findRegenerateTarget(session.messages || [], assistantId);
    const userText = (target?.rawText || '').trim();
    const userKey = target ? messageKey(target) : null;
    if (!target || !userText || !userKey) return;
    streamAbort.current?.abort();
    const dropped = store.rewindSession(sessionId, userKey);
    if (!dropped) return;
    try {
      try {
        await api.messages.patch(userKey, { content: userText, discardFollowing: true }, uuidScope(sessionId));
      } catch (error) {
        if ((error as { status?: number })?.status !== 404) {
          await queueSyncFailure(sessionId, userKey, null, dropped);
        }
      }
      await runTurn(sessionId, userText, target.attachments?.length ? target.attachments : undefined);
    } catch (error) {
      store.setStatus('error', error instanceof Error ? error.message : appStringsNow().regenerateFailed);
    }
  }, [queueSyncFailure, runTurn, streamAbort]);

  // Retry the last user turn after dropping an unconfirmed partial reply.
  const retryTurn = useCallback(async () => {
    const store = useChatStore.getState();
    if (store.turnId || store.status !== 'error') return;
    const sessionId = store.activeSessionId;
    const session = store.sessions.find((item) => item.id === sessionId);
    if (!sessionId || !session) return;
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { store.setStatus('error', appStringsNow().guestSendBlocked); return; }
    const messages = session.messages || [];
    let target: Message | null = null;
    for (let index = messages.length - 1; index >= 0; index--) {
      if (messages[index].role === 'user' && (messages[index].rawText || '').trim()) {
        target = messages[index];
        break;
      }
    }
    const text = (target?.rawText || '').trim();
    const key = target ? messageKey(target) : null;
    if (!target || !text || !key) return;
    streamAbort.current?.abort();
    if (!store.rewindSession(sessionId, key)) return;
    try {
      await runTurn(sessionId, text, target.attachments?.length ? target.attachments : undefined);
    } catch (error) {
      store.setStatus('error', error instanceof Error ? error.message : appStringsNow().regenerateFailed);
    }
  }, [runTurn, streamAbort]);

  const branchFrom = useCallback(async (anchorId: string) => {
    const store = useChatStore.getState();
    const session = store.sessions.find((item) => item.id === store.activeSessionId);
    if (!session || store.turnId) return;
    const forked = buildBranchSession(session, anchorId, { id: `session-${Date.now()}` });
    if (!forked) return;
    const epoch = accountEpoch.current;
    store.setSessions([forked, ...store.sessions]);
    store.selectSession(forked.id);
    onReturnToChat();
    try {
      const saved = await api.sessions.save(forked);
      if (epoch === accountEpoch.current) store.adoptSessionId(forked.id, saved);
    } catch {
      /* empty-catch: intentional — keep the branch local until the next library sync */
    }
    void drainOutbox();
  }, [accountEpoch, drainOutbox, onReturnToChat]);

  const commitEditSend = useCallback(() => {
    if (!editingId) return;
    void commitEdit(editingId, useChatStore.getState().draft);
  }, [editingId, commitEdit]);

  return { editingId, reset, startEdit, cancelEdit, regenerate, retryTurn, branchFrom, commitEditSend };
}
