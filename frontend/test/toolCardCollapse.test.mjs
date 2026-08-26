/**
 * Unit tests for tool-card collapse (ui/toolCards.js) and the live-output
 * omission markers (chat/liveOutput.ts renderLivePreview).  Task 6.4.
 *
 * Collapse (Req 3.1): the real implementation drives the disclosure with an
 * `.open` class on the card and mirrors it onto the header button's
 * aria-expanded; the body is shown/hidden via the `hidden` attribute + CSS.
 * These tests exercise the actual header toggle handler (and the delegated
 * fallback for cards revived without their per-card listener) through a jsdom
 * DOM fixture — the collapse logic is not exported as a pure function, so it
 * is tested via the real DOM behaviour it wires up.
 *
 * Live preview (Req 3.1 support): renderLivePreview windows a running tool's
 * bounded buffer; the omission-marker edge cases below pin its exact output
 * (byte suffix present/absent, no omissions, empty pending).
 *
 * Validation-only: no source files are modified.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

/* Spin up a minimal DOM before importing toolCards.js: the module attaches a
   document-level delegated click handler at import time, and appendToolModule
   calls document.createElement / getElementById. jsdom supplies document,
   window, CustomEvent, MutationObserver, and setInterval. */
const dom = new JSDOM('<!doctype html><html><body><div id="msgList"></div></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.Node = dom.window.Node;

const { appendToolModule } = await import('../src/ui/toolCards.js');
const { createLiveOutputBuffer, renderLivePreview } = await import('../src/chat/liveOutput.ts');

/* Mount a live (running) tool card and hand back the card + its header
   button + body element. A running card starts expanded (Req 3.1: watch
   progress while running). The caller is responsible for driving the card
   to a terminal data-tool-state so the shared elapsed-timer interval stops
   and the test process can exit. */
function mountRunningCard(toolName, input) {
  const list = document.getElementById('msgList');
  const wrap = document.createElement('div');
  wrap.className = 'msg assistant';
  const bodyHost = document.createElement('div');
  bodyHost.className = 'msg-body';
  wrap.appendChild(bodyHost);
  list.appendChild(wrap);

  appendToolModule(toolName, input, bodyHost);
  const card = bodyHost.querySelector('.agent-tool-card');
  const head = card.querySelector('.agent-tool-head');
  const cardBody = card.querySelector('.agent-tool-body');
  return { card, head, cardBody };
}

/* Move a card to a terminal state so its timer unregisters, then detach it.
   Prevents the shared ~250ms setInterval from keeping node:test alive. */
function retireCard(card) {
  card.dataset.toolState = 'complete';
  card.dataset.endedAt = String(Date.now());
  if (card.parentElement) card.parentElement.remove();
}

test('a running tool card starts expanded with .open and aria-expanded=true', () => {
  const { card, head, cardBody } = mountRunningCard('code_interpreter', { code: '', language: 'python' });
  try {
    assert.ok(card.classList.contains('open'), 'running card should mount expanded');
    assert.equal(head.getAttribute('aria-expanded'), 'true');
    assert.equal(head.getAttribute('role'), 'button');
    assert.equal(cardBody.hidden, false, 'body is visible while expanded');
  } finally {
    retireCard(card);
  }
});

test('clicking the header toggles .open, aria-expanded, and body visibility', () => {
  const { card, head, cardBody } = mountRunningCard('web_search', { query: 'kittens' });
  try {
    // Starts open (running).
    assert.ok(card.classList.contains('open'));

    // Collapse.
    head.click();
    assert.equal(card.classList.contains('open'), false, 'first click collapses');
    assert.equal(head.getAttribute('aria-expanded'), 'false');
    assert.equal(cardBody.hidden, true, 'body hidden when collapsed');

    // Expand again.
    head.click();
    assert.ok(card.classList.contains('open'), 'second click re-expands');
    assert.equal(head.getAttribute('aria-expanded'), 'true');
    assert.equal(cardBody.hidden, false);
  } finally {
    retireCard(card);
  }
});

test('Enter and Space on the header toggle collapse via keyboard', () => {
  const { card, head } = mountRunningCard('web_search', { query: 'puppies' });
  try {
    assert.ok(card.classList.contains('open'));

    const enter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    head.dispatchEvent(enter);
    assert.equal(card.classList.contains('open'), false, 'Enter collapses');
    assert.equal(head.getAttribute('aria-expanded'), 'false');

    const space = new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true });
    head.dispatchEvent(space);
    assert.ok(card.classList.contains('open'), 'Space re-expands');
    assert.equal(head.getAttribute('aria-expanded'), 'true');
  } finally {
    retireCard(card);
  }
});

test('opening a collapsed card dispatches tool-details-opened', () => {
  const { card, head } = mountRunningCard('web_search', { query: 'foxes' });
  try {
    // Collapse first, then re-open and listen for the event.
    head.click();
    assert.equal(card.classList.contains('open'), false);

    let opened = 0;
    card.addEventListener('tool-details-opened', () => { opened += 1; });
    head.click();
    assert.equal(opened, 1, 'expanding fires tool-details-opened exactly once');
  } finally {
    retireCard(card);
  }
});

