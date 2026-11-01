/**
 * Unit tests for the declarative tool row's failure surface.
 *
 * The imperative inline-tool rows are gone: React draws the row from
 * `toolCalls[]` (react/tool-run). These tests pin the contract the React row
 * owes the reader when a tool fails:
 *   • the structured error code surfaces as its own technical section,
 *   • the backend retryable flag surfaces as a flagged section,
 *   • a retryable search offers a Retry button that emits `tool-retry` with
 *     the original query,
 *   • a non-retryable failure offers no Retry button.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ToolRunRow } from '../src/react/tool-run/ToolRunRow.tsx';
import { ToolRunDisclosureProvider } from '../src/react/tool-run/ToolRunDisclosure.tsx';
import { toolRunView } from '../src/react/tool-run/toolRunDetails.ts';

function failedCall(extra) {
  return {
    id: 'search-1',
    name: 'web_search',
    input: { query: 'kitten' },
    output: '',
    status: 'failed',
    errorCode: 'search_timeout',
    error: 'engine timed out',
    userMessage: '搜索超时',
    ...extra,
  };
}

/**
 * Render one row into a jsdom host and return the host plus the unmount
 * handle. The row starts closed, so the detail sections only exist once the
 * disclosure is opened.
 */
async function renderRow(call) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalCustomEvent = globalThis.CustomEvent;
  const originalAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.getElementById('root');
  const root = createRoot(host);
  const view = toolRunView(call);
  await act(() => root.render(createElement(
    ToolRunDisclosureProvider,
    null,
    createElement(ToolRunRow, { view }),
  )));
  return {
    host,
    view,
    async cleanup() {
      await act(() => root.unmount());
      dom.window.close();
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
      globalThis.CustomEvent = originalCustomEvent;
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalAct;
    },
  };
}

/** Open the row's disclosure so the detail sections mount. */
async function openRow(host) {
  const summary = host.querySelector('summary');
  assert.ok(summary, 'expected the row to render a disclosure summary');
  await act(async () => { summary.click(); });
}

test('failed tool rows surface the structured errorCode as its own technical section', async () => {
  const { host, cleanup } = await renderRow(failedCall({}));
  try {
    assert.equal(host.querySelector('.tool-inline').dataset.state, 'error');
    await openRow(host);
    const codeSection = host.querySelector('.tool-inline-detail-section[data-kind="technical"]');
    assert.ok(codeSection, 'expected an error-code technical section');
    const titles = Array.from(host.querySelectorAll('.tool-inline-detail-title')).map((el) => el.textContent);
    assert.ok(titles.includes('Error code'), 'expected an "Error code" heading');
    const values = Array.from(host.querySelectorAll('.tool-inline-detail-value')).map((el) => el.textContent);
    assert.ok(values.includes('search_timeout'), 'expected the errorCode text to render verbatim');
  } finally {
    await cleanup();
  }
});

test('failed tool rows surface the backend retryable flag with a colour-coded pill', async () => {
  const nonRetryable = await renderRow(failedCall({ retryable: false }));
  try {
    await openRow(nonRetryable.host);
    const section = nonRetryable.host.querySelector('.tool-inline-detail-section[data-retryable="0"]');
    assert.ok(section, 'expected a [data-retryable="0"] section for non-retryable failures');
  } finally {
    await nonRetryable.cleanup();
  }

  const retryable = await renderRow(failedCall({ retryable: true }));
  try {
    await openRow(retryable.host);
    const section = retryable.host.querySelector('.tool-inline-detail-section[data-retryable="1"]');
    assert.ok(section, 'expected a [data-retryable="1"] section for retryable failures');
  } finally {
    await retryable.cleanup();
  }
});

test('failed search rows render a Retry button that dispatches a tool-retry event with the original query', async () => {
  const { host, cleanup } = await renderRow(failedCall({ retryable: true }));
  try {
    const button = host.querySelector('.tool-inline-retry');
    assert.ok(button, 'expected a retry button on failed search rows');

    let captured = null;
    host.addEventListener('tool-retry', (ev) => { captured = ev.detail; });
    await act(async () => { button.click(); });

    assert.ok(captured, 'expected the click to fire a tool-retry event');
    assert.equal(captured.tool, 'web_search');
    assert.equal(captured.query, 'kitten');
    assert.equal(captured.errorCode, 'search_timeout');
  } finally {
    await cleanup();
  }
});

test('failed search rows hide the Retry button when the backend marks them non-retryable', async () => {
  const { host, cleanup } = await renderRow(failedCall({ retryable: false }));
  try {
    assert.equal(host.querySelector('.tool-inline-retry'), null, 'expected no retry button when retryable=false');
  } finally {
    await cleanup();
  }
});
