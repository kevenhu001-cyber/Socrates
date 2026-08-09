import { dispatchSseFrame } from './sseClient';

describe('SSE adapter', () => {
  it('parses CRLF content and reasoning frames', () => {
    const content: string[] = [];
    const reasoning: string[] = [];
    dispatchSseFrame('data: {"choices":[{"delta":{"content":"Hello"}}]}\r\n\r\n', {
      onDelta: (value) => content.push(value),
    });
    dispatchSseFrame('data: {"choices":[{"delta":{"reasoning_content":"Think"}}]}\n\n', {
      onReasoning: (value) => reasoning.push(value),
    });
    expect(content).toEqual(['Hello']);
    expect(reasoning).toEqual(['Think']);
  });

  it('routes tool events and completes on DONE', () => {
    const tools: unknown[] = [];
    let done = 0;
    dispatchSseFrame('event: tool_progress\ndata: {"step":1}\n\n', {
      onToolProgress: (payload) => tools.push(payload),
    });
    dispatchSseFrame('data: [DONE]\n\n', { onDone: () => { done += 1; } });
    expect(tools).toEqual([{ step: 1 }]);
    expect(done).toBe(1);
  });

  it('surfaces structured errors', () => {
    let message = '';
    dispatchSseFrame('event: error\ndata: {"message":"No connection"}\n\n', {
      onError: (value) => { message = value; },
    });
    expect(message).toBe('No connection');
  });
});