test('delegated fallback toggles cards that lost their per-card listener', () => {
  // Build a card as if revived from serialized session HTML: it has the
  // header/body structure but is NOT wired (no data-wired="1"), so only the
  // document-level delegated handler can toggle it.
  const list = document.getElementById('msgList');
  const host = document.createElement('div');
  host.className = 'msg assistant';
  host.innerHTML = `
    <div class="msg-body">
      <div class="agent-tool-card tool-neutral" data-tool="web_search">
        <div class="agent-tool-head" role="button" tabindex="0" aria-expanded="false" aria-controls="restored-body">
          <span class="agent-tool-name">Search</span>
        </div>
        <div class="agent-tool-body" id="restored-body" hidden></div>
      </div>
    </div>`;
  list.appendChild(host);

  const card = host.querySelector('.agent-tool-card');
  const head = card.querySelector('.agent-tool-head');
  const cardBody = card.querySelector('.agent-tool-body');

  assert.notEqual(card.dataset.wired, '1', 'restored card is un-wired');
  assert.equal(card.classList.contains('open'), false);

  // The delegated handler listens on document; simulate a real click that
  // bubbles from an element inside the header.
  const nameSpan = head.querySelector('.agent-tool-name');
  nameSpan.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

  assert.ok(card.classList.contains('open'), 'delegated click expands the restored card');
  assert.equal(head.getAttribute('aria-expanded'), 'true');
  assert.equal(cardBody.hidden, false);

  // And collapses again.
  nameSpan.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(card.classList.contains('open'), false);
  assert.equal(head.getAttribute('aria-expanded'), 'false');
  assert.equal(cardBody.hidden, true);

  host.remove();
});

// ---------------------------------------------------------------------------
// renderLivePreview omission markers (bounded live-output buffer edge cases)
// ---------------------------------------------------------------------------

test('renderLivePreview: no omissions joins head/tail/pending with newlines', () => {
  const preview = {
    head: ['a', 'b'],
    tail: ['c'],
    pending: 'd',
    omittedLines: 0,
    omittedBytes: 0,
    totalBytes: 0,
    totalLines: 0,
  };
  assert.equal(renderLivePreview(preview), 'a\nb\nc\nd');
});

test('renderLivePreview: no omissions and empty pending omits the trailing line', () => {
  const preview = {
    head: ['a', 'b'],
    tail: [],
    pending: '',
    omittedLines: 0,
    omittedBytes: 0,
    totalBytes: 0,
    totalLines: 0,
  };
  assert.equal(renderLivePreview(preview), 'a\nb');
});

test('renderLivePreview: omission marker carries the byte suffix when bytes were dropped', () => {
  const preview = {
    head: ['one'],
    tail: ['four'],
    pending: '',
    omittedLines: 2,
    omittedBytes: 7,
    totalBytes: 0,
    totalLines: 0,
  };
  assert.equal(renderLivePreview(preview), 'one\n… +2 lines (7 B) omitted\nfour');
});

test('renderLivePreview: omission marker drops the byte suffix when omittedBytes is 0', () => {
  // Empty lines evict with zero byte cost, so the marker reports lines only.
  const preview = {
    head: ['x'],
    tail: ['y'],
    pending: '',
    omittedLines: 3,
    omittedBytes: 0,
    totalBytes: 0,
    totalLines: 0,
  };
  assert.equal(renderLivePreview(preview), 'x\n… +3 lines omitted\ny');
});

test('renderLivePreview: omission marker appears between head and tail, before pending', () => {
  const preview = {
    head: ['h1', 'h2'],
    tail: ['t1'],
    pending: 'partial',
    omittedLines: 5,
    omittedBytes: 40,
    totalBytes: 0,
    totalLines: 0,
  };
  assert.equal(
    renderLivePreview(preview),
    'h1\nh2\n… +5 lines (40 B) omitted\nt1\npartial',
  );
});

test('renderLivePreview reflects a real buffer that dropped middle lines', () => {
  // cap=1 line: head keeps 'one', the tail ring (cap 1) evicts 'two' for
  // 'three', so exactly one 3-byte line is omitted; 'four' is the pending
  // partial line.
  const buf = createLiveOutputBuffer(1, 10_000);
  buf.push('one\ntwo\nthree\n');
  buf.push('four');
  assert.equal(renderLivePreview(buf.preview()), 'one\n… +1 lines (3 B) omitted\nthree\nfour');
});

test('renderLivePreview shows no marker while everything still fits', () => {
  const buf = createLiveOutputBuffer(50, 10_000);
  buf.push('alpha\nbeta\n');
  buf.push('gam');
  const text = renderLivePreview(buf.preview());
  assert.equal(text, 'alpha\nbeta\ngam');
  assert.ok(!text.includes('omitted'), 'no omission marker when nothing dropped');
});
