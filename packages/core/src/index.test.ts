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
