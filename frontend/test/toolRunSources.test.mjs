/**
 * Unit tests for the tool row's source list.
 *
 * The standalone web-search results card is gone: the row renders its
 * sources from `toolCalls[].results` (react/tool-run). These tests pin the
 * contract the row owes the reader — duplicate entries collapse, unsafe
 * URLs never become links, and provider text is escaped.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSources } from '../src/react/tool-run/toolRunDetails.ts';

test('the source list drops duplicate entries and strips unsafe URLs', () => {
  const sources = normalizeSources([
    { title: 'Safe source', url: 'https://example.com/a', source: 'bing' },
    { title: 'Safe source', url: 'https://example.com/a' },
    { title: 'Unsafe source', url: 'javascript:alert(1)', source: '<img onerror=alert(1)>' },
  ]);

  assert.equal(sources.length, 2);
  assert.equal(sources[0].url, 'https://example.com/a');
  assert.equal(sources[0].host, 'example.com');
  /* A non-http(s) URL is dropped, so the row renders plain text, never a
     clickable `javascript:` link. */
  assert.equal(sources[1].url, '');
  assert.equal(sources[1].host, '');
});

/* Rendering (links only for http(s), provider text as text) moved to the
   shared RN SourceList; see packages/ui/src/turn/turnModels.test.ts. */
