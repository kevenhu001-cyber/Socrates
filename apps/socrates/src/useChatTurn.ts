import { useCallback } from 'react';
import type { Attachment, Message, Session } from '@socrates/contracts';
import { runChatTurn, useChatStore } from '@socrates/chat';
import { useAuthStore } from '@socrates/auth';
import { tutorProgressForTurn, type TeachingPlan, type TutorProgressNode } from '@socrates/ui';
import { api, streamConversation } from './runtime';
import { persistStagedAttachment } from './attachmentUpload';
import type { StagedAttachment } from './attachmentModels';
import { appStringsNow } from './strings';

type RefCell<T> = { current: T };

interface UseChatTurnOptions {
  accountEpoch: RefCell<number>;
  streamAbort: RefCell<AbortController | null>;
  loadingDetails: RefCell<Set<string>>;
  drainOutbox: () => Promise<void>;
  projectFilter: string | null;
  staged: StagedAttachment[];
  consumeStaged: (items: ReadonlyArray<Pick<StagedAttachment, 'localId'>>) => void;
  resolveStaged: () => Promise<Attachment[]>;
  stopComposerAudio: () => void;
}

/** Owns fresh sends and the shared stream path used by edit/retry/regenerate. */
export function useChatTurn({
  accountEpoch,
  streamAbort,
  loadingDetails,
  drainOutbox,
  projectFilter,
  staged,
  consumeStaged,
  resolveStaged,
  stopComposerAudio,
}: UseChatTurnOptions) {
  const runTurn = useCallback(async (
    sessionId: string,
    text: string,
    messageAttachments: Message['attachments'],
    persistAttachments?: (serverSessionId: string) => Promise<Message['attachments'] | undefined>,
    assistantPrompt?: string,
  ) => {
    const epoch = accountEpoch.current;
    const controller = new AbortController();
    streamAbort.current = controller;
    try {
      await runChatTurn({
        sessionId,
        turnId: `turn-${Date.now()}`,
        text,
        ...(assistantPrompt ? { assistantPrompt } : {}),
        attachments: messageAttachments?.length ? messageAttachments : undefined,
        signal: controller.signal,
        isCurrent: () => epoch === accountEpoch.current,
        save: (session) => api.sessions.save(session),
        ...(persistAttachments ? { persistAttachments } : {}),
        stream: streamConversation,
      });
    } finally {
      if (streamAbort.current === controller) streamAbort.current = null;
    }
    void drainOutbox();
  }, [accountEpoch, drainOutbox, streamAbort]);

  const submitTurn = useCallback((rawText: string, origin: 'composer' | 'quiz' | 'practice') => {
    const store = useChatStore.getState();
    const text = rawText.trim();
    const snapshot = origin === 'composer' ? staged : [];
    if (!text && !snapshot.length) return;
    if (store.turnId) return;
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { store.setStatus('error', appStringsNow().guestSendBlocked); return; }
    if (store.activeSessionId && loadingDetails.current.has(store.activeSessionId)) {
      store.setStatus('error', appStringsNow().conversationLoading); return;
    }
    stopComposerAudio();
    const previousDraft = store.draft;
    void (async () => {
      let messageAttachments: Message['attachments'] | undefined;
      if (origin === 'composer') {
        try {
          messageAttachments = await resolveStaged();
        } catch (error) {
          useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().prepareAttachmentsFailed);
          return;
        }
      }
      const live = useChatStore.getState();
      if (live.turnId) return;
      let sessionId = live.activeSessionId;
      const titleSource = text || snapshot[0]?.name || 'Attachment';
      if (!sessionId) {
        sessionId = `session-${Date.now()}`;
        live.setSessions([{ id: sessionId, title: titleSource.slice(0, 80), topic: '', mode: 'chat', phase: 'chat', projectId: projectFilter, messages: [] }, ...live.sessions]);
        live.selectSession(sessionId);
      }
      const epoch = accountEpoch.current;
      if (snapshot.length) consumeStaged(snapshot);
      // Preserve the baseline tutor stage machine: free-form answers advance
      // the stage and wrong picks at exercise count as another attempt.
      const turnSession = useChatStore.getState().sessions.find((session) => session.id === sessionId);
      if (turnSession?.mode === 'tutor') {
        const progress = tutorProgressForTurn({
          teachingStage: turnSession.teachingStage,
          substantiveCount: turnSession.substantiveCount,
          practiceAttempts: turnSession.practiceAttempts,
          practicePhase: turnSession.practicePhase,
          currentNode: turnSession.currentNode,
          kbNodes: (turnSession.kbNodes || []) as unknown as TutorProgressNode[],
          teachingPlan: (turnSession.teachingPlan as unknown as TeachingPlan | null) ?? null,
        }, text, origin);
        useChatStore.getState().patchSession(sessionId, progress.patch as Partial<Session>);
      }
      // Upload staged files after the local session has a server id.
      const persist = async (serverSessionId: string) => {
        if (!messageAttachments?.length || epoch !== accountEpoch.current) return undefined;
        const tokens = await api.readTokens();
        return Promise.all(messageAttachments.map(async (attachment) => {
          const row = snapshot.find((item) => item.localId === attachment.id);
          if (!row) return attachment;
          try {
            const fileId = await persistStagedAttachment(row, {
              url: api.files.uploadUrl(),
              token: tokens.accessToken,
              fetch: api.fetchWithAuth,
            }, serverSessionId);
            return fileId ? { ...attachment, fileId } : attachment;
          } catch {
            return attachment;
          }
        }));
      };
      await runTurn(sessionId, text, messageAttachments?.length ? messageAttachments : undefined, persist);
    })();
    // Synthetic sends keep the learner's draft unchanged.
    if (origin !== 'composer') useChatStore.getState().setDraft(previousDraft);
  }, [accountEpoch, consumeStaged, loadingDetails, projectFilter, resolveStaged, runTurn, staged, stopComposerAudio]);

  const send = useCallback(() => {
    submitTurn(useChatStore.getState().draft, 'composer');
  }, [submitTurn]);

  return { runTurn, submitTurn, send };
}
