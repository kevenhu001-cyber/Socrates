import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

/* Spin up a minimal DOM so createInlineToolRow (which calls
   document.createElement) can run. JSDOM is intentionally lazy — we
   only need document + window, no network/CSS. */
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.HTMLElement = dom.window.HTMLElement;

import {
  createInlineToolRow,
  settleInlineToolRow,
  settleInlineToolRowFromMessage,
} from '../src/ui/toolInline.ts';

/* Minimal jsdom-ish harness: toolInline.ts guards on
   `row.querySelector`; jsdom-style elements expose that. We build the
   row via createInlineToolRow (which sets up the right shape), then
   drive it through settle*. No window/document globals are needed for
   the assertions below because translate() falls back when window.t
   is missing. */

function buildSettledRow(result) {
  const row = createInlineToolRow({ id: 'tool-1', name: 'web_search', input: { query: 'kitten' } });
  settleInlineToolRow(row, result);
  return row;
}

test('failed tool rows surface the structured errorCode as its own technical section', () => {
  const row = buildSettledRow({
    ok: false,
    errorCode: 'search_timeout',
    error: 'engine timed out',
    userMessage: '搜索超时',
  });
  assert.equal(row.dataset.state, 'error');
  assert.equal(row.dataset.errorCode, 'search_timeout');
  const codeSection = row.querySelector('.tool-inline-detail-section[data-kind="technical"]');
  assert.ok(codeSection, 'expected an error-code technical section');
  const titles = Array.from(row.querySelectorAll('.tool-inline-detail-title')).map((el) => el.textContent);
  assert.ok(titles.includes('Error code'), 'expected an "Error code" heading');
  const values = Array.from(row.querySelectorAll('.tool-inline-detail-value')).map((el) => el.textContent);
  assert.ok(values.includes('search_timeout'), 'expected the errorCode text to render verbatim');
});

test('failed tool rows surface the backend retryable flag with a colour-coded pill', () => {
  const retryable = buildSettledRow({ ok: false, errorCode: 'invalid_query', retryable: false });
  assert.equal(retryable.dataset.retryable, '0');
  const retrySection = retryable.querySelector('.tool-inline-detail-section[data-retryable="0"]');
  assert.ok(retrySection, 'expected a [data-retryable="0"] section for non-retryable failures');

  const safe = buildSettledRow({ ok: false, errorCode: 'search_timeout', retryable: true });
  assert.equal(safe.dataset.retryable, '1');
  const safeSection = safe.querySelector('.tool-inline-detail-section[data-retryable="1"]');
  assert.ok(safeSection, 'expected a [data-retryable="1"] section for retryable failures');
});

test('failed search rows render a Retry button that dispatches a tool-retry event with the original query', () => {
  const row = buildSettledRow({ ok: false, errorCode: 'search_timeout', retryable: true });
  const button = row.querySelector('.tool-inline-retry');
  assert.ok(button, 'expected a retry button on failed search rows');

  let captured = null;
  row.addEventListener('tool-retry', (ev) => { captured = ev.detail; });
  button.click();

  assert.ok(captured, 'expected the click to fire a tool-retry event');
  assert.equal(captured.tool, 'web_search');
  assert.equal(captured.query, 'kitten');
  assert.equal(captured.errorCode, 'search_timeout');
});

test('failed search rows hide the Retry button when the backend marks them non-retryable', () => {
  const row = buildSettledRow({ ok: false, errorCode: 'invalid_query', retryable: false });
  const button = row.querySelector('.tool-inline-retry');
  assert.equal(button, null, 'expected no retry button when retryable=false');
});

test('settleInlineToolRowFromMessage threads errorCode through from the persisted toolCalls shape', () => {
  const row = createInlineToolRow({ id: 'persist-1', name: 'web_search', input: { query: 'puppy' } });
  row.dataset.groupIds = 'persist-1';
  settleInlineToolRowFromMessage(row, {
    toolCalls: [{
      id: 'persist-1',
      name: 'web_search',
      isError: true,
      errorCode: 'web_search_failed',
      retryable: false,
      error: 'engine down',
      userMessage: '搜索不可用',
    }],
  });
  /* The fallback treats all rows as cancelled (the live stream was
     cut). The assertion below verifies the structured fields still
     thread through to the data-* attributes so a user inspecting
     history / share replay can read the original errorCode. */
  assert.equal(row.dataset.errorCode, 'web_search_failed');
  assert.equal(row.dataset.retryable, '0');
  const titles = Array.from(row.querySelectorAll('.tool-inline-detail-title')).map((el) => el.textContent);
  assert.ok(titles.includes('Error code'), 'expected the restored row to expose the errorCode section');
});

test('done rows never paint errorCode or retryable data attributes', () => {
  const row = buildSettledRow({ ok: true, results: [] });
  assert.equal(row.dataset.state, 'done');
  assert.equal(row.dataset.errorCode, undefined);
  assert.equal(row.dataset.retryable, undefined);
  const code = row.querySelector('.tool-inline-detail-section[data-kind="technical"]');
  assert.equal(code, null);
});