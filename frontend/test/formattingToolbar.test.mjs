import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { FormattingToolbar } from '../src/react/composer-input/FormattingToolbar.tsx';

test('formatting controls expose their active state without making undo a toggle', () => {
  const editor = {
    isActive: (name) => name === 'bold',
    can: () => ({ undo: () => false, redo: () => true }),
  };
  const markup = renderToStaticMarkup(React.createElement(FormattingToolbar, { editor }));
  const document = new JSDOM(markup).window.document;
  assert.equal(document.querySelector('[aria-label="Bold"]').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('[aria-label="Italic"]').getAttribute('aria-pressed'), 'false');
  const undo = document.querySelector('[aria-label="Undo"]');
  assert.equal(undo.hasAttribute('aria-pressed'), false);
  assert.equal(undo.disabled, true);
});
