import React from 'react';
import { MessageOverflow } from './MessageOverflow';
import type { LegacyChatMessage } from '../types/domain';
import { useMessageToolbarCallbacks } from './useMessageActions';
import { i18n } from '../legacy/gateway';

interface IconButtonProps {
  label: string;
  onClick?: (ev: React.MouseEvent<HTMLButtonElement>) => void;
  children?: React.ReactNode;
  svgInner?: string;
  active?: boolean;
  /** Extra class for a state that CSS keys off, e.g. the copied check. */
  modifier?: string;
}

const CopyIcon = (
  <>
    <rect width="14" height="14" x="8" y="8" rx="2.5" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </>
);

const CheckIcon = <polyline points="20 6 9 17 4 12" />;

const EditIcon = (
  <>
    <path d="M12 20h9" />
    <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
  </>
);

const DeleteIcon = (
  <>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" x2="10" y1="11" y2="17" />
    <line x1="14" x2="14" y1="11" y2="17" />
  </>
);

const ShareIcon = (
  <>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" x2="12" y1="2" y2="15" />
  </>
);

const RegenerateIcon = (
  <>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </>
);

const ThumbsUpIcon = (
  <>
    <path d="M7 10v12" />
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
  </>
);

const ThumbsDownIcon = (
  <>
    <path d="M17 14V2" />
    <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
  </>
);

const BranchIcon = (
  <>
    <line x1="6" x2="6" y1="3" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </>
);

const ReExplainIcon = (
  <>
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
    <path d="M9 18h6" />
    <path d="M10 22h4" />
  </>
);

const ReadAloudIcon = (
  <>
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
    <path d="M16 9a5 5 0 0 1 0 6" />
    <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
  </>
);

function IconButton({ label, onClick, children, svgInner, active, modifier }: IconButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className={`btn btn-icon btn-touch msg-toolbar-btn${active ? ' active' : ''}${modifier ? ` ${modifier}` : ''}`}
      aria-label={label}
      onClick={onClick}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...(svgInner ? { dangerouslySetInnerHTML: { __html: svgInner } } : { children })}
      />
    </button>
  );
}

interface MessageBranchSwitcherProps {
  currentIndex: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

function MessageBranchSwitcher({ currentIndex, total, onPrev, onNext }: MessageBranchSwitcherProps): React.ReactElement {
  return (
    <div className="msg-branch-switcher" role="group" aria-label={i18n('message.branch.navigation', 'Message versions')}>
      <button
        type="button"
        className="btn btn-icon btn-touch msg-toolbar-btn msg-branch-btn msg-branch-prev"
        disabled={currentIndex <= 0}
        onClick={onPrev}
        aria-label={i18n('message.branch.prev', 'Previous version')}
        title={i18n('message.branch.prev', 'Previous version')}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span className="msg-branch-counter" aria-live="polite">
        {currentIndex + 1} / {total}
      </span>
      <button
        type="button"
        className="btn btn-icon btn-touch msg-toolbar-btn msg-branch-btn msg-branch-next"
        disabled={currentIndex >= total - 1}
        onClick={onNext}
        aria-label={i18n('message.branch.next', 'Next version')}
        title={i18n('message.branch.next', 'Next version')}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}

interface MessageToolbarProps {
  message: LegacyChatMessage;
  role: 'user' | 'assistant';
  pending?: boolean;
}

function MessageToolbar({ message, role, pending = false }: MessageToolbarProps): React.ReactElement | null {
  const c = useMessageToolbarCallbacks(message);
  const [copied, setCopied] = React.useState(false);
  const [, refreshLanguage] = React.useReducer((revision: number) => revision + 1, 0);
  React.useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);
  const id = typeof message.id === 'string' ? message.id
    : typeof message.clientId === 'string' ? message.clientId
    : '';

  const handleCopy = () => {
    c.onCopy?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Reserve the same toolbar geometry during playback without mounting any
  // actionable controls. Completion reveals actions without growing the row.
  if (pending) {
    return <div className="msg-toolbar" data-role={role} data-message-id={id}
      aria-hidden="true" inert style={{ visibility: 'hidden' }} />;
  }

  const branchInfo = message.branchInfo;
  const hasBranches = !!(branchInfo && Array.isArray(branchInfo.variants) && branchInfo.variants.length > 1);

  return (
    <div className="msg-toolbar" data-role={role} data-message-id={id}>
      {hasBranches && c.onSwitchBranch && (
        <MessageBranchSwitcher
          currentIndex={branchInfo.currentIndex}
          total={branchInfo.variants.length}
          onPrev={() => c.onSwitchBranch?.(branchInfo.currentIndex - 1)}
          onNext={() => c.onSwitchBranch?.(branchInfo.currentIndex + 1)}
        />
      )}
      <IconButton
        label={copied ? i18n('message.copied', 'Copied') : i18n('message.copy', 'Copy')}
        onClick={handleCopy}
        active={copied}
        modifier={copied ? 'is-copied' : undefined}
      >
        {copied ? CheckIcon : CopyIcon}
      </IconButton>
      {role === 'user' && (
        <>
          <IconButton
            label={i18n('message.edit', 'Edit message')}
            onClick={() => c.onEdit?.()}
          >
            {EditIcon}
          </IconButton>
          <IconButton
            label={i18n('message.delete', 'Delete message')}
            onClick={() => c.onDelete?.()}
          >
            {DeleteIcon}
          </IconButton>
        </>
      )}
      {role === 'assistant' && (
        <>
          <IconButton
            label={i18n('message.regenerate', 'Regenerate response')}
            onClick={() => c.onRegenerate?.()}
          >
            {RegenerateIcon}
          </IconButton>
          <span className="msg-toolbar-feedback">
          <IconButton
            label={i18n('message.helpful', 'Helpful')}
            onClick={() => c.onThumbsUp?.()}
          >
            {ThumbsUpIcon}
          </IconButton>
          <IconButton
            label={i18n('message.notHelpful', 'Not helpful')}
            onClick={() => c.onThumbsDown?.()}
          >
            {ThumbsDownIcon}
          </IconButton>
          </span>
          <MessageOverflow actions={[
            { label: i18n('message.share', 'Share conversation'), icon: ShareIcon, onClick: () => c.onShare?.() },
            { label: i18n('message.branch', 'Branch from here'), icon: BranchIcon, onClick: () => c.onBranch?.() },
            { label: i18n('message.readAloud', 'Read aloud'), icon: ReadAloudIcon, onClick: (event) => c.onReadAloud?.(event) },
            { label: i18n('message.reExplain', 'Re-explain from a different angle'), icon: ReExplainIcon, onClick: () => c.onReExplain?.() },
            { label: i18n('message.helpful', 'Helpful'), icon: ThumbsUpIcon, mobileOnly: true, onClick: () => c.onThumbsUp?.() },
            { label: i18n('message.notHelpful', 'Not helpful'), icon: ThumbsDownIcon, mobileOnly: true, onClick: () => c.onThumbsDown?.() },
          ]} />
        </>
      )}
    </div>
  );
}

export { MessageToolbar };
