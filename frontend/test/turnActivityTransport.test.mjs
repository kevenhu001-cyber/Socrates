import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreamFrameProcessor } from '../src/chat/streamFrameProcessor.js';
import { dispatchChatSseFrame } from '@socrates/core';
import { doneLabel, runningLabel, errorLabel } from '../src/ui/toolInline/labels.ts';
import { toolRunLabel } from '../src/ui/toolPresentationModel.ts';

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
