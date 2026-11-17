/**
 * Finalise one chat turn: abort paths, usage, turn status, assistant message
 * persistence and streaming_text cleanup.
 */
import { rebaseTurnRuntimeText } from '@socrates/core/turnRuntimeText';
import { settleTurnRuntime } from '@socrates/core/turnRuntime';
import type { TurnRuntime } from '@socrates/contracts';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import { messages, sessions } from '../../../db/schema/index.js';
import { setChatTurnStatus } from '../../../services/core/chatTurns.js';
import { estimateTokens, recordUsage, resolveUsage } from '../../../services/core/usageTracker.js';
import { sanitizePlainText, sanitizeStoredHtml } from '../../../lib/sanitize.js';
import { indexMessageChunks } from '../../../services/embeddings/chunkIndex.js';
import { completedActivitySummary } from '../../../services/turnSummary.js';
import type { SseEmitter } from './sseEmitter.js';
import type { ChatStreamPipelineContext } from './types.js';
import type { ExecutedToolCall } from './turnState.js';

interface FinalizeTurnEvents {
  done(status: 'stopped' | 'failed' | 'done', elapsedMs: number): void;
}

interface FinalizeTurnActivity {
  done(elapsedMs: number): void;
}

export interface FinalizeTurnInput {
  req: ChatStreamPipelineContext['req'];
  emitter: SseEmitter;
  turnEvents: FinalizeTurnEvents;
  activity: FinalizeTurnActivity;
  abortController: AbortController;
  turnId: string | null;
  sessionIdFromQuery: string | null;
  provider: ChatStreamPipelineContext['prep']['payload']['provider'];
  userPrompt: string;
  fullText: string;
  fullReasoning: string;
  turnRuntime: TurnRuntime | null | undefined;
  executedToolCalls: ExecutedToolCall[];
  promptTokens: number;
  completionTokens: number;
  sawProviderUsage: boolean;
  accumulatedProviderUsage: () => { prompt_tokens: number; completion_tokens: number } | null;
  clearTurnTimer: () => void;
  checkpointTurn: () => void;
  onStreamCompleted: () => void;
  activityStartedAt: number;
}

