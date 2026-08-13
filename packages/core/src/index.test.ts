import { consumeSseBuffer, createDraftSession, dispatchChatSseFrame, messageText } from './index';

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
});
