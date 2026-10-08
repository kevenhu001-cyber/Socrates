import type { ChatSseHandlers, JsonValue, Message, Session, ToolCall } from '@socrates/contracts';
import { mergeToolCall, useChatStore } from './index.ts';

/** One turn owns its session and assistant message until persistence finishes. */
export async function runChatTurn(input: {
  sessionId: string;
  turnId: string;
  text: string;
  /** Private model-facing user prompt for an assistant-only turn (Tutor next-question). */
  assistantPrompt?: string;
  attachments?: Message['attachments'];
  signal: AbortSignal;
  isCurrent(): boolean;
  save(session: Session): Promise<Session>;
  /** Persists the turn's attachments once the server session id is known,
   * returning the enriched attachment list (durable file ids). Never lets a
   * failed upload abort the turn. */
  persistAttachments?(sessionId: string): Promise<Message['attachments'] | undefined>;
  stream(args: { sessionId: string; messages: Message[]; handlers: ChatSseHandlers; signal: AbortSignal }): Promise<void>;
}) {
  const store = useChatStore;
  if (!store.getState().beginTurn(input.sessionId, input.turnId, input.text, input.attachments, !!input.assistantPrompt)) return;
  const current = () => input.isCurrent() && store.getState().turnId === input.turnId;
  const session = () => store.getState().sessions.find((s) => s.id === store.getState().turnSessionId);
  let ready = false;
  let failure: string | null = null;
  const update = (change: (message: Message) => Message) => { if (current() && !input.signal.aborted) store.getState().updateTurn(input.turnId, change); };
  const toolIds = new Map<number, string>();
  const tool = (event: 'use' | 'result' | 'progress' | 'delta', payload: JsonValue) => {
    if (Array.isArray(payload)) { payload.forEach((entry) => tool(event, entry)); return; }
    const value = payload as Record<string, JsonValue> | null;
    if (!value) return;
    const index = typeof value.index === 'number' ? value.index : null;
    const previousId = index === null ? null : toolIds.get(index);
    const id = typeof value.id === 'string' ? value.id : previousId || (index === null ? null : `tool-index-${index}`);
    if (!id) return;
    if (index !== null) toolIds.set(index, id);
    update((m) => {
      const prior = m.toolCalls?.find((t) => t.id === id || t.id === previousId);
      const call: ToolCall = { ...prior, id, name: typeof value.name === 'string' ? value.name : prior?.name || 'Tool' };
      if (event === 'use' && value.input !== undefined) call.input = value.input;
      if (event === 'delta' && typeof value.arguments === 'string') call.argumentsText = value.arguments;
      for (const key of ['output', 'progressPhase', 'argumentsText', 'errorText', 'stderr', 'userMessage', 'detail'] as const) {
        if (typeof value[key] === 'string') call[key] = value[key];
      }
      if (typeof value.phase === 'string') call.progressPhase = value.phase;
      if (event === 'result') {
        call.isError = value.isError === true || value.ok === false;
        if (value.output !== undefined && typeof value.output !== 'string') call.output = JSON.stringify(value.output);
        call.progressPhase = call.isError ? 'failed' : 'completed';
        for (const key of ['plan', 'spec', 'visualization'] as const) if (value[key] !== undefined) call[key] = value[key];
        if (typeof value.durationMs === 'number') call.durationMs = value.durationMs;
        if (typeof value.executionId === 'string') call.executionId = value.executionId;
        if (typeof value.retryable === 'boolean') call.retryable = value.retryable;
        // Live frames send bare file-id strings; persisted rows carry
        // {id, mimeType, name}. toolModel normalizes both.
        if (Array.isArray(value.artifacts)) call.artifacts = value.artifacts as unknown as ToolCall['artifacts'];
      }
      if (Array.isArray(value.results)) call.results = value.results as ToolCall['results'];
      return { ...m, toolCalls: mergeToolCall((m.toolCalls || []).filter((t) => !previousId || previousId === id || t.id !== previousId), call) };
    });
  };
  try {
    const draft = session();
    if (!draft) return;
    const saved = await input.save(draft);
    if (!current()) return;
    store.getState().adoptSessionId(draft.id, saved);
    ready = true;
    if (input.signal.aborted) throw new Error('Request canceled');
    store.getState().setStatus('streaming');
    let persisted = session()!;
    if (input.persistAttachments) {
      try {
        const withFiles = await input.persistAttachments(persisted.id);
        if (withFiles && current()) {
          store.getState().setTurnAttachments(input.turnId, withFiles);
          persisted = session() ?? persisted;
        }
      } catch { /* attachment persistence must never abort the turn */ }
    }
    const messages = (persisted.messages || []).filter((m) => m.clientId !== input.turnId);
    if (input.assistantPrompt) messages.push({ role: 'user', rawText: input.assistantPrompt });
    await input.stream({
      sessionId: persisted.id,
      messages,
      signal: input.signal,
      handlers: {
        onDelta: (delta) => update((m) => ({ ...m, rawText: `${m.rawText || ''}${delta}` })),
        onReasoning: (delta) => update((m) => ({ ...m, reasoningContent: `${m.reasoningContent || ''}${delta}` })),
        onToolUse: (p) => tool('use', p), onToolResult: (p) => tool('result', p),
        onToolProgress: (p) => tool('progress', p), onToolCallDelta: (p) => tool('delta', p),
        onError: (error) => { failure = error; },
      },
    });
  } catch (error) {
    if (!input.signal.aborted) failure = error instanceof Error ? error.message : 'Chat failed';
  } finally {
    if (current()) {
      if (ready && session()) {
        try { await input.save(session()!); }
        catch (error) { failure = error instanceof Error ? error.message : 'Could not save response'; }
      }
      if (current()) store.getState().finishTurn(input.turnId, failure);
    }
  }
}
