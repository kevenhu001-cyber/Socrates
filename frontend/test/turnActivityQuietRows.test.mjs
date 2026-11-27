// The activity surface is a quiet disclosure, not a status card: the header is
// a flush-left text row, the step list is indented rather than railed, and no
// state is carried by an opaque chip. These assertions pin that shape so the
// next redesign has to argue with a test instead of drifting back to chrome.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

// tsx applies one tsconfig (frontend/tsconfig.test.json) to every file it
// transforms, and files outside that directory fall back to esbuild's default
// classic JSX runtime. packages/ui is a sibling package, so its JSX reads
// `React` as a free variable here even though the vite build uses the automatic
// runtime (packages/ui/tsconfig.json is what keeps editors and tsc on it).
// Bind the runtime before the dynamic import rather than adding a default React
// import to the shared surface, which no other @socrates/ui module does.
globalThis.React = React;
const turnEntry = await import('../../packages/ui/src/turn/index.ts');

const here = path.dirname(fileURLToPath(import.meta.url));
const COMPONENT_SOURCE = fs.readFileSync(
  path.resolve(here, '../../packages/ui/src/turn/ThinkingSurface.tsx'),
  'utf8',
);

function mount(element) {
  const html = renderToStaticMarkup(element);
  return { html, document: new JSDOM(html).window.document };
}

function surface(props = {}) {
  return React.createElement(turnEntry.ThinkingSurface, {
    label: 'Searching official sources',
    durationLabel: '3s',
    live: false,
    expandable: true,
    open: false,
    onToggle: () => {},
    bodyId: 'turn-activity-body-test',
    ...props,
  });
}

test('the activity header carries no filled state container', () => {
  const { document } = mount(surface({ fullWidth: true }));
  const toggle = document.querySelector('[data-testid="turn-activity-toggle"]');

  assert.ok(toggle, 'the toggle is the only clickable row');
  assert.match(toggle.getAttribute('style'), /background-color:\s*transparent/);
  const style = toggle.getAttribute('style');
  // Only the reset's zero border is allowed: a row never draws an outline of
  // its own, on any edge.
  assert.match(style, /(?:^|;)border:0(?:;|$)/, 'the border is reset to zero');
  assert.doesNotMatch(
    style,
    /border-(?:top|right|bottom|left|inline|block|width|color|style)/,
    'no physical or logical edge draws on the row',
  );
  assert.equal(toggle.disabled, false, 'an expandable header is a live button');
  assert.equal(
    document.querySelector('[data-testid="turn-activity-label"]')?.textContent,
    'Searching official sources',
  );
  assert.equal(document.querySelector('[data-testid="turn-activity-duration"]')?.textContent, '3s');
});

test('the disclosure body stays inert and hidden until opened', () => {
  const collapsed = mount(surface()).document;
  const closedBody = collapsed.querySelector('[data-testid="turn-activity-body"]');
  assert.equal(closedBody.style.display, 'none');
  assert.equal(closedBody.getAttribute('aria-hidden'), 'true');
  assert.equal(
    collapsed.querySelector('[data-testid="turn-activity-toggle"]').getAttribute('aria-expanded'),
    'false',
  );

  const expanded = mount(surface({ open: true })).document;
  const openBody = expanded.querySelector('[data-testid="turn-activity-body"]');
  assert.equal(openBody.style.display, 'flex');
  assert.equal(openBody.getAttribute('aria-hidden'), 'false');
  assert.equal(
    expanded.querySelector('[data-testid="turn-activity-toggle"]').getAttribute('aria-controls'),
    'turn-activity-body-test',
  );
});

test('a non-expandable header is not a button that pretends to open', () => {
  let toggles = 0;
  const { document } = mount(surface({ expandable: false, onToggle: () => (toggles += 1) }));
  const toggle = document.querySelector('[data-testid="turn-activity-toggle"]');
  assert.equal(toggle.getAttribute('aria-expanded'), null);
  assert.equal(toggle.getAttribute('aria-controls'), null);
  assert.equal(toggle.getAttribute('aria-disabled'), 'true');
  // aria-disabled alone leaves the header activatable; the control must also be
  // natively disabled so a click cannot reach onToggle.
  assert.equal(toggle.disabled, true, 'the header is natively disabled');
  toggle.click();
  assert.equal(toggles, 0, 'a disabled header never reaches onToggle');
});

test('the step list is indented, never railed', () => {
  const { document } = mount(
    React.createElement(turnEntry.ThinkingTimeline, null, React.createElement('div', null, 'step')),
  );
  const timeline = document.querySelector('[data-testid="thinking-timeline"]');
  assert.ok(timeline, 'the timeline container renders');
  assert.equal(timeline.querySelectorAll(':scope > *').length, 1);

  const style = timeline.getAttribute('style');
  assert.doesNotMatch(style, /border/, 'indentation carries hierarchy, not a border');
  assert.doesNotMatch(style, /background/, 'no panel behind the rows');
  assert.equal(timeline.style.paddingLeft, '8px', 'the inset is a step token (4px grid)');
});

test('the surface draws colour from the theme, not from literals', () => {
  assert.doesNotMatch(
    COMPONENT_SOURCE,
    /#[0-9a-fA-F]{3,8}\b/,
    'no hex colours in the shared surface',
  );
  assert.doesNotMatch(COMPONENT_SOURCE, /\b(?:rgb|rgba|hsl)\(/, 'no functional colour literals');
  assert.doesNotMatch(
    COMPONENT_SOURCE,
    /border(?:Top|Right|Bottom|Left|Inline|Block|Start|End)|border-(?:top|right|bottom|left|inline|block|start|end)/,
    'the shared surface draws no rail, physical or logical',
  );
});

test('the retired ActivityStep capsule stays retired', () => {
  assert.equal(
    Object.prototype.hasOwnProperty.call(turnEntry, 'ActivityStep'),
    false,
    'turn/ must not re-export the deleted capsule component',
  );
  assert.doesNotMatch(COMPONENT_SOURCE, /ActivityStep/);
});
