import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../ui/shadcn/button';
import { Textarea } from '../ui/shadcn/textarea';
import { i18n, isWebSearchOn, isExtensiveThinkingOn } from '../legacy/gateway';
import { getStoredReasoningEffort, getStoredResponseSpeed, saveChatPreferences } from '../../config/chatPreferences.ts';
import { setWebSearchOn } from '../../config/providers.ts';

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function AtomIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="2.5" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(45 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-45 12 12)" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="3.6" y1="9" x2="20.4" y2="9" />
      <line x1="3.6" y1="15" x2="20.4" y2="15" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="6 11 12 5 18 11" />
    </svg>
  );
}

function useEditPreferences() {
  const [deepThinking, setDeepThinking] = useState(() => isExtensiveThinkingOn() || getStoredReasoningEffort() === 'high');
  const [smartSearch, setSmartSearch] = useState(() => isWebSearchOn());
  useEffect(() => {
    const onPrefChange = (event: Event) => {
      const detail = (event as CustomEvent<{ effort?: string }>).detail;
      if (detail?.effort) setDeepThinking(detail.effort === 'high');
    };
    const onSearchChange = (event: Event) => {
      const detail = (event as CustomEvent<{ on?: boolean }>).detail;
      if (typeof detail?.on === 'boolean') setSmartSearch(detail.on);
    };
    window.addEventListener('socrates:chat-preferences', onPrefChange);
    document.addEventListener('socrates:websearchchange', onSearchChange);
    return () => {
      window.removeEventListener('socrates:chat-preferences', onPrefChange);
      document.removeEventListener('socrates:websearchchange', onSearchChange);
    };
  }, []);

  const toggleDeepThinking = () => {
    const next = !deepThinking;
    setDeepThinking(next);
    saveChatPreferences(next ? 'high' : 'medium', getStoredResponseSpeed());
  };

  const toggleSmartSearch = () => {
    const next = !smartSearch;
    setSmartSearch(next);
    setWebSearchOn(next);
  };

  return { deepThinking, smartSearch, toggleDeepThinking, toggleSmartSearch };
}

export function MessageEditForm({ initialText, cancelLabel, submitLabel, onCancel, onCommit }: {
  initialText: string;
  cancelLabel: string;
  submitLabel: string;
  onCancel: () => void;
  onCommit: (text: string) => void;
}) {
  const [value, setValue] = useState(initialText);
  const { deepThinking, smartSearch, toggleDeepThinking, toggleSmartSearch } = useEditPreferences();
  const input = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = input.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 60), 320)}px`;
  }, []);

  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.currentTarget.value);
    const textarea = event.currentTarget;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 60), 320)}px`;
  };

  const commit = () => {
    if (!value.trim()) return;
    onCommit(value);
  };

  return (
    <div className="msg-edit-wrap" role="region" aria-label={i18n('message.editInput', '修改输入')}>
      <div className="msg-edit-header">
        <span className="msg-edit-title">
          {i18n('message.editInput', '修改输入')}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="msg-edit-btn msg-edit-cancel msg-edit-close-btn"
          onClick={onCancel}
          aria-label={cancelLabel}
          title={cancelLabel}
        >
          <CloseIcon />
        </Button>
      </div>

      <Textarea
        ref={input}
        className="msg-edit-area"
        value={value}
        onChange={handleTextChange}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />

      <div className="msg-edit-footer">
        <div className="msg-edit-toggles" role="group" aria-label={i18n('chat.modeOptions', 'Mode options')}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`msg-edit-pill ${deepThinking ? 'is-active' : ''}`}
            onClick={toggleDeepThinking}
            aria-pressed={deepThinking}
          >
            <AtomIcon />
            <span>{i18n('composer.deepThinking', '深度思考')}</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`msg-edit-pill ${smartSearch ? 'is-active' : ''}`}
            onClick={toggleSmartSearch}
            aria-pressed={smartSearch}
          >
            <GlobeIcon />
            <span>{i18n('composer.smartSearch', '智能搜索')}</span>
          </Button>
        </div>

        <div className="msg-edit-actions">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="msg-edit-plus-btn"
            aria-label={i18n('chrome.addToolsFiles', 'Add tools and files')}
            title={i18n('chrome.addToolsFiles', 'Add tools and files')}
            onClick={() => {
              const attachInput = document.getElementById('composerAttachInput') as HTMLInputElement | null;
              attachInput?.click();
            }}
          >
            <PlusIcon />
          </Button>
          <Button
            type="button"
            variant="default"
            size="icon-sm"
            className="msg-edit-btn msg-edit-submit"
            onClick={commit}
            disabled={!value.trim()}
            aria-label={submitLabel}
            title={submitLabel}
          >
            <ArrowUpIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
