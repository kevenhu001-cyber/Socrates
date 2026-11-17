/* chat/editBranch.ts — extracted from legacy entry.
 * Edit / regenerate / branch operations. Zero-behavior-change lift.
 * app-local turn entries (askChatTurn, saveCurrentSession, resetApp)
 * resolve via window.* at call time to avoid circular imports.
 */
import {
  dispatchPatches,
  dispatchSession,
  sessionStore,
  updateSessionMessage,
} from '../store/index.ts';
import { turnState, type StreamingTurnController } from './turn/state.ts';
import { quietTurn } from './turn/ui.ts';
import { cancelActiveTurn } from './turn/cancelActiveTurn.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import {
  findMessageIndex,
  messageApiPath,
  MessageEntry,
  rollbackMessagesAfter,
} from '../legacy/messageActions.ts';
import { formatMsg } from '../render/markdown.ts';
import { buildUserContentParts } from '../chat/history.ts';
import { apiFetch } from '../util/api/index.ts';
import { showToast } from '../legacy/toast.js';
import { publishReactChatRuntime } from '../legacy/reactBridge.ts';
import { queueMessageOp } from '../session/mutationOutbox.ts';
import {
  prepareUserEditBranch,
  prepareAssistantRegenerateBranch,
  switchMessageBranch,
} from './branchManager.ts';
import { saveCurrentSession } from '../session/persistence.ts';
import { t } from '../i18n/index.ts';
import { resetApp } from '../app/lifecycle/index.ts';
import { askChatTurn } from './turn/controller.ts';

function _t(key: string) {
  try {
    const v = t(key);
    if (v && v !== key) return v;
  } catch (e) {
    reportSwallow(e, 'editBranch._t.readGlobal');
  }
  return key;
}

/* P0.1 A4 — record a failed edit/regenerate for later replay.
   `anchorId` is the user turn the operation targets, `dropped` is what
   rollbackMessagesAfter removed locally, and `newText` is the rewritten
   turn (null when the text did not change, as in a plain regenerate).
   The deletes go first so a reconnect that already produced fresh turns
   keeps them: the queued ops name rows explicitly instead of re-asserting
   the server's "delete everything after" rule, which would eat exactly
   the turns the user made while the network was down. */
function queueEditReplay(
  anchorId: string | undefined,
  dropped: MessageEntry[],
  newText: string | null | undefined,
) {
  const sid = sessionStore.getState().currentSessionId;
  (dropped || []).forEach(function (m: MessageEntry) {
    if (m && m.clientId) queueMessageOp(sid, m.clientId, 'delete');
  });
  if (anchorId && typeof newText === 'string') {
    queueMessageOp(sid, anchorId, 'patch', newText);
  }
}
function _saveCurrentSession() {
  try {
    saveCurrentSession();
  } catch (e) {
    reportSwallow(e, 'editBranch._saveCurrentSession');
  }
}
function _resetApp() {
  return Promise.resolve(resetApp());
}

let editReplaySequence = 0;

function replayEditedTurnAfterPatch(
  patchPromise: Promise<unknown>,
  editedText: string,
  userId: string,
  content: unknown,
): void {
  const runner =
    (typeof window !== 'undefined' &&
      (window as unknown as { askChatTurn?: typeof askChatTurn }).askChatTurn) ||
    askChatTurn;
  const sessionId = sessionStore.getState().currentSessionId;
  const sequence = ++editReplaySequence;
  const bridge = (
    window as unknown as {
      addStreamingMessage?: (options: {
        onRetry: () => void;
      }) => StreamingTurnController | Promise<StreamingTurnController>;
    }
  ).addStreamingMessage;
  // Mount the replacement answer now: its reserve and send anchor must not
  // wait for a slow PATCH while the browser clamps the truncated transcript.
  let pending: Promise<StreamingTurnController | null> = Promise.resolve(null);
  if (bridge) {
    try {
      pending = Promise.resolve(
        bridge({ onRetry: () => quietTurn(runner(editedText, content)) }),
      ).catch((error) => {
        reportSwallow(error, 'editBranch.precreate');
        return null;
      });
    } catch (error) {
      reportSwallow(error, 'editBranch.precreate');
    }
  }
  void Promise.all([patchPromise, pending]).then(([, controller]) => {
    const messages = sessionStore.getState().messages;
    const users = messages.filter((message) => message.role === 'user');
    const latestUser = users[users.length - 1];
    if (
      sequence !== editReplaySequence ||
      sessionStore.getState().currentSessionId !== sessionId ||
      latestUser?.clientId !== userId ||
      latestUser.rawText !== editedText ||
      controller?.isFinished?.()
    )
      return;
    try {
      quietTurn(runner(editedText, content, controller));
    } catch (error) {
      reportSwallow(error, 'editBranch.commit.replay');
    }
  });
}

