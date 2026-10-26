import { useRef } from 'react';
import { createRootSlot } from '../lib/boot/ownedRoot';
import {
  FoundationDialog,
  FoundationDialogClose,
  FoundationDialogTitle,
} from '../dialog/FoundationDialog';
import {
  installCheatsheetBridge,
  useCheatsheetDispatch,
  useCheatsheetSnapshot,
} from './cheatsheet.bridge';

function CheatsheetSection({ title, rows }: { title: string; rows: Array<[string, string[]]> }) {
  return (
    <div className="cheatsheet-section">
      <div className="cmd-k-section-label">{title}</div>
      {rows.map(([desc, keys], i) => (
        <div className="cheatsheet-row" key={i}>
          {keys.map((k, j) => (
            <kbd className="cheatsheet-kbd" key={j}>{k}</kbd>
          ))}
          <span className="cheatsheet-desc">{desc}</span>
        </div>
      ))}
    </div>
  );
}

const SECTIONS: Array<[string, Array<[string, string[]]>]> = [
  ['Navigation', [
    ['Open search', ['⌘', 'K']],
    ['Keyboard shortcuts', ['⌘', '/']],
    ['Toggle sidebar', ['⌘', 'B']],
    ['Toggle sidebar (alt)', ['Ctrl', '\\']],
    ['Open settings', ['⌘', '.']],
    ['New chat', ['⌘', '⇧', 'O']],
    ['Cycle project', ['⌘', '⇧', 'P']],
  ]],
  ['Sharing & search', [
    ['Share current chat', ['⌘', '⇧', 'S']],
    ['Open project picker', ['⌘', '⇧', 'A']],
    ['Find in conversation', ['⌘', 'F']],
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
  ['General', [
    ['Close dialog', ['Esc']],
  ]],
];

function Cheatsheet() {
  const snap = useCheatsheetSnapshot();
  const dispatch = useCheatsheetDispatch();
  const titleRef = useRef<HTMLDivElement>(null);

  return (
    <FoundationDialog
      id="cheatsheetOverlay"
      open={snap.open}
      onOpenChange={(open) => {
        if (!open) dispatch.close();
      }}
      overlayClassName="cmd-k-overlay"
      className="cmd-k-modal cheatsheet"
      initialFocus={titleRef}
    >
      <div className="modal-head">
        <FoundationDialogTitle ref={titleRef} tabIndex={-1} className="modal-title">
          Keyboard shortcuts
        </FoundationDialogTitle>
        <FoundationDialogClose className="modal-close" onClick={() => dispatch.close()} aria-label="Close">
          ×
        </FoundationDialogClose>
      </div>
      <div className="cheatsheet-body">
        {SECTIONS.map(([title, rows]) => (
          <CheatsheetSection key={title} title={title} rows={rows} />
        ))}
      </div>
    </FoundationDialog>
  );
}

const rootSlot = createRootSlot('cheatsheet');

export function mountCheatsheet(): void {
  let container = document.getElementById('cheatsheetReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'cheatsheetReactRoot';
    document.body.appendChild(container);
  }
  rootSlot.mount(container, <Cheatsheet />, installCheatsheetBridge);
}

export function unmountCheatsheet(): void {
  rootSlot.destroy();
}
