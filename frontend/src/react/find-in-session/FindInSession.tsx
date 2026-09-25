import { clearHostMounted, hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { installFindInSessionBridge, subscribeToFindInSession, getFindInSessionSnapshot } from './find.bridge';
import { runHighlightQuery, navigateNext, navigatePrev, closeHighlights } from './findHighlight';
import type { FindInSessionSnapshot } from './types';

const FIND_BAR_ID = 'findBar';
const FIND_INPUT_ID = 'findInput';

function FindInSession() {
  const [snapshot, setSnapshot] = useState<FindInSessionSnapshot>(getFindInSessionSnapshot);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  /* The input value is local state: the bridge flushes on the next
     animation frame, and a controlled value that lags behind the DOM makes
     React restore the stale value after each keystroke — fast typing and
     IME (pinyin) composition lost characters. */
  const [inputValue, setInputValue] = useState(snapshot.query);
  const queryRef = useRef(snapshot.query);
  queryRef.current = snapshot.query;

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
    const sync = () => { if (chatView.classList.contains('hidden')) closeFind(); };
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
    const q = e.target.value.trim();
    queryRef.current = q;
    const result = runHighlightQuery(q);
    publishFind({ isOpen: true, query: q, ...result });
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFind();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = e.shiftKey ? navigatePrev() : navigateNext();
      publishFind({ isOpen: true, query: queryRef.current, ...result });
    }
  }, []);

  const handlePrev = useCallback(() => {
    const result = navigatePrev();
    publishFind({ isOpen: true, query: queryRef.current, ...result });
  }, []);

  const handleNext = useCallback(() => {
    const result = navigateNext();
    publishFind({ isOpen: true, query: queryRef.current, ...result });
  }, []);

  const handleClose = useCallback(() => {
    closeFind();
  }, []);

  const countLabel = snapshot.query
    ? `${snapshot.matchCount > 0 ? snapshot.activeIndex + 1 : 0}/${snapshot.matchCount}`
    : '';

  return (
    <>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="find-bar-icon" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        id={FIND_INPUT_ID}
        name="findInput"
        data-i18n-placeholder="find.placeholder"
        data-i18n-aria="find.placeholder"
        aria-label="Find in conversation"
        placeholder="Find in conversation…"
        autoComplete="off"
        spellCheck={false}
        value={inputValue}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
      />
      <span className="find-count" id="findCount" aria-live="polite">
        {countLabel}
      </span>
      <button className="find-nav-btn" type="button" onClick={handlePrev} title="Previous match" aria-label="Previous match">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>
      <button className="find-nav-btn" type="button" onClick={handleNext} title="Next match" aria-label="Next match">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <button className="find-close-btn" type="button" onClick={handleClose} title="Close find" aria-label="Close find">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </>
  );
}

// --- bridge / window-level helpers (used by legacy code) ---

function publishFind(state: { isOpen: boolean; query: string; matchCount: number; activeIndex: number }): void {
  const bridge = installFindInSessionBridge();
  bridge.publish(state);
}

export function openFindInSession(): void {
  publishFind({ isOpen: true, query: '', matchCount: 0, activeIndex: -1 });
  /* Reveal and focus synchronously, inside the click gesture: mobile
     browsers only raise the soft keyboard for a focus() that happens
     during the user activation, not in a later effect tick. */
  document.getElementById(FIND_BAR_ID)?.classList.remove('hidden');
  const input = document.getElementById(FIND_INPUT_ID) as HTMLInputElement | null;
  input?.focus();
}

export function closeFindInSession(): void {
  closeHighlights();
  publishFind({ isOpen: false, query: '', matchCount: 0, activeIndex: -1 });
}

export function isFindOpen(): boolean {
  return getFindInSessionSnapshot().isOpen;
}

export function onFindInput(value: string): void {
  const q = (value || '').trim();
  const result = runHighlightQuery(q);
  publishFind({ isOpen: true, query: q, ...result });
}

export function onFindKey(ev: KeyboardEvent): void {
  if (ev.key === 'Escape') {
    ev.preventDefault();
    closeFindInSession();
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    const result = ev.shiftKey ? navigatePrev() : navigateNext();
    publishFind({ isOpen: true, query: getFindInSessionSnapshot().query, ...result });
  }
}

export function findNext(): void {
  const result = navigateNext();
  publishFind({ isOpen: true, query: getFindInSessionSnapshot().query, ...result });
}

export function findPrev(): void {
  const result = navigatePrev();
  publishFind({ isOpen: true, query: getFindInSessionSnapshot().query, ...result });
}

function closeFind(): void {
  closeFindInSession();
}

export interface FindInSessionReactRootHandle {
  root: Root;
  destroy: () => void;
}

/**
 * Mounts the React find-in-session bar into the existing `#findBar` element.
 * Idempotent — a second call returns the existing handle.
 */
export function hydrateFindInSession(): FindInSessionReactRootHandle | null {
  const bar = document.getElementById(FIND_BAR_ID);
  if (!bar) return null;
  if (hostIsMountedBy(bar, 'find-in-session')) {
    throw new Error('FindInSession React runtime was initialized more than once.');
  }

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
      clearHostMounted(bar);
    },
  };
}