export function commitUserMessageEdit(messageId: string, text: string) {
  const idx = findMessageIndex(messageId);
  if (idx < 0) {
    showToast(_t('toast.messageNotFound'));
    return;
  }
  let entry = sessionStore.getState().messages[idx];
  if (!entry || entry.role !== 'user') return;
  const next = String(text || '').trim();
  if (!next) return;
  /* Editing rewinds this user turn and replays it. Later messages no longer
     follow the same conversation, so state remains the only transcript writer. */
  cancelActiveTurn('msg-edit');
  const editedText = next;
  const branchRes = prepareUserEditBranch(messageId, editedText);
  const branchInfo = branchRes ? branchRes.branchInfo : null;
  const updatedEntry = updateSessionMessage(idx, entry.clientId, {
    rawText: editedText,
    html: formatMsg(editedText),
    branchInfo,
  });
  if (!updatedEntry) return;
  entry = updatedEntry;
  const dropped = rollbackMessagesAfter(messageId);
  const patchPromise = apiFetch(messageApiPath(messageId), {
    method: 'PATCH',
    body: { content: editedText, regenerate: false, discardFollowing: true },
  }).catch(function (error) {
    /* A just-created local message may not have reached the session upsert yet. */
    if (error && error.status === 404) return;
    queueEditReplay(messageId, dropped, editedText);
    console.log('[msg-edit] PATCH failed — queued for replay');
    showToast(_t('toast.savedOffline'));
  });

  /* Carry original attachments into the replayed request. */
  const content = buildUserContentParts(editedText, entry.attachments);
  replayEditedTurnAfterPatch(patchPromise, editedText, String(entry.clientId), content);
  void patchPromise;
}

/* remove every message whose position in stateStore.read("messages")
   is greater than `userMessageId`. Removes both the state entry
   and its DOM node. Returns the number of messages dropped.
   Used by commitUserMessageEdit so the conversation "rewinds" to the
   edited turn before the new answer is generated. */
export function regenerateAssistantMessage(messageId: string) {
  /* Hook into the existing streaming pipeline. Locate the user turn
     that produced this assistant reply, rewind the conversation to it
     (locally + server-side), then re-ask. */
  const regenRes = prepareAssistantRegenerateBranch(messageId);
  if (!regenRes) return;
  const userEntry = regenRes.userEntry;
  const userText = userEntry && userEntry.rawText;
  if (!userText) return;
  const userMessageId = userEntry.clientId || userEntry.id;
  /* Prepare branch variants for assistant regeneration (< 1 / 2 >). */
  turnState.pendingAssistantBranchInfo = regenRes.branchInfo;
  /* P0.1 BUG-P01-04 — rewind to the user turn instead of splicing only
     the single assistant bubble. Regenerating a reply invalidates every
     message that followed it, so drop them all from state + DOM (matches
     edit semantics). For the common case (the last assistant
     reply) this removes exactly that bubble; for a mid-conversation
     regenerate it prevents the new reply from being appended out of
     order after stale later turns. */
  const dropped = rollbackMessagesAfter(userMessageId!);
  /* P0.1 BUG-P01-02 — delete the replaced assistant rows server-side so
     a hard reload doesn't resurrect the stale reply. saveCurrentSession
     only upserts (never deletes rows absent from the payload), so the
     old assistant would otherwise persist as an orphan. Reuse the proven
     edit cleanup (PATCH …&discardFollowing) but with regenerate:false —
     the client re-asks locally via askChatTurn, so the server must NOT
     also generate a reply. Requires the user message to have a server
     UUID; a client-only id 400s and is caught (same limitation as edit,
     where the local rewind still holds until the next successful sync). */
  let patchPromise: Promise<unknown> = Promise.resolve();
  if (userMessageId) {
    patchPromise = apiFetch(messageApiPath(userMessageId), {
      method: 'PATCH',
      body: { content: userText, regenerate: false, discardFollowing: true },
    }).catch(function (e) {
      if (!e || e.status === 404) return;
      /* P0.1 A4 — same gap as the edit path: a regenerate that can't
         reach the server leaves the replaced assistant rows orphaned,
         and the upsert-only save can never remove them. The user text
         itself is unchanged here, so only the dropped rows need
         replaying. */
      queueEditReplay(userMessageId, dropped, null);
      console.log('[msg-regen] server cleanup failed — queued for replay');
    });
  }
  /* P0.1 BUG-P01-03 (regenerate parity) — carry the original turn's
     attachments so a regenerate of a message that had an image / PDF /
     text doesn't degrade to text-only. Null for text-only turns. */
  try {
    turnState.pendingChatContent = buildUserContentParts(userText, userEntry.attachments);
  } catch (_) {
    turnState.pendingChatContent = null;
  }
  /* Abort any in-flight stream so the regenerated turn isn't racing
     a previous reply that's still arriving. */
  cancelActiveTurn('msg-regen');
  /* P0.1 NOTE-P01-06 — re-ask only AFTER the server discardFollowing
     settles, so the delete (assistant rows createdAt >= user turn)
     can't land after the fresh reply is saved and wipe it. Mirrors
     message edit. patchPromise resolves even on failure (.catch). */
  const runner =
    (typeof window !== 'undefined' &&
      (window as unknown as { askChatTurn?: typeof askChatTurn }).askChatTurn) ||
    askChatTurn;
  patchPromise.then(function () {
    try {
      quietTurn(runner(userText));
    } catch (e) {
      reportSwallow(e, 'editBranch.regenerateAssistantMessage.replay'); /* regen failed */
    }
  });
}
/* Branch from a message — fork the conversation at this point.
   Saves the current session first, then creates a new session
   whose history only includes messages up to and including the
   branched message. The user can then continue in a different
   direction without affecting the original thread. */
