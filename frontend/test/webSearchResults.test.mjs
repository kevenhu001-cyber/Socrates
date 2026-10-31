import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WebSearchResults } from '../src/react/toolCards/WebSearchResults.tsx';
import { normalizeWebSearchResults } from '../src/ui/toolSearchResultsModel.ts';

test('web search result model drops duplicate entries and sanitizes unsafe URLs', () => {
  const results = normalizeWebSearchResults([
    { title: 'Safe source', url: 'https://example.com/a', snippet: 'A summary', source: 'bing' },
    { title: 'Safe source', url: 'https://example.com/a', snippet: 'Duplicate' },
    { title: 'Unsafe source', url: 'javascript:alert(1)', snippet: '<img onerror=alert(1)>' },
  ]);

  assert.equal(results.length, 2);
  assert.equal(results[0].url, 'https://example.com/a');
  assert.equal(results[0].host, 'example.com');
  assert.equal(results[1].url, '#');
  assert.equal(results[1].host, '');
  assert.equal(results[1].snippet, '<img onerror=alert(1)>');
});

test('React search results render sanitized links and escaped provider text', () => {
  const sources = normalizeWebSearchResults([
    { title: 'Trusted source', url: 'https://example.test/source', snippet: 'A concise result.' },
    { title: 'Unsafe source', url: 'javascript:alert(1)', snippet: '<img onerror=alert(1)>' },
  ]);
  const previousWindow = globalThis.window;
  globalThis.window = { t: (key) => key };
  try {
    const html = renderToStaticMarkup(createElement(WebSearchResults, { sources, query: 'Socrates' }));
    assert.match(html, /href="https:\/\/example\.test\/source"/);
    assert.doesNotMatch(html, /href="javascript:/);
    assert.match(html, /aria-disabled="true"/);
    assert.match(html, /&lt;img onerror=alert\(1\)&gt;/);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
