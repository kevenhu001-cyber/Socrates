import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import { useEffect, useRef } from 'react';
import type { Root } from 'react-dom/client';

import { installCmdKBridge } from './cmdk.bridge';
import {
  useCmdKCommands,
  useCmdKResults,
  useCmdKSnapshot,
  useIsCmdKOpen,
} from './cmdk.bridge';
import { CmdKSearchInput } from './CmdKSearchInput';
import { CommandPaletteResults } from './CommandPaletteResults';

const OVERLAY_ID = 'cmdKOverlay';
const MODAL_ID = 'cmdKModal';
const RESULTS_ID = 'cmdKResults';

/**
 * Results come from the typed command palette snapshot; the established row
 * classes keep the existing visual styles, while React owns the event wiring.
 */
function CommandPalette() {
  const snapshot = useCmdKSnapshot();
  const open = useIsCmdKOpen();
  const results = useCmdKResults();
  const commands = useCmdKCommands();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      // Mirror the legacy `openCmdK` focus behaviour. setTimeout(0) gives
      // the modal a frame to mount before we steal focus.
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  if (!open) {
    return (
      <div
        className="cmd-k-modal"
        id={MODAL_ID}
        data-react-cmdk-state="closed"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cmd-k-input-row" />
        <div className="cmd-k-results" id={RESULTS_ID} />
        <div className="cmd-k-foot" />
      </div>
    );
  }

  return (
    <div
      className="cmd-k-modal"
      id={MODAL_ID}
      data-react-cmdk-state="open"
      onClick={(event) => event.stopPropagation()}
    >
      <CmdKSearchInput key={String(open)} inputRef={inputRef} onInput={commands.input} onKey={commands.key} />
      <div className="cmd-k-results" id={RESULTS_ID}>
        <CommandPaletteResults
          query={snapshot.query}
          recent={snapshot.recent}
          results={results}
          selectedIndex={snapshot.selectedIndex}
          onPickRecent={commands.input}
          onActivate={commands.activate}
        />
      </div>
      <div className="cmd-k-foot" />
    </div>
  );
}

export interface CmdKReactRootHandle {
  overlay: HTMLElement;
  root: Root;
  destroy: () => void;
}

/**
 * Hydrates the legacy `#cmdKOverlay` element with React. Idempotent — repeated calls reuse the host root. The overlay element itself is
 * preserved (same id, same classes, same `onclick` contract for the
 * backdrop-click dismissal) — React owns only `#cmdKModal`'s contents.
 *
 * Callers claim the overlay through the module-private ownership registry,
 * so the legacy renderer becomes a no-op the moment React takes over.
 */
export function hydrateCmdKOverlay(): CmdKReactRootHandle | null {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return null;
  return { overlay, ...mountOwnedRoot(overlay, 'cmd-k', <CommandPalette />, installCmdKBridge) };
}
