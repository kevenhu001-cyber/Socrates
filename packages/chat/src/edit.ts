/* edit — DOM-free edit / regenerate / branch transforms for the chat
 * transcript. Ports the semantics of `frontend/src/chat/editBranch.js`
 * without any DOM:
 *
 * - editing a user turn means "roll back to here and replay": the anchor
 *   turn is rewritten and every later message is dropped (it no longer
 *   makes sense once the turn changed). The server mirrors this through
 *   PATCH /api/messages/:id with discardFollowing=true; rows the server
 *   never confirms deleted are replayed through the message outbox
 *   (./outbox.ts) as explicit per-row deletes — never as a replayed
 *   discardFollowing, which would eat turns created after the reconnect.
 * - regenerating rewinds to the user turn behind an assistant reply and
 *   re-asks with the text unchanged (no patch op is queued for the text).
 * - branching forks the conversation: messages up to and including the
 *   anchor are copied into a fresh session draft.
 *
 * Message identity is the clientId (server rows resolve both id and
 * clientId through findOwnedMessage). All functions are pure: they take
 * a message list and return new lists, never touching the store. */

import type { Message, Session } from '@socrates/contracts';

export interface Rollback {
  kept: Message[];
  dropped: Message[];
}

function keyOf(message: Message): string | null {
  return message.clientId || message.id || null;
}

/** Split the transcript at the anchor: anchor + everything before stays,
 * everything after is dropped. Returns null when the anchor is unknown. */
export function rollbackAfter(messages: Message[], anchorClientId: string): Rollback | null {
  const index = messages.findIndex((m) => keyOf(m) === anchorClientId);
  if (index < 0) return null;
  return { kept: messages.slice(0, index + 1), dropped: messages.slice(index + 1) };
}

/** Rewrite a user turn and drop everything after it. Returns null when
 * the anchor is missing, is not a user turn, or the text is unchanged. */
export function applyEdit(messages: Message[], anchorClientId: string, newText: string): (Rollback & { edited: Message }) | null {
  const next = newText.trim();
  if (!next) return null;
  const index = messages.findIndex((m) => keyOf(m) === anchorClientId);
  if (index < 0) return null;
  const anchor = messages[index];
  if (anchor.role !== 'user') return null;
  if ((anchor.rawText || '').trim() === next) return null;
  const edited: Message = { ...anchor, rawText: next };
  return { kept: [...messages.slice(0, index), edited], dropped: messages.slice(index + 1), edited };
}

/** The user turn a regenerate re-asks: the nearest user message at or
 * before the assistant reply. Null when there is nothing to re-ask. */
export function findRegenerateTarget(messages: Message[], assistantClientId: string): Message | null {
  const index = messages.findIndex((m) => keyOf(m) === assistantClientId);
  if (index < 0) return null;
  for (let i = index; i >= 0; i--) {
    const candidate = messages[i];
    if (candidate.role === 'user' && (candidate.rawText || '').trim()) return candidate;
  }
  return null;
}

/** Rewind for a regenerate: keep through the user turn behind the
 * assistant reply, drop the reply and everything after it. */
export function applyRegenerate(messages: Message[], assistantClientId: string): (Rollback & { target: Message }) | null {
  const target = findRegenerateTarget(messages, assistantClientId);
  if (!target) return null;
  const rolled = rollbackAfter(messages, keyOf(target)!);
  if (!rolled) return null;
  return { ...rolled, target };
}

/** Fork the conversation at the anchor message: a fresh session draft
 * whose history is the transcript up to and including the anchor.
 * Attachments ride along capped at 20 per message (server save cap);
 * exam answers, archive flags and live streaming fields never fork. */
export function buildBranchSession(
  source: Session,
  uptoClientId: string,
  make: { id: string; title?: string | null },
): Session | null {
  const messages = source.messages || [];
  const index = messages.findIndex((m) => keyOf(m) === uptoClientId);
  if (index < 0 || !make.id) return null;
  const branched = messages.slice(0, index + 1).map((m) => ({
    ...m,
    ...(Array.isArray(m.attachments) ? { attachments: m.attachments.slice(0, 20) } : {}),
  }));
  return {
    ...source,
    id: make.id,
    title: make.title ?? `${source.title || source.topic || 'Conversation'} (branch)`,
    messages: branched,
    archivedAt: null,
    examData: null,
    streamingText: null,
    streamingReasoning: null,
    branchedFrom: { sessionId: source.id, messageId: uptoClientId },
  };
}
