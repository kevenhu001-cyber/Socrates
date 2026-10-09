import type { ChangeEventHandler, KeyboardEventHandler, Ref } from 'react';
import { FIND_INPUT_ID } from './findInSession.constants';

interface FindInSessionControlsProps {
  inputRef: Ref<HTMLInputElement>;
  value: string;
  countLabel: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}

export function FindInSessionControls({
  inputRef,
  value,
  countLabel,
  onChange,
  onKeyDown,
  onPrevious,
  onNext,
  onClose,
}: FindInSessionControlsProps) {
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
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      <span className="find-count" id="findCount" aria-live="polite">{countLabel}</span>
      <button className="find-nav-btn" type="button" onClick={onPrevious} title="Previous match" aria-label="Previous match" data-i18n-title="chrome.previousMatch" data-i18n-aria="chrome.previousMatch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>
      <button className="find-nav-btn" type="button" onClick={onNext} title="Next match" aria-label="Next match" data-i18n-title="chrome.nextMatch" data-i18n-aria="chrome.nextMatch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <button className="find-close-btn" type="button" onClick={onClose} title="Close find" aria-label="Close find" data-i18n-title="chrome.closeFind" data-i18n-aria="chrome.closeFind">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </>
  );
}
