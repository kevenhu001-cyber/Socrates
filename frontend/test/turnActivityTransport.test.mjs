import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreamFrameProcessor } from '../src/chat/streamFrameProcessor.js';
import { dispatchChatSseFrame } from '@socrates/core';
import { doneLabel, runningLabel, errorLabel } from '../src/ui/toolInline/labels.ts';
import { toolRunLabel } from '../src/ui/toolPresentationModel.ts';
import { deriveTurnPresentationState } from '../src/ui/turnActivityModel.ts';

const frame = 'event: turn_activity\ndata: {"type":"thinking"}\n\n';
test('public activity is delivered without counting a startup indicator as model output', () => {
  const events = [];
  const processor = createStreamFrameProcessor({ opts: { onTurnActivity: (activity) => events.push(activity) } });
  processor.processFrame(frame);
  assert.deepEqual(events, [{ type: 'thinking' }]);
  assert.equal(processor.semanticActivity, false);
  assert.equal(processor.full, '');
});
test('shared SSE consumers receive activity and safely ignore it without a handler', () => {
  const events = [];
  dispatchChatSseFrame(frame, { onTurnActivity: (activity) => events.push(activity) });
  dispatchChatSseFrame(frame, {});
  assert.deepEqual(events, [{ type: 'thinking' }]);
});

test('thinking activity retires when visible answer prose starts', () => {
  const live = deriveTurnPresentationState({
    type: 'streaming',
    rawText: 'The answer is ready.',
    _activity: { type: 'thinking' },
  }, { live: true });
  assert.equal(live.status, undefined);
});

test('think-only raw text keeps the activity line visible', () => {
  const live = deriveTurnPresentationState({
    type: 'streaming',
    rawText: '<think>private provider reasoning</think>',
    _activity: { type: 'thinking' },
  }, { live: true });
  assert.equal(live.status?.phase, 'thinking');
});

test('React and degraded renderers derive tool copy from the same call', () => {
  for (const [name, input] of [
    ['web_search', { query: 'React Context' }], ['Read', { path: 'src/App.tsx' }],
    ['code_interpreter', {}], ['oc_github_get_job_logs', {}], ['render_intelligent_ui', {}],
  ]) {
    const result = { status: 'completed', output: '8 passed', results: [{ url: 'https://example.com/source' }] };
    assert.equal(runningLabel(name, input), toolRunLabel({ name, input }, 'running').text);
    assert.equal(doneLabel(name, result, input), toolRunLabel({ name, input, ...result }, 'done').text);
    assert.equal(errorLabel(name, { ...result, ok: false }, input), toolRunLabel({ name, input, ...result, isError: true }, 'error').text);
  }
});

test('both SSE routers deliver the versioned turn event without converting it to prose', () => {
  const event = { version: 1, turnId: 'turn-1', seq: 1, at: 100, type: 'generation', phase: 'streaming' };
  const frame = `event: turn_event\ndata: ${JSON.stringify(event)}\n\n`;
  for (const shared of [false, true]) {
    const events = [];
    const handlers = { onTurnEvent: (value) => events.push(value) };
    if (shared) dispatchChatSseFrame(frame, handlers);
    else {
      const processor = createStreamFrameProcessor({ opts: handlers });
      processor.processFrame(frame);
      assert.equal(processor.full, '');
    }
    assert.deepEqual(events, [event]);
  }
});
