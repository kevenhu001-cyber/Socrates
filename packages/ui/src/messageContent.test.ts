import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMessageContent, plainText, safeImage, safeLink } from './messageContent.ts';
test('markdown parses headings, emphasis, tables and fenced code without interpreting HTML', () => {
  const result = parseMessageContent({ rawText: '# Heading\n\n**Bold**\n\n```js\nconst x = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n<script>alert(1)</script>' });
  assert.deepEqual(result.tokens.filter((t) => t.type !== 'space').map((t) => t.type), ['heading', 'paragraph', 'code', 'table', 'html']);
  assert.equal(result.tokens.find((t) => t.type === 'code')?.text, 'const x = 1;');
});
test('legacy leading thinking is separate and thinking inside code stays literal', () => {
  const content = parseMessageContent({ rawText: '<think>private</think>Answer', reasoningContent: '' });
  assert.equal(content.reasoning, 'private'); assert.equal(content.text, 'Answer');
  assert.equal(parseMessageContent({ rawText: '```html\n<think>example</think>\n```' }).reasoning, '');
  assert.equal(parseMessageContent({ rawText: '<think>incomplete' }).text, '');
});
test('untrusted links and image schemes are rejected', () => {
  assert.equal(safeLink('javascript:alert(1)'), null); assert.equal(safeLink('file:///private'), null); assert.equal(safeImage('data:text/html;base64,aaa'), null);
  assert.equal(safeLink('https://example.com/path'), 'https://example.com/path'); assert.equal(safeImage('data:image/png;base64,abc='), 'data:image/png;base64,abc=');
  assert.equal(plainText('&lt;script&gt; &#x1f642;'), '<script> 🙂');
});
