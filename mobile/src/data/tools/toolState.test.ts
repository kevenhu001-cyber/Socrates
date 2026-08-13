import { reduceToolEvent, settleToolCalls, type MobileToolCall } from './toolState';

/* Payload shapes below mirror server/src/routes/chat/stream.ts exactly:
 * tool_use is an array; every other frame is keyed by the tool-call id. */

describe('reduceToolEvent', () => {
  it('creates one card per call from an array tool_use frame', () => {
    const calls = reduceToolEvent([], 'tool_use', [
      { id: 'call_1', name: 'web_search', input: { query: 'entropy' } },
      { id: 'call_2', name: 'code_interpreter', input: { code: 'print(1)' } },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ id: 'call_1', name: 'web_search', status: 'running' });
    expect(calls[1]).toMatchObject({ id: 'call_2', name: 'code_interpreter', status: 'running' });
  });

  it('merges a result onto the existing card instead of appending a row', () => {
    let calls = reduceToolEvent([], 'tool_use', [{ id: 'call_1', name: 'web_search', input: {} }]);
    calls = reduceToolEvent(calls, 'tool_result', {
      id: 'call_1', ok: true, status: 'completed', output: '3 sources',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ id: 'call_1', name: 'web_search', status: 'done', output: '3 sources', isError: false });
  });

  it('marks a failed result and keeps the server explanation', () => {
    let calls = reduceToolEvent([], 'tool_use', [{ id: 'c', name: 'code_interpreter', input: {} }]);
    calls = reduceToolEvent(calls, 'tool_result', {
      id: 'c', ok: false, status: 'failed', output: '', error: 'invalid_tool_arguments',
      userMessage: '代码执行连续多次失败，本次不再自动重试。',
    });
    expect(calls[0].status).toBe('failed');
    expect(calls[0].isError).toBe(true);
    expect(calls[0].errorText).toBe('invalid_tool_arguments');
    expect(calls[0].userMessage).toContain('不再自动重试');
  });

  it('accumulates progress chunks in arrival order and retains the phase', () => {
    let calls = reduceToolEvent([], 'tool_use', [{ id: 'c', name: 'code_interpreter', input: {} }]);
    calls = reduceToolEvent(calls, 'execution_start', { id: 'c', executionId: 'exec-9' });
    calls = reduceToolEvent(calls, 'tool_progress', { id: 'c', phase: 'running', chunk: 'line 1\n', stream: 'stdout' });
    calls = reduceToolEvent(calls, 'tool_progress', { id: 'c', chunk: 'line 2\n', stream: 'stdout' });
    expect(calls).toHaveLength(1);
    expect(calls[0].executionId).toBe('exec-9');
    expect(calls[0].progressPhase).toBe('running');
    expect(calls[0].progress).toBe('line 1\nline 2\n');
  });

  it('keeps the latest cumulative tool_call_delta arguments snapshot', () => {
    let calls = reduceToolEvent([], 'tool_call_delta', { index: 0, id: 'c', name: 'web_search', arguments: '{"qu' });
    calls = reduceToolEvent(calls, 'tool_call_delta', { index: 0, id: 'c', name: 'web_search', arguments: '{"query":"x"}' });
    expect(calls).toHaveLength(1);
    expect(calls[0].argumentsText).toBe('{"query":"x"}');
    // the later tool_use must not duplicate the card
    calls = reduceToolEvent(calls, 'tool_use', [{ id: 'c', name: 'web_search', input: { query: 'x' } }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toEqual({ query: 'x' });
  });

  it('retains rich tool result payloads used by the live renderer', () => {
    let calls = reduceToolEvent([], 'tool_use', [{ id: 'c', name: 'code_interpreter', input: {} }]);
    calls = reduceToolEvent(calls, 'tool_result', {
      id: 'c',
      ok: true,
      output: 'Visualization ready',
      stderr: 'warning',
      executionId: 'exec-10',
      durationMs: 412,
      retryable: false,
      detail: [{ message: 'details' }],
      artifacts: [{ id: 'file-1', name: 'chart.png', mimeType: 'image/png' }],
      results: [{ title: 'Source', url: 'https://example.com', snippet: 'Useful' }],
      plan: { title: 'Plan', steps: [{ title: 'Step' }] },
      spec: { title: 'Spec', requirements: ['A'] },
      visualization: { template: 'bar', title: 'Chart' },
    });
    expect(calls[0]).toMatchObject({
      status: 'done',
      stderr: 'warning',
      executionId: 'exec-10',
      durationMs: 412,
      retryable: false,
      detail: '[{"message":"details"}]',
      artifacts: [{ id: 'file-1', name: 'chart.png', mimeType: 'image/png' }],
      results: [{ title: 'Source', url: 'https://example.com', snippet: 'Useful' }],
      plan: { title: 'Plan' },
      spec: { title: 'Spec' },
      visualization: { template: 'bar' },
    });
  });

  it('never mutates the array it is given', () => {
    const before: MobileToolCall[] = [{ id: 'c', name: 'web_search', status: 'running' }];
    const frozen = JSON.stringify(before);
    reduceToolEvent(before, 'tool_result', { id: 'c', ok: true, output: 'done' });
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it('ignores malformed frames rather than creating junk cards', () => {
    expect(reduceToolEvent([], 'tool_result', null)).toHaveLength(0);
    expect(reduceToolEvent([], 'tool_result', 'nonsense')).toHaveLength(0);
    expect(reduceToolEvent([], 'tool_progress', { chunk: 'orphan' })).toHaveLength(0);
    expect(reduceToolEvent([], 'tool_use', [{ name: 'no id' }])).toHaveLength(0);
  });
});

describe('settleToolCalls', () => {
  it('does not leave tools spinning after the stream ends', () => {
    const settled = settleToolCalls([
      { id: 'a', name: 'x', status: 'running' },
      { id: 'b', name: 'y', status: 'done' },
    ]);
    expect(settled[0].status).toBe('failed');
    expect(settled[1].status).toBe('done');
  });

  it('handles an absent list', () => {
    expect(settleToolCalls(undefined)).toEqual([]);
  });
});
