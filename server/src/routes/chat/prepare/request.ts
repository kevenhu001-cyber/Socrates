/**
 * prepareChatRequest — the single place that turns an HTTP chat body into
 * provider-ready messages.
 *
 * It validates the wire shape, then overlaps provider lookup, RAG, memory,
 * prompt hydration, and learning-mode assembly before applying them in the
 * documented order.
 */
import { z } from 'zod';
import type { Request, Response } from 'express';
import { ApiError } from '../../../lib/errors.js';
import { getActiveApiKey } from '../../../services/core/apiKey.js';
import { validateThinkingMode } from '../../../services/core/llmProtocol.js';
import { DEFAULT_MAX_TOKENS } from '../../../services/core/llm/types.js';
import { estimateContextMessageTokens } from '../../../services/core/usageTracker.js';
import { resolveContextBudget } from '../../../lib/modelCapabilities.js';
import { isMultimodalProvider } from '../../../lib/multimodal.js';
import { getBeagleSystemPrompt, getTeacherModePrompt } from '../../../lib/prompts.js';
import { appendFinalOutputConstraints, injectUserContext, insertProviderIdentity, insertResponseTypography, refreshServerPrompt } from '../../../lib/chatPolicy.js';
import { appendTurnContext, splitPromptContext } from '../../../lib/chatPromptContext.js';
import { resolveSessionPromptOrAssemble } from '../../../services/core/sessionPromptSnapshot.js';
import type { ChatMessage } from '../../../lib/chatMessageSchema.js';
import { applyPolicyBlock, resolveAssistantInstructions, TEACHER_MODE_MARKER } from './prompts.js';
import { buildLearningModeTurn, estimateToolSchemaTokens, resolveMemoryContext, resolveRagContext } from './context.js';
import { classifyClientSystemMessages, enforceServerSystemBoundary, hasClientSystemPrefix, renderClientBlocks } from './clientSystem.js';
import { checkBeagleMonthlyLimit } from './rates.js';
import { ChatPayloadSchema, containsImageUrlParts, sanitizeExtraBody, transformMessagesForModel, type ChatPayload } from './wire.js';
import type { Provider } from './types.js';

export async function prepareChatRequest(
  req: Request,
  res: Response,
  options: {
    signal?: AbortSignal;
    /** Resolved tool context for this turn, used to budget the tool schemas. */
    toolCtxPromise?: Promise<{ toolDefs?: Array<{ function?: { name?: string; parameters?: unknown } }> }> | null;
  } = {},
): Promise<
  {
    ok: true;
    payload: {
      messages: ChatMessage[];
      provider: Provider;
      safeExtraBody: Record<string, unknown> | undefined;
      mode: 'tutor' | 'chat';
      temperature: number;
      maxTokens: number | undefined;
      reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
      responseSpeed: 'standard' | 'fast';
    };
  }
