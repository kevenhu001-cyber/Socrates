import { clearHostMounted, markHostMountedBy } from '../lib/boot/ownership';
import { useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';

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
 * The React palette renders the same DOM structure the legacy
 * `renderCmdKResultsHits` produced — same class names, same text content,
 * same inline event wiring translated to React handlers — so existing CSS
 * styles and the `inline-handlers.spec.mjs` audit (which only checks
 * `cmdKOverlay` overlay-level handlers, not result rows) keep working.
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
 * Hydrates the legacy `#cmdKOverlay` element with React. Idempotent — a
 * second call returns the existing handle. The overlay element itself is
 * preserved (same id, same classes, same `onclick` contract for the
 * backdrop-click dismissal) — React owns only `#cmdKModal`'s contents.
 *
 * Callers claim the overlay through the module-private ownership registry,
 * so the legacy renderer becomes a no-op the moment React takes over.
 */
let cmdKMounted = false;

export function hydrateCmdKOverlay(): CmdKReactRootHandle | null {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return null;
  /* The mount registry marks the host at dispatch time — before this lazy
     import resolves — so a module-level flag is the real re-entry guard
     (same pattern as mountConfirmDialog). */
  if (cmdKMounted) return null;
  cmdKMounted = true;

  installCmdKBridge();

  const root = createRoot(overlay);
  root.render(<CommandPalette />);
  markHostMountedBy(overlay, 'cmd-k');
  return {
    overlay,
    root,
    destroy: () => {
      root.unmount();
      cmdKMounted = false;
      clearHostMounted(overlay);
    },
  };
}
