import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { installCheatsheetBridge } from './cheatsheetStore';
import { useCheatsheetSnapshot, useCheatsheetDispatch } from './legacyAdapter';

function esc(s: string): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

function CheatsheetSection({ title, rows }: { title: string; rows: Array<[string, string[]]> }) {
  return React.createElement('div', { className: 'cheatsheet-section' },
    React.createElement('div', { className: 'cmd-k-section-label' }, title),
    ...rows.map((row, i) =>
      React.createElement('div', { className: 'cheatsheet-row', key: i },
        ...row[1].map((k, j) => React.createElement('kbd', { className: 'cheatsheet-kbd', key: j }, esc(k))),
        React.createElement('span', { className: 'cheatsheet-desc' }, esc(row[0])),
      )
    ),
  );
}

const SECTIONS: Array<[string, Array<[string, string[]]>]> = [
  ['Navigation', [
    ['Open search', ['⌘', 'K']],
    ['Toggle sidebar', ['⌘', 'B']],
    ['Open settings', ['⌘', '.']],
    ['New chat', ['⌘', '⇧', 'O']],
    ['Cycle project', ['⌘', '⇧', 'P']],
  ]],
  ['Sharing & search', [
    ['Share current chat', ['⌘', '⇧', 'S']],
    ['Open project picker', ['⌘', '⇧', 'A']],
  ]],
  ['Toggles', [
    ['Toggle theme', ['⌘', '⇧', 'T']],
    ['Toggle web search', ['⌘', '⇧', 'F']],
    ['Toggle thinking pill', ['⌘', '⇧', 'M']],
  ]],
  ['Composing', [
    ['Send (alternative)', ['⌘', '⏎']],
    ['Edit last prompt', ['↑', '(empty input)']],
    ['New line', ['⇧', '⏎']],
  ]],
];

function Cheatsheet() {
  const snap = useCheatsheetSnapshot();
  const dispatch = useCheatsheetDispatch();

  if (!snap.open) return null;

  return React.createElement('div', {
    className: 'cmd-k-overlay',
    id: 'cheatsheetOverlay',
    onClick: (e: React.MouseEvent) => { if (e.target === e.currentTarget) dispatch.close(); },
  },
    React.createElement('div', { className: 'cmd-k-modal cheatsheet', onClick: (e: React.MouseEvent) => e.stopPropagation() },
      React.createElement('div', { className: 'modal-head' },
        React.createElement('span', { className: 'modal-title' }, 'Keyboard shortcuts'),
        React.createElement('button', { className: 'modal-close', onClick: () => dispatch.close() }, '×'),
      ),
      React.createElement('div', { className: 'cheatsheet-body' },
        ...SECTIONS.map(([title, rows]) => React.createElement(CheatsheetSection, { key: title, title, rows })),
      ),
    ),
  );
}

let root: Root | null = null;

export function mountCheatsheet(): void {
  installCheatsheetBridge();
  let container = document.getElementById('cheatsheetReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'cheatsheetReactRoot';
    document.body.appendChild(container);
  }
  if (!root) root = createRoot(container);
  root.render(React.createElement(Cheatsheet));
}

export function unmountCheatsheet(): void {
  if (root) { root.unmount(); root = null; }
}
