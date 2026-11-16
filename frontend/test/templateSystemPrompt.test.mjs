import test from 'node:test';
import assert from 'node:assert/strict';

import {
  configureTemplateSystemPrompt,
  injectTemplateSystemPrompt,
} from '../src/chat/templateSystemPrompt.ts';

/* P_template_marker_shape — the server's client-system classifier
   (server/src/routes/chat/helpers.ts) treats a system message as
   application instructions only when its FIRST non-empty line carries an
   application marker. The frontend used to stamp the template marker at the
   END of the block, so every template persona (/analyze, /write,
   /createImage, /deepResearch, …) landed in the untrusted
   client_context_data bucket, where the server policy tells the model not
   to follow any directive inside it. The marker must lead the block. */

test('the template marker leads the injected block', () => {
  configureTemplateSystemPrompt({
    getActiveTemplate: () => ({ id: 'tpl-quiz', systemPrompt: 'You are a quiz master.' }),
  });
  const out = injectTemplateSystemPrompt([{ role: 'system', content: 'base policy' }]);
  assert.equal(out.length, 2);
  const block = out[1].content;
  assert.equal(block.split('\n')[0], '[template:tpl-quiz]');
  assert.match(block, /^\[template:tpl-quiz\]\n\nYou are a quiz master\.$/);
});

test('the template block is injected after the first system message', () => {
  configureTemplateSystemPrompt({
    getActiveTemplate: () => ({ id: 'tpl-quiz', systemPrompt: 'You are a quiz master.' }),
  });
  const out = injectTemplateSystemPrompt([
    { role: 'system', content: 'base policy' },
    { role: 'user', content: 'hi' },
  ]);
  assert.equal(out[0].content, 'base policy');
  assert.equal(out[1].role, 'system');
  assert.match(out[1].content, /^\[template:tpl-quiz\]/);
  assert.equal(out[2].content, 'hi');
});

test('injecting the same template twice does not stack the block', () => {
  configureTemplateSystemPrompt({
    getActiveTemplate: () => ({ id: 'tpl-quiz', systemPrompt: 'You are a quiz master.' }),
  });
  const once = injectTemplateSystemPrompt([{ role: 'system', content: 'base policy' }]);
  const twice = injectTemplateSystemPrompt(once);
  assert.equal(twice.length, 2);
  assert.equal(twice, once);
});

test('no active template leaves the messages unchanged', () => {
  configureTemplateSystemPrompt({ getActiveTemplate: () => null });
  const messages = [{ role: 'system', content: 'base policy' }];
  assert.equal(injectTemplateSystemPrompt(messages), messages);
});
