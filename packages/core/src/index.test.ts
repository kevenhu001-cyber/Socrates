import {
  buildChatHistory,
  buildUserContentParts,
  consumeSseBuffer,
  createDraftSession,
  dispatchChatSseFrame,
  messageText,
} from './index';

describe('@socrates/core', () => {
  it('routes chat SSE content, reasoning, tools, errors, and completion', () => {
    const content: string[] = [];
    const reasoning: string[] = [];
    const tools: unknown[] = [];
    const errors: string[] = [];
    let done = 0;
    const handlers = {
      onDelta: (value: string) => content.push(value),
      onReasoning: (value: string) => reasoning.push(value),
      onToolProgress: (value: unknown) => tools.push(value),
      onError: (value: string) => errors.push(value),
      onDone: () => { done += 1; },
    };

    dispatchChatSseFrame('data: {"choices":[{"delta":{"content":"Hello"}}]}\r\n\r\n', handlers);
    dispatchChatSseFrame('data: {"choices":[{"delta":{"reasoning_content":"Think"}}]}\n\n', handlers);
    dispatchChatSseFrame('event: tool_progress\ndata: {"step":1}\n\n', handlers);
    dispatchChatSseFrame('event: error\ndata: {"message":"No connection"}\n\n', handlers);
    dispatchChatSseFrame('data: [DONE]\n\n', handlers);

    expect(content).toEqual(['Hello']);
    expect(reasoning).toEqual(['Think']);
    expect(tools).toEqual([{ step: 1 }]);
    expect(errors).toEqual(['No connection']);
    expect(done).toBe(1);
  });

  /* ─── SSE contract: full event-name table ─────────────────────────── */

  it('routes every documented tool event name to its dedicated handler', () => {
    const captured = {
      toolUse: [] as unknown[],
      toolResult: [] as unknown[],
      toolProgress: [] as unknown[],
      toolCallDelta: [] as unknown[],
      executionStart: [] as unknown[],
    };
    const handlers = {
      onToolUse: (v: unknown) => captured.toolUse.push(v),
      onToolResult: (v: unknown) => captured.toolResult.push(v),
      onToolProgress: (v: unknown) => captured.toolProgress.push(v),
      onToolCallDelta: (v: unknown) => captured.toolCallDelta.push(v),
      onExecutionStart: (v: unknown) => captured.executionStart.push(v),
    };

    dispatchChatSseFrame('event: tool_use\ndata: {"id":"a"}\n\n', handlers);
    dispatchChatSseFrame('event: tool_result\ndata: {"id":"a","output":"done"}\n\n', handlers);
    dispatchChatSseFrame('event: tool_progress\ndata: {"step":2}\n\n', handlers);
    dispatchChatSseFrame('event: tool_call_delta\ndata: {"args":"x"}\n\n', handlers);
    dispatchChatSseFrame('event: execution_start\ndata: {"execId":"e1"}\n\n', handlers);

    expect(captured.toolUse).toEqual([{ id: 'a' }]);
    expect(captured.toolResult).toEqual([{ id: 'a', output: 'done' }]);
    expect(captured.toolProgress).toEqual([{ step: 2 }]);
    expect(captured.toolCallDelta).toEqual([{ args: 'x' }]);
    expect(captured.executionStart).toEqual([{ execId: 'e1' }]);
  });

  it('falls back to "Stream failed" when the error payload has no message', () => {
    const errors: string[] = [];
    const handlers = { onError: (value: string) => errors.push(value) };
    dispatchChatSseFrame('event: error\ndata: {}\n\n', handlers);
    expect(errors).toEqual(['Stream failed']);
  });

  it('prefers error.message over error.error over a bare string', () => {
    const errors: string[] = [];
    const handlers = { onError: (value: string) => errors.push(value) };

    dispatchChatSseFrame('event: error\ndata: {"error":"inner-error"}\n\n', handlers);
    dispatchChatSseFrame('event: error\ndata: {"message":"primary-message"}\n\n', handlers);
    dispatchChatSseFrame('event: error\ndata: "bare-string"\n\n', handlers);

    expect(errors).toEqual(['inner-error', 'primary-message', 'bare-string']);
  });

  it('routes content and reasoning_content deltas independently in the same frame', () => {
    const content: string[] = [];
    const reasoning: string[] = [];
    const handlers = {
      onDelta: (v: string) => content.push(v),
      onReasoning: (v: string) => reasoning.push(v),
    };
    dispatchChatSseFrame(
      'data: {"choices":[{"delta":{"content":"A","reasoning_content":"R"}}]}\n\n',
      handlers,
    );
    expect(content).toEqual(['A']);
    expect(reasoning).toEqual(['R']);
  });

  it('ignores empty data frames and unknown event names without calling onError', () => {
    const errors: string[] = [];
    let done = 0;
    const handlers = {
      onError: (v: string) => errors.push(v),
      onDone: () => { done += 1; },
    };
    dispatchChatSseFrame('event: telemetry\ndata: {"foo":1}\n\n', handlers);
    dispatchChatSseFrame('data: \n\n', handlers);
    expect(errors).toEqual([]);
    expect(done).toBe(0);
  });

  /* ─── SSE contract: consumeSseBuffer ──────────────────────────────── */

  it('handles CRLF and LF line endings interchangeably', () => {
    const frames: string[] = [];
    const rest1 = consumeSseBuffer('data: a\r\n\r\ndata: b\n\n', (f) => frames.push(f));
    expect(frames).toEqual(['data: a', 'data: b']);
    expect(rest1).toBe('');

    const frames2: string[] = [];
    const rest2 = consumeSseBuffer('data: a\r\n\r\ndata: b', (f) => frames2.push(f));
    expect(frames2).toEqual(['data: a']);
    expect(rest2).toBe('data: b');
  });

  it('emits every complete frame across multiple dispatchChatSseFrame calls', () => {
    const events: string[] = [];
    const handlers = {
      onDelta: (v: string) => events.push(`delta:${v}`),
    };
    dispatchChatSseFrame('data: {"choices":[{"delta":{"content":"X"}}]}\n\n', handlers);
    dispatchChatSseFrame('data: {"choices":[{"delta":{"content":"Y"}}]}\n\n', handlers);
    expect(events).toEqual(['delta:X', 'delta:Y']);
  });

  it('keeps incomplete SSE frames and creates normalized draft sessions', () => {
    const frames: string[] = [];
    const rest = consumeSseBuffer('data: one\n\ndata: two', (frame) => frames.push(frame));
    expect(frames).toEqual(['data: one']);
    expect(rest).toBe('data: two');

    const session = createDraftSession('session-1', 'tutor');
    expect(session.kind).toBe('tutor');
    expect(session.messages).toEqual([]);
    expect(messageText({ rawText: '', content: 'fallback' })).toBe('fallback');
  });

  it('reconstructs image and parsed document attachments as model content parts', () => {
    const content = buildUserContentParts('Describe these', [
      { id: 'image-1', kind: 'image', name: 'diagram.png', mime: 'image/png', size: 12, dataUrl: 'data:image/png;base64,abc' },
      { id: 'pdf-1', kind: 'pdf', name: 'notes.pdf', mime: 'application/pdf', size: 24, text: 'A long explanation.' },
    ]);
    expect(content).toEqual([
      { type: 'text', text: 'Describe these' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc', detail: 'auto' } },
      { type: 'text', text: '[Parsed PDF: notes.pdf]\nA long explanation.' },
    ]);
  });

  it('bounds history and strips inline reasoning tags without losing attachment context', () => {
    const messages = Array.from({ length: 65 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      rawText: index % 2 === 0 ? `Question ${index}` : `<think>internal</think>Answer ${index}`,
      content: index % 2 === 0 ? `Question ${index}` : `<think>internal</think>Answer ${index}`,
      ...(index === 64 ? {
        attachments: [{ id: 'text-1', kind: 'text', name: 'source.txt', mime: 'text/plain', size: 1, text: 'source body' }],
      } : {}),
    }));
    const history = buildChatHistory(messages, { maxTurns: 2, maxChars: 20 });
    expect(history).toHaveLength(4);
    expect(history.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'Question 64' },
        { type: 'text', text: '[Parsed file: source.txt]\nsource body' },
      ],
    });
    expect(history.some((entry) => typeof entry.content === 'string' && entry.content.includes('<think>'))).toBe(false);
  });
});