export async function finalizeTurn(input: FinalizeTurnInput): Promise<void> {
  const {
    req,
    emitter,
    turnEvents,
    activity,
    abortController,
    turnId,
    sessionIdFromQuery,
    provider,
    userPrompt,
    fullText,
    fullReasoning,
    executedToolCalls,
    promptTokens,
    completionTokens,
    sawProviderUsage,
    accumulatedProviderUsage,
    clearTurnTimer,
    checkpointTurn,
    onStreamCompleted,
    activityStartedAt,
  } = input;
  let turnRuntime = input.turnRuntime;

  /* Abort guard — with no turn bound, a client disconnect during tool
   * execution skips finalisation (writing [DONE] to a closed socket would
   * throw, and the recordUsage below would charge for an incomplete
   * response). With a turn bound the socket close only detached the feed
   * (see the req.on('close') handler): the run continues detached unless
   * the abort came from an explicit Stop (turn_interrupted). */
  if (abortController.signal.aborted && !turnId) {
    turnRuntime = settleTurnRuntime(turnRuntime, 'stopped');
    /* Still record partial usage so the operator can see incomplete
     * responses in the heatmap and diagnose client-drop patterns. */
    if (
      req.userId &&
      (fullText.length > 0 || (promptTokens && promptTokens > 0) || sawProviderUsage)
    ) {
      const settled = resolveUsage(accumulatedProviderUsage(), {
        promptTokens,
        completionTokens: estimateTokens(fullText),
      });
      recordUsage({
        userId: req.userId,
        model: provider.model,
        sessionId: sessionIdFromQuery,
        promptTokens: settled.promptTokens,
        completionTokens: settled.completionTokens,
        source: 'chat',
        usageSource: settled.usageSource,
      });
    }
    return;
  }
  if (abortController.signal.aborted && turnId) {
    turnEvents.done('stopped', Date.now() - activityStartedAt);
    // Explicit Stop on a bound turn: persist the partial answer so a
    // re-attach sees what had streamed, then stop. The row itself was
    // already flipped to interrupted by the interrupt endpoint.
    clearTurnTimer();
    checkpointTurn();
    if (
      req.userId &&
      (fullText.length > 0 || (promptTokens && promptTokens > 0) || sawProviderUsage)
    ) {
      const settled = resolveUsage(accumulatedProviderUsage(), {
        promptTokens,
        completionTokens: estimateTokens(fullText),
      });
      recordUsage({
        userId: req.userId,
        model: provider.model,
        sessionId: sessionIdFromQuery,
        promptTokens: settled.promptTokens,
        completionTokens: settled.completionTokens,
        source: 'chat',
        usageSource: settled.usageSource,
      });
      if (sessionIdFromQuery && fullText.length > 0) {
        const db = getDb();
        const assistantClientId =
          typeof req.body?.clientTurn?.assistantClientId === 'string' &&
          req.body.clientTurn.assistantClientId
            ? req.body.clientTurn.assistantClientId
            : `ast-${turnId}`;
        const safeContent = sanitizeStoredHtml(fullText);
        const safeRaw = sanitizePlainText(fullText);
        const storedTurnRuntime = rebaseTurnRuntimeText(turnRuntime, fullText, safeRaw);
        db.insert(messages)
          .values({
            sessionId: sessionIdFromQuery,
            role: 'assistant',
            content: safeContent,
            html: safeContent,
            rawText: safeRaw,
            reasoningContent: fullReasoning || null,
            toolCalls: executedToolCalls,
            turnRuntime: storedTurnRuntime,
            model: provider.model,
            clientId: assistantClientId,
            type: 'assistant',
          })
          .onConflictDoUpdate({
            target: [messages.sessionId, messages.clientId],
            set: {
              content: safeContent,
              html: safeContent,
              rawText: safeRaw,
              reasoningContent: fullReasoning || null,
              toolCalls: executedToolCalls,
              turnRuntime: storedTurnRuntime,
            },
          })
          .catch((err) => console.error('[chat/stream] persist interrupted message failed:', err));

        db.update(sessions)
          .set({
            preview: safeRaw.slice(0, 200),
            updatedAt: new Date(),
            streamingText: null,
            streamingReasoning: null,
          })
          .where(and(eq(sessions.id, sessionIdFromQuery), eq(sessions.userId, req.userId!)))
          .catch(() => {});
      }
    }
    return;
  }

  /* Retrospectives use observed execution facts. Never keep generation
     active after the answer merely to await a decorative provider call. */
  const turnSummary = completedActivitySummary({
    question: userPrompt,
    toolCalls: executedToolCalls,
    hasReasoning: Boolean(fullReasoning.trim()),
  });
  const emptyTurn = !fullText && !fullReasoning && executedToolCalls.length === 0;
  turnEvents.done(
    abortController.signal.aborted ? 'stopped' : emptyTurn ? 'failed' : 'done',
    Date.now() - activityStartedAt,
  );
  activity.done(Date.now() - activityStartedAt);
  if (turnSummary) emitter.event('turn_summary', { summary: turnSummary });

  /* Done — record usage, clear streaming text, and close the stream.
   * Both chat_turns and sessions.messages are now persisted server-side
   * so client disconnection mid-stream never drops dialogue history. */
  emitter.finish();
  if (req.userId) {
    /* Prefer what the provider says it billed. resolveUsage falls back to
       the chars/4 estimate when the upstream reported nothing (gateway
       ignored stream_options, or the stream ended before the usage frame)
       and tags the row so an aggregate can separate measured from guessed. */
    const settled = resolveUsage(accumulatedProviderUsage(), { promptTokens, completionTokens });
    recordUsage({
      userId: req.userId,
      model: provider.model,
      sessionId: sessionIdFromQuery,
      promptTokens: settled.promptTokens,
      completionTokens: settled.completionTokens,
      source: 'chat',
      usageSource: settled.usageSource,
    });
  }
  // mark stream as completed BEFORE clearing
  // streaming_text, so the close handler doesn't overwrite with stale data.
  onStreamCompleted();
  if (turnId) {
    clearTurnTimer();
    checkpointTurn();
    const isBlank = !fullText && !fullReasoning && executedToolCalls.length === 0;
    await setChatTurnStatus(
      turnId,
      isBlank && !abortController.signal.aborted ? 'failed' : 'completed',
      {
        fullText: fullText || null,
        fullReasoning: fullReasoning || null,
        toolCalls: executedToolCalls,
        turnRuntime,
        ...(isBlank && !abortController.signal.aborted
          ? { error: 'Upstream returned no content' }
          : {}),
      },
    ).catch(() => {});
  }
  //  & backend persistence — save completed assistant message to messages table
  if (sessionIdFromQuery && req.userId && (fullText || executedToolCalls.length > 0)) {
    const db = getDb();
    const assistantClientId =
      typeof req.body?.clientTurn?.assistantClientId === 'string' &&
      req.body.clientTurn.assistantClientId
        ? req.body.clientTurn.assistantClientId
        : turnId
          ? `ast-${turnId}`
          : `ast-${Date.now()}`;

    const safeContent = sanitizeStoredHtml(fullText);
    const safeRaw = sanitizePlainText(fullText);
    const storedTurnRuntime = rebaseTurnRuntimeText(turnRuntime, fullText, safeRaw);

    try {
      const [inserted] = await db
        .insert(messages)
        .values({
          sessionId: sessionIdFromQuery,
          role: 'assistant',
          content: safeContent,
          html: safeContent,
          rawText: safeRaw,
          reasoningContent: fullReasoning || null,
          /* persisted so a session reload still shows the
           model's retrospective instead of recomputing a first-sentence
           slice. Null when generation failed; the client falls back. */
          summary: turnSummary,
          toolCalls: executedToolCalls,
          turnRuntime: storedTurnRuntime,
          model: provider.model,
          clientId: assistantClientId,
          type: 'assistant',
        })
        .onConflictDoUpdate({
          target: [messages.sessionId, messages.clientId],
          set: {
            content: safeContent,
            html: safeContent,
            rawText: safeRaw,
            reasoningContent: fullReasoning || null,
            summary: turnSummary,
            toolCalls: executedToolCalls,
            turnRuntime: storedTurnRuntime,
            model: provider.model,
          },
        })
        .returning({ id: messages.id });

      if (inserted?.id && safeRaw) {
        try {
          await indexMessageChunks(inserted.id, sessionIdFromQuery, safeRaw);
        } catch (idxErr) {
          console.warn('[chat/stream] chunk index failed:', (idxErr as Error).message);
        }
      }

      await db
        .update(sessions)
        .set({
          preview: safeRaw.slice(0, 200),
          updatedAt: new Date(),
          streamingText: null,
          streamingReasoning: null,
        })
        .where(and(eq(sessions.id, sessionIdFromQuery), eq(sessions.userId, req.userId!)));
    } catch (err) {
      console.error('[chat/stream] Failed to persist completed assistant message:', err);
    }
  } else if (sessionIdFromQuery) {
    const db = getDb();
    db.update(sessions)
      .set({ streamingText: null, streamingReasoning: null })
      .where(and(eq(sessions.id, sessionIdFromQuery), eq(sessions.userId, req.userId!)))
      .catch(() => {});
  }
}
