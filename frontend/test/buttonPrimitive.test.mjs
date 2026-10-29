import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Button } from '../src/react/ui/Button.tsx';
import { IconButton } from '../src/react/ui/IconButton.tsx';

function renderButton(component, props, children) {
  const html = renderToStaticMarkup(React.createElement(component, props, children));
  return new JSDOM(html).window.document.querySelector('button');
}

test('button preserves form intent, surface classes and explicit busy state', () => {
  const ordinary = renderButton(Button, { className: 'settings-close', 'aria-busy': true }, 'Close');
  assert.equal(ordinary.type, 'button');
  /* The shared Button delegates to the shadcn recipe, so the class list is the
     recipe plus the caller's own class — never the caller's class alone. The
     caller's class still has to survive the delegation. */
  const classes = ordinary.className.split(/\s+/);
  assert.ok(classes.includes('settings-close'), 'the caller class survives');
  assert.ok(classes.includes('group/button'), 'the shadcn recipe owns the skin');
  assert.ok(classes.includes('bg-primary'), 'the default variant paints with the semantic primary role');
  assert.equal(ordinary.getAttribute('aria-busy'), 'true');
  assert.equal(ordinary.disabled, false);

  const submit = renderButton(Button, { type: 'submit', disabled: true }, 'Add');
  assert.equal(submit.type, 'submit');
  assert.equal(submit.disabled, true);
});

test('button supports existing icon markup while preserving its accessible name', () => {
  const button = renderButton(Button, {
    'aria-label': 'Search chats',
    dangerouslySetInnerHTML: { __html: '<svg aria-hidden="true"></svg>' },
  });
  assert.equal(button.getAttribute('aria-label'), 'Search chats');
  assert.equal(button.querySelector('svg')?.getAttribute('aria-hidden'), 'true');
});

test('loading buttons are disabled and retain an accessible name', () => {
  const button = renderButton(Button, { loading: true, 'aria-busy': false }, 'Save');
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(button.textContent, 'Save');

  const icon = renderButton(IconButton, {
    label: 'Close',
    icon: React.createElement('span', { 'aria-hidden': true }, '×'),
    loading: true,
  });
  assert.equal(icon.type, 'button');
  assert.equal(icon.disabled, true);
  assert.equal(icon.getAttribute('aria-busy'), 'true');
  assert.equal(icon.getAttribute('aria-label'), 'Close');
});
