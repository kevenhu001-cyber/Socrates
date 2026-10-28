import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Button } from '../src/react/ui/Button.tsx';
import { NativeControl } from '../src/react/ui/NativeControl.tsx';
import { NativeSelect } from '../src/react/ui/shadcn/native-select.tsx';
import { Button as ShadcnButton } from '../src/react/ui/shadcn/button.tsx';

function render(component) {
  return new JSDOM(renderToStaticMarkup(component)).window;
}

test('the direct shadcn button does not accidentally submit a surrounding form', () => {
  const { document } = render(React.createElement(ShadcnButton, null, 'Cancel'));
  assert.equal(document.querySelector('button').type, 'button');
});

test('shadcn action variants preserve explicit submit and loading contracts', () => {
  const { document } = render(React.createElement(Button, { variant: 'destructive', size: 'touch', type: 'submit', loading: true }, 'Delete'));
  const button = document.querySelector('button');
  assert.equal(button.type, 'submit');
  assert.equal(button.dataset.slot, 'button');
  assert.equal(button.dataset.variant, 'destructive');
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(button.disabled, true);
});

test('native checkbox and picker adapters keep real form values', () => {
  const window = render(React.createElement('form', null,
    React.createElement(NativeControl, { type: 'checkbox', name: 'vision', defaultChecked: true, value: 'enabled' }),
    React.createElement(NativeControl, { type: 'range', name: 'temperature', defaultValue: '0.7', min: 0, max: 1, step: 0.1 }),
    React.createElement(NativeControl, { type: 'color', name: 'background', defaultValue: '#443322' }),
  ));
  const data = new window.FormData(window.document.querySelector('form'));
  assert.deepEqual(Object.fromEntries(data), { vision: 'enabled', temperature: '0.7', background: '#443322' });
  assert.equal(window.document.querySelector('input').dataset.slot, 'native-checkbox');
});

test('native select keeps the surface class on the actual select and submits its value', () => {
  const window = render(React.createElement('form', null,
    React.createElement(NativeSelect, { name: 'mode', className: 'settings-native-select', defaultValue: 'dark' },
      React.createElement('option', { value: 'light' }, 'Light'),
      React.createElement('option', { value: 'dark' }, 'Dark'),
    ),
  ));
  const select = window.document.querySelector('select');
  assert.ok(select.classList.contains('settings-native-select'));
  assert.equal(select.dataset.slot, 'native-select');
  assert.equal(new window.FormData(window.document.querySelector('form')).get('mode'), 'dark');
});
