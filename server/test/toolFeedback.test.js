import assert from 'node:assert/strict';
import test from 'node:test';

import { formatToolResultContent } from '../src/routes/chat/pipeline/toolFeedback.js';

test('image artifact feedback offers an optional fixed markdown reference', () => {
  const content = formatToolResultContent('code_interpreter', {
    status: 'completed',
    exitCode: 0,
    durationMs: 12,
    artifactFileIds: [{ id: 'file-123', name: 'plot.png', mimeType: 'image/png' }],
    stdout: 'plot saved',
  });

  assert.match(content, /\[id:file-123\]/);
  assert.match(content, /NOT rendered automatically/);
  assert.match(content, /only when it materially helps/i);
  assert.match(content, /!\[short description\]\(\/api\/files\/<fileId>\/raw\)/);
});

test('non-image artifacts do not prompt the model to cite an image', () => {
  const content = formatToolResultContent('code_interpreter', {
    status: 'completed',
    exitCode: 0,
    durationMs: 12,
    artifactFileIds: [{ id: 'file-csv', name: 'data.csv', mimeType: 'text/csv' }],
    stdout: 'table saved',
  });

  assert.doesNotMatch(content, /NOT rendered automatically/);
});
