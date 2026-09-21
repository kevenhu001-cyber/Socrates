import assert from 'node:assert/strict';
import test from 'node:test';

import { formatToolResultContent } from '../src/routes/chat/pipeline/toolFeedback.ts';

test('code interpreter feedback exposes exact artifact ids and the opt-in directive', () => {
  const content = formatToolResultContent('code_interpreter', {
    status: 'completed',
    exitCode: 0,
    stdout: 'saved plot.png',
    artifactFileIds: [
      { id: '11111111-2222-4333-8444-555555555555', name: 'plot.png', mimeType: 'image/png' },
    ],
  });

  assert.match(content, /plot\.png \(image\/png, id=11111111-2222-4333-8444-555555555555\)/);
  assert.match(content, /\{\{artifact:<fileId>\}\}/);
  assert.match(content, /Only emit that directive when the artifact materially helps/);
  assert.match(content, /never guess, shorten, or alter a fileId/);
});

test('code interpreter feedback does not advertise a directive without an addressable artifact', () => {
  const content = formatToolResultContent('code_interpreter', {
    status: 'completed',
    exitCode: 0,
    stdout: '42',
    artifactFileIds: [{ name: 'missing-id.png', mimeType: 'image/png' }],
  });

  assert.match(content, /\[artifacts: none\]/);
  assert.doesNotMatch(content, /\{\{artifact:/);
});
