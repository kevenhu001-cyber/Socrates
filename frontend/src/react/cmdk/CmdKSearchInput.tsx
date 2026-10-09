import type { KeyboardEvent, Ref } from 'react';

interface CmdKSearchInputProps {
  inputRef: Ref<HTMLInputElement>;
  onInput: (value: string) => void;
  onKey: (key: string) => void;
}

export function CmdKSearchInput({ inputRef, onInput, onKey }: CmdKSearchInputProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!['Escape', 'ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    onKey(event.key);
  };

  return (
    <div className="cmd-k-input-row">
      <span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="cmd-k-icon" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </span>
      <input
        ref={inputRef}
        type="text"
        id="cmdKInput"
        name="cmdKInput"
        aria-label="Search sessions and messages"
        data-i18n-aria="chrome.cmdkSearchAria"
        placeholder="Search sessions and messages…"
        data-i18n-placeholder="chrome.cmdkSearch"
        autoComplete="off"
        spellCheck={false}
        defaultValue=""
        onChange={(event) => onInput(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <kbd className="cmd-k-kbd">Esc</kbd>
    </div>
  );
}
