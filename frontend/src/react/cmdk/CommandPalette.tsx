import { useEffect, useRef } from 'react';
import type { Root } from 'react-dom/client';
import { cn } from 'cn';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { installModalA11y } from '../../ui/modalA11y.ts';

import {
  useCmdKCommands,
  useCmdKSnapshot,
} from './cmdk.store';
import { CmdKSearchInput } from './CmdKSearchInput';
import { CommandPaletteResults } from './CommandPaletteResults';
import { t } from './text';

const OVERLAY_ID = 'cmdKOverlay';
const MODAL_ID = 'cmdKModal';
const RESULTS_ID = 'cmdKResults';

/* The foot carried a border-top and 8px padding but no content, so the
   palette ended in a blank strip. The three hints are the shortcuts the
   input actually handles. */
function PaletteFooter() {
  return (
    <div className="cmd-k-foot">
      <span>
        <kbd>↑</kbd>
        <kbd>↓</kbd>
        {t('chrome.cmdkFootNavigate', 'Navigate')}
      </span>
      <span>
        <kbd>↵</kbd>
        {t('chrome.cmdkFootOpen', 'Open')}
      </span>
      <span>
        <kbd>Esc</kbd>
        {t('chrome.cmdkFootClose', 'Close')}
      </span>
    </div>
  );
}

/**
 * Results come from the shared command palette state; the established row
 * classes keep the existing visual styles, while React owns the event wiring.
 */
export function CommandPalette() {
  const snapshot = useCmdKSnapshot();
  const open = snapshot.isOpen;
  const results = snapshot.results;
  const commands = useCmdKCommands();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    installModalA11y({
      overlayId: OVERLAY_ID,
      closeFn: commands.close,
    });
  }, [commands.close]);

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

  return (
    <div
      className={cn('cmd-k-overlay', !open && 'hidden')}
      id={OVERLAY_ID}
      role="dialog"
      aria-modal="true"
      aria-label={t('chrome.commandPalette', 'Command palette')}
      data-i18n-aria="chrome.commandPalette"
      onClick={commands.close}
    >
      <div
        className="cmd-k-modal"
        id={MODAL_ID}
        data-react-cmdk-state={open ? 'open' : 'closed'}
        onClick={(event) => event.stopPropagation()}
      >
        {open ? (
          <>
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
            <PaletteFooter />
          </>
        ) : (
          <>
            <div className="cmd-k-input-row" />
            <div className="cmd-k-results" id={RESULTS_ID} />
            <PaletteFooter />
          </>
        )}
      </div>
    </div>
  );
}

export interface CmdKReactRootHandle {
  overlay: HTMLElement;
  root: Root;
  destroy: () => void;
}

const rootSlot = createRootSlot('cmd-k');

/**
 * Mount the React-owned Command Palette into its own body-level root.
 */
export function mountCmdK(): void {
  let container = document.getElementById('cmdKReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'cmdKReactRoot';
    document.body.appendChild(container);
  }
  rootSlot.mount(container, <CommandPalette />);
}

export function unmountCmdK(): void {
  rootSlot.destroy();
}

/**
 * Legacy compatibility hydration shim.
 */
export function hydrateCmdKOverlay(): CmdKReactRootHandle | null {
  mountCmdK();
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return null;
  return {
    overlay,
    root: null as unknown as Root,
    destroy: unmountCmdK,
  };
}