> {
  let parsed: ChatPayload;
  try {
    parsed = ChatPayloadSchema.parse(req.body);
  } catch (err) {
    throw new ApiError(400, 'INVALID_REQUEST', (err as Error).message);
  }
  const { messages, temperature = 0.3, max_tokens, mode = 'chat', reasoning_effort, response_speed, extra_body } = parsed;

  /* Provider lookup, per-turn recall and prompt hydration overlap. Prompt
     initialization is lazy: later turns do not reread profile/memory/role
     settings or inject a new clock. Windowing only touches conversation
     messages and preserves the canonical persisted system prefix. */
  const projectId = typeof parsed.projectId === 'string' ? parsed.projectId : undefined;
  const querySessionId = req.query.sessionId;
  const sessionId = typeof querySessionId === 'string' ? querySessionId : parsed.sessionId;
  if ((querySessionId !== undefined && typeof querySessionId !== 'string')
      || (sessionId !== undefined && !z.string().uuid().safeParse(sessionId).success)
      || (parsed.sessionId && sessionId !== parsed.sessionId)) {
    throw new ApiError(400, 'INVALID_REQUEST', 'Invalid or conflicting sessionId');
  }
  const context = splitPromptContext(messages, mode);
  const providerPromise = getActiveApiKey(req.userId);
  const ragPromise = resolveRagContext(messages, parsed.ragSessionId, req.userId ?? undefined, options.signal);
  const learningPromise = mode === 'tutor' && parsed.learningMode
    ? buildLearningModeTurn(parsed.learningMode, parsed.learningFocus)
    : Promise.resolve(null);
  // Only the first request reads and injects persona, user context and saved
  // memories. Existing sessions hydrate lazily once after this release. The
  // server-owned snapshot survives browser reloads and process restarts.
  const promptPromise = resolveSessionPromptOrAssemble(req.userId ?? undefined, sessionId, async () => {
    const [teacherBlock, assistantBlock, memoryBlock] = await Promise.all([
      mode === 'tutor' ? getTeacherModePrompt().then((prompt) => ({ marker: TEACHER_MODE_MARKER, prompt })) : null,
      resolveAssistantInstructions(parsed.assistantId, sessionId, req.userId ?? undefined),
      resolveMemoryContext(req.userId ?? undefined, projectId),
    ]);
    let initialized = enforceServerSystemBoundary(context.initialization);
    initialized = injectUserContext(initialized, req.user, { sessionSnapshot: !!sessionId });
    initialized = applyPolicyBlock(initialized, teacherBlock);
    initialized = applyPolicyBlock(initialized, assistantBlock);
    initialized = applyPolicyBlock(initialized, memoryBlock);
    initialized = appendFinalOutputConstraints(initialized);
    return initialized[0].content as string;
  });
  for (const p of [providerPromise, ragPromise, promptPromise, learningPromise]) p.catch(() => {});
  const [storedPrompt, ragBlock, learningTurn] = await Promise.all([promptPromise, ragPromise, learningPromise.catch(() => null)]);
  let conversation = appendTurnContext(context.conversation, context.turnInstructions, ragBlock?.prompt ?? null, learningTurn);
  /* P_server-policy-refresh — the session prompt snapshot freezes turn 1's
     system prefix, so two things must not stay frozen inside it:
       - the server policy. A fix published today has to reach the sessions
         that were created before it, so the policy region is replaced with
         the current text on every request;
       - the client blocks. The template persona, the tone preset, the custom
         instructions and the project scope are turn state, and the client
         re-sends them on every turn, so they are classified again here.
         Without this, switching a template in the middle of a session lit
         the chip but left the model's persona frozen in turn 1's prefix.
     Everything else in the snapshot (user context, teacher mode, selected
     assistant, saved memories) stays frozen, which is what it is for. */
  const clientBlocks = hasClientSystemPrefix(context.initialization)
    ? renderClientBlocks(classifyClientSystemMessages(context.initialization))
    : undefined;
  const systemPrompt = refreshServerPrompt(storedPrompt, { clientBlocks, reasoningEffort: reasoning_effort });
  let finalMessages: ChatMessage[] = [{ role: 'system', content: insertResponseTypography(systemPrompt) }, ...conversation];

  // Windowing can replace old conversation with a rolling summary, never
  // regenerate or compress away the frozen system prefix. Include its real
  // size rather than later client-supplied system messages that we ignore.
  try {
    /* P_model-capability-registry — the conversation budget follows the
       window of the model that will actually serve this turn. It used to be
       one global constant (100 000 tokens) for every model, which is wrong
       in both directions: a 1M-token model was compressed far too early (and
       paid for a summary it did not need), while a model with a smaller
       window was allowed past the point where the provider rejects the
       request with a context-length 400 — a failure the compatibility chain
       treats as terminal. */
    const budgetProvider = await providerPromise.catch(() => null);
    const toolSchemaTokens = options.toolCtxPromise
      ? await options.toolCtxPromise
        .then((ctx) => estimateToolSchemaTokens(ctx?.toolDefs))
        .catch(() => 0)
      : 0;
    const budget = resolveContextBudget(budgetProvider?.model ?? '', {
      overrideTokens: Number(process.env.CHAT_CONTEXT_MAX_TOKENS),
      reserveTokens: max_tokens ?? DEFAULT_MAX_TOKENS,
      toolSchemaTokens,
    });
    if (budget.fixedOverflow || (toolSchemaTokens > 0 && budget.budget <= 1)) {
      /* The tool schemas plus the reply reserve cannot fit the declared
       * input window (or the unknown-model fallback floor). Compression
       * cannot fix this; surface it so the operator can add the model to
       * the registry, lower the tool surface, or set
       * CHAT_CONTEXT_MAX_TOKENS. */
      console.warn('[chat/prepare] fixed prompt and tool schemas exceed the model input window', JSON.stringify({
        model: budgetProvider?.model ?? '',
        contextWindow: budget.contextWindow,
        budget: budget.budget,
        source: budget.source,
        toolSchemaTokens,
        reserveTokens: max_tokens ?? DEFAULT_MAX_TOKENS,
      }));
    }
    if (estimateContextMessageTokens(finalMessages) > budget.budget) {
      const { compressSessionMessages } = await import('../../../services/embeddings/sessionCompressor.js');
      const rawKeep = Number(process.env.CHAT_CONTEXT_KEEP_TURNS);
      const compressed = await compressSessionMessages(conversation, {
        ...(req.userId && sessionId ? { cacheScope: `${req.userId}:${sessionId}` } : {}),
        triggerTokens: Math.max(1, budget.budget - estimateContextMessageTokens([finalMessages[0]])),
        ...(Number.isFinite(rawKeep) && rawKeep > 0 ? { keepTurns: Math.floor(rawKeep) } : {}),
      });
      if (compressed.didCompress && compressed.messages.length) {
        // The persistence compressor emits summary.rawText; adapt it to the
        // provider wire format and keep it untrusted, not a new system rule.
        const wireMessages = compressed.messages.map((m) => ({ ...m, content: m.content ?? m.rawText ?? '' })) as ChatMessage[];
        conversation = splitPromptContext(wireMessages, mode).conversation;
        finalMessages = [finalMessages[0], ...conversation];
        console.info('[chat] context window compression', JSON.stringify({
          droppedTurns: compressed.droppedTurns,
          summarizer: compressed.summarizer,
          budget: budget.budget,
          budgetSource: budget.source,
          contextWindow: budget.contextWindow ?? null,
        }));
      }
    }
  } catch (err) {
    console.warn('[chat] context window compression skipped:', (err as Error).message);
  }

  const safeExtraBody = sanitizeExtraBody(extra_body);

  // Started alongside the context lookups above (P_prep-parallel).
  const provider = await providerPromise;
  if (!provider) {
    throw new ApiError(503, 'NO_PROVIDER', 'No active LLM provider configured');
  }
  if (!provider.keyPlaintext) {
    console.error('[chat] Provider key decryption failed for provider:', provider.id, provider.label);
    throw new ApiError(503, 'KEY_DECRYPT_FAILED',
      'API key decryption failed. Please re-enter your API key in Settings.',
      undefined, false);
  }

  validateThinkingMode(provider.model, reasoning_effort, safeExtraBody);

  if (provider.isBuiltIn) {
    const limitErr = await checkBeagleMonthlyLimit(req.userId, req.user?.tier);
    if (limitErr) {
      throw new ApiError(429, 'MONTHLY_LIMIT', limitErr.message, undefined, false);
    }
    /* P_provider-identity-not-session-state — the built-in provider identity is
       resolved per request against the provider that will actually serve this
       turn. It is deliberately NOT part of the shared session prompt snapshot:
       the next turn of this session may be served by a user-configured
       (BYOK) provider, and a frozen "You are Beagle" would then be sent to
       their own upstream. */
    finalMessages[0] = {
      ...finalMessages[0],
      content: insertProviderIdentity(String(finalMessages[0].content ?? ''), await getBeagleSystemPrompt()),
    };
  }

  /* P_attachments-multimodal — frontend upload validation is the fast path,
     but the server must close the trust gap for stale clients, direct API
     callers, and a model switch while an image is being prepared. Reject
     before token estimation or an upstream request so the response is an
     explicit capability error instead of a silent text-only degradation. */
  if (containsImageUrlParts(finalMessages) && !isMultimodalProvider(provider)) {
    throw new ApiError(400, 'MODEL_NOT_MULTIMODAL',
      'The selected model is not marked as multimodal and cannot process image attachments. Enable Multimodal for this model or select a vision-capable model.',
      undefined, false);
  }

  /* Preserve the legacy transform for callers that reach this point with
     non-image content. Image-bearing requests have already been rejected
     above, so they can no longer be silently downgraded to text-only. */
  finalMessages = transformMessagesForModel(finalMessages, provider);

  return {
    ok: true,
    payload: {
      messages: finalMessages,
      provider,
      safeExtraBody,
      mode,
      temperature,
      maxTokens: max_tokens,
      reasoning_effort,
      responseSpeed: response_speed,
    },
  };
}