export function branchFromMessage(messageId: string, opts: { reExplain?: boolean }) {
  opts = opts || {};
  /* P1.1 — educational reExplain: when the branch is triggered by the
     re-explain button, inject a pedagogical directive into the system
     prompt so the model explains the topic from a different angle. */
  const reExplain = !!opts.reExplain;
  const branchIdx = findMessageIndex(messageId);
  if (branchIdx < 0) {
    showToast(_t('toast.messageNotFound'));
    return;
  }
  /* Save the current session first so the original branch is
     persisted. */
  _saveCurrentSession();
  /* Build the new session state from messages up to this point.
     We copy the relevant fields from the current state. */
  const branchMessages = sessionStore
    .getState()
    .messages.slice(0, branchIdx + 1)
    .map(function (m) {
      return {
        clientId: m.clientId,
        role: m.role,
        rawText: m.rawText,
        html: m.html,
        type: m.type,
        attachments: Array.isArray(m.attachments) ? m.attachments.slice(0, 20) : [],
      };
    });
  const branchTopic = sessionStore.getState().topic || '';
  const branchTitle = (sessionStore.getState().sessionTitle || branchTopic) + ' (branch)';
  /* P1.1 — branchedFrom metadata: record the source session id and
     the message id where the branch was taken, so the sidebar can
     display "Branched from ..." and the user can navigate back. */
  const branchedFrom = {
    sessionId: sessionStore.getState().currentSessionId || null,
    messageId: messageId,
    reExplain: reExplain,
  };
  /* Reset the app to a clean state, then inject the branched
     messages. We set a flag so the new session starts with the
     branch context instead of a blank topic. */
  const _branchContext = {
    messages: branchMessages,
    topic: String(branchTopic),
    title: String(branchTitle),
    branchedFrom,
  };
  turnState.pendingBranchContext = _branchContext;
  /* Navigate to a new session. resetApp clears state, then we
     re-hydrate from the branch context. */
  _resetApp().then(function (resetProceeded: boolean | void) {
    /* The new-session confirm can be cancelled; resetApp returns false in
       that case. Do NOT continue the branch (push messages / fire a turn)
       against the user's explicit choice. */
    if (resetProceeded === false) {
      turnState.pendingBranchContext = null;
      return;
    }
    /* After resetApp completes, restore the branch context. */
    if (turnState.pendingBranchContext) {
      const ctx = turnState.pendingBranchContext;
      turnState.pendingBranchContext = null;
      dispatchSession({ type: 'session/replace-messages', payload: ctx.messages });
      dispatchPatches({
        session: {
          topic: ctx.topic,
          sessionTitle: ctx.title,
          branchedFrom: ctx.branchedFrom || null,
        },
      });
      /* React owns #msgList. Push a state-synced event so the React
         message list picks up the branched messages from the snapshot.
         The legacy DOM rebuild (innerHTML + per-msg divs + toolbars)
         was reachable only when msg-list was not migrated, which is no
         longer possible after the always-on React runtime landed. */
      publishReactChatRuntime({ type: 'state-synced', reason: 'branch-context-restored' });
      /* Clear the greeting/topic setup so the user sees the
         branched conversation immediately. */
      const ts = document.getElementById('topicSetup');
      if (ts) ts.classList.add('hidden');
      const cv = document.getElementById('chatView');
      if (cv) cv.classList.remove('hidden');
      /* P1.1 — when reExplain is set, append a follow-up message that
         prompts the model to re-explain the last assistant message from
         a different angle. We push a short user message into the
         branched conversation so the model sees it on the next turn. */
      if (reExplain) {
        const reExplainMsg =
          'Please re-explain that from a different angle. Use a different approach, analogy, or teaching method to help me understand better.';
        dispatchSession({
          type: 'session/append-message',
          payload: {
            clientId: 're-explain-' + Date.now(),
            role: 'user',
            rawText: reExplainMsg,
            /* The React message list renders entry.html; without it the
             re-explain prompt appeared as an empty user bubble. */
            html: formatMsg(reExplainMsg),
            type: 'text',
          },
        });
        publishReactChatRuntime({ type: 'state-synced', reason: 're-explain-prompt' });
        /* Fire the re-explain question immediately. */
        const runner =
          (typeof window !== 'undefined' &&
            (window as unknown as { askChatTurn?: typeof askChatTurn }).askChatTurn) ||
          askChatTurn;
        setTimeout(function () {
          try {
            quietTurn(runner(reExplainMsg));
          } catch (e) {
            reportSwallow(e, 'editBranch.branchTitle.reExplain');
          }
        }, 100);
      }
      _saveCurrentSession();
      showToast(
        reExplain ? 'Re-explaining from a different angle' : 'Branched from previous conversation',
      );
    }
  });
}

export { switchMessageBranch };
