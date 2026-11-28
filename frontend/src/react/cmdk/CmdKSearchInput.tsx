import { Input as ShadcnInput } from '../ui/v3';
import { t } from './text';
import { Icon } from '../../legacy/Icon';
import type { KeyboardEvent, Ref } from 'react';

interface CmdKSearchInputProps {
  inputRef: Ref<HTMLInputElement>;
  onInput: (value: string) => void;
  onKey: (key: string) => void;
}

export function CmdKSearchInput({ inputRef, onInput, onKey }: CmdKSearchInputProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (!['Escape', 'ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    onKey(event.key);
  };

  return (
    <div className="cmd-k-input-row">
      <span>
        <Icon name="search" size={20} className="cmd-k-icon" />
      </span>
      <ShadcnInput
        ref={inputRef}
        type="text"
        id="cmdKInput"
        name="cmdKInput"
        aria-label={t('chrome.cmdkSearchAria', 'Search sessions and messages')}
        data-i18n-aria="chrome.cmdkSearchAria"
        placeholder={t('chrome.cmdkSearch', 'Search sessions and messages…')}
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
