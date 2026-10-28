import assert from 'node:assert/strict';
import test from 'node:test';

import { createStreamFrameProcessor } from '../src/chat/streamFrameProcessor.ts';

function dataFrame(payload) {
  return `data: ${payload}\n\n`;
}

test('JSON deltas emit visible text and reasoning in their own channels', () => {
  const visible = [];
  const thinking = [];
  const processor = createStreamFrameProcessor({
    onDelta: (text) => visible.push(text),
    onThinking: (text) => thinking.push(text),
  });

  processor.processFrame(dataFrame(JSON.stringify({
    choices: [{ delta: { content: 'Answer', reasoning_content: { text: 'Reasoning' } } }],
  })));

  assert.deepEqual(visible, ['Answer']);
  assert.deepEqual(thinking, ['Reasoning']);
  assert.equal(processor.full, 'Answer');
  assert.equal(processor.semanticActivity, true);
});

test('structured and recognizable truncated errors stay on the stream error channel', () => {
  const structured = createStreamFrameProcessor({});
  structured.processFrame(dataFrame(JSON.stringify({ error: { message: 'upstream unavailable' }, status: 503 })));
  assert.equal(structured.streamError.message, 'upstream unavailable');
  assert.equal(structured.streamError.status, 503);

  const truncated = createStreamFrameProcessor({});
  truncated.processFrame(dataFrame('broken "error":"provider unavailable"'));
  assert.match(truncated.streamError.message, /provider unavailable/);
  assert.equal(truncated.full, '');
});

test('a final server HTML object is captured without becoming visible prose', () => {
  const processor = createStreamFrameProcessor({});
  processor.processFrame(dataFrame(JSON.stringify({ html: '<p>formatted</p>' })));
  assert.equal(processor.formattedHtml.html, '<p>formatted</p>');
  assert.equal(processor.full, '');
  assert.equal(processor.semanticActivity, true);
});
