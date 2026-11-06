import assert from 'node:assert/strict';
import test from 'node:test';
import { guardUserScripts } from '../src/render/vizStubs.ts';

test('script guard wraps scripts closed by browser-accepted end tags', () => {
  const output = guardUserScripts(
    '<div>before</div><script>throw new Error("fixture")</script\t\n bar><p>after</p>',
    'viz-test',
  );
  assert.match(output, /try\{throw new Error\("fixture"\)\}catch\(e\)/);
  assert.match(output, /viz-test/);
  assert.match(output, /<p>after<\/p>/);
  assert.doesNotMatch(output, /<\/script\t\n bar>/);
});
