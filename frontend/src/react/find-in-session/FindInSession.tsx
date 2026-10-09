import { clearHostMounted, markHostMountedBy } from '../lib/boot/ownership';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { installFindInSessionBridge, subscribeToFindInSession, getFindInSessionSnapshot } from './find.bridge';
import { closeFindInSession, findNext, findPrev, onFindInput } from './findInSession.actions';
import { FIND_BAR_ID } from './findInSession.constants';
import { FindInSessionControls } from './FindInSessionControls';
import type { FindInSessionSnapshot } from './types';

function FindInSession() {
  const [snapshot, setSnapshot] = useState<FindInSessionSnapshot>(getFindInSessionSnapshot);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  /* The input value is local state: the bridge flushes on the next
     animation frame, and a controlled value that lags behind the DOM makes
     React restore the stale value after each keystroke — fast typing and
     IME (pinyin) composition lost characters. */
  const [inputValue, setInputValue] = useState(snapshot.query);

  useEffect(() => {
    if (!snapshot.isOpen) setInputValue('');
  }, [snapshot.isOpen]);

  useEffect(() => {
    containerRef.current = document.getElementById(FIND_BAR_ID);
  }, []);

  useEffect(() => {
    const unsub = subscribeToFindInSession(() => {
      setSnapshot(getFindInSessionSnapshot());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.classList.toggle('hidden', !snapshot.isOpen);
  }, [snapshot.isOpen]);

  /* The bar lives at body level, so it no longer disappears with the chat
     view. Dismiss it whenever the chat view is hidden (new chat, library,
     plugins, …) so it never floats over another page. */
  useEffect(() => {
    if (!snapshot.isOpen) return undefined;
    const chatView = document.getElementById('chatView');
    if (!chatView) return undefined;
    const sync = () => { if (chatView.classList.contains('hidden')) closeFindInSession(); };
    const observer = new MutationObserver(sync);
    observer.observe(chatView, { attributes: true, attributeFilter: ['class'] });
    sync();
    return () => observer.disconnect();
  }, [snapshot.isOpen]);

  useEffect(() => {
    if (snapshot.isOpen) {
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [snapshot.isOpen]);

  const handleInput = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    onFindInput(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFindInSession();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) findPrev();
      else findNext();
    }
  }, []);

  const handlePrev = useCallback(() => {
    findPrev();
  }, []);

  const handleNext = useCallback(() => {
    findNext();
  }, []);

  const handleClose = useCallback(() => {
    closeFindInSession();
  }, []);

  const countLabel = snapshot.query
    ? `${snapshot.matchCount > 0 ? snapshot.activeIndex + 1 : 0}/${snapshot.matchCount}`
    : '';

  return (
    <FindInSessionControls
      inputRef={inputRef}
      value={inputValue}
      countLabel={countLabel}
      onChange={handleInput}
      onKeyDown={handleKeyDown}
      onPrevious={handlePrev}
      onNext={handleNext}
      onClose={handleClose}
    />
  );
}

export { openFindInSession, closeFindInSession, onFindInput, onFindKey, findNext, findPrev, isFindOpen } from './findInSession.actions';

export interface FindInSessionReactRootHandle {
  root: Root;
  destroy: () => void;
}

/**
 * Mounts the React find-in-session bar into the existing `#findBar` element.
 * Idempotent — a second call returns the existing handle.
 */
let findInSessionMounted = false;

export function hydrateFindInSession(): FindInSessionReactRootHandle | null {
  const bar = document.getElementById(FIND_BAR_ID);
  if (!bar) return null;
  /* See hydrateCmdKOverlay — the registry marks the host at dispatch time,
     before this lazy import resolves, so a module flag is the guard. */
  if (findInSessionMounted) return null;
  findInSessionMounted = true;

  installFindInSessionBridge();

  /* The bar is position:fixed, but inside #mainContent it is trapped in
     that element's stacking context (z-index 1) and renders underneath
     the top bar (z-index 5) — the search button looked like it did
     nothing. Host it at the body level so its own z-index applies. */
  if (bar.parentElement !== document.body) document.body.appendChild(bar);

  const root = createRoot(bar);
  root.render(<FindInSession />);
  markHostMountedBy(bar, 'find-in-session');

  return {
    root,
    destroy: () => {
      root.unmount();
      findInSessionMounted = false;
      clearHostMounted(bar);
    },
  };
}
