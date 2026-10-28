import React from 'react';
import { Icon } from '../../ui/Icon';
import { getIconDescriptor, type IconName } from '../../ui/iconRegistry';
import { animateSpring, readScale } from '../../ui/motion/spring';
import { SPRING_PRESETS } from '@socrates/core/motion/spring';
import { MessageOverflow } from './MessageOverflow';
import type { LegacyChatMessage } from '../types/domain';
import type { MessageToolbarCallbacks } from './types';
import { useMessageToolbarCallbacks } from './useMessageActions';
import { i18n } from '../legacy/gateway';
import { IconButton } from '../ui';
import { openWorkbench } from '../workbench/workbenchStore';

const ShareIcon = getIconDescriptor('share').children;
const ThumbsUpIcon = getIconDescriptor('thumbsUp').children;
const ThumbsDownIcon = getIconDescriptor('thumbsDown').children;
const BranchIcon = getIconDescriptor('branch').children;
const ReExplainIcon = getIconDescriptor('bulb').children;
const ReadAloudIcon = getIconDescriptor('speaker').children;

/* The reaction pop: one visible overshoot of roughly 19% that settles back.
 * The number is the spring's own — stiffness 380 / damping 18 give ζ = 0.46
 * and a peak of 19.5% — so the curve and the amplitude are one decision. */
const LIKE_OVERSHOOT = 0.195;

/* The toolbar glyph: the shared icon set, drawn the way the toolbar's own
 * sheet expects it (18px on the 24px grid, geometric edges). */
const toolbarIcon = (name: IconName) => (
  <Icon name={name} size={18} shapeRendering="geometricPrecision" />
);

interface MessageBranchSwitcherProps {
  currentIndex: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

function MessageBranchSwitcher({ currentIndex, total, onPrev, onNext }: MessageBranchSwitcherProps): React.ReactElement {
  return (
    <div className="msg-branch-switcher" role="group" aria-label={i18n('message.branch.navigation', 'Message versions')}>
      <IconButton
        variant="shared"
        size="touch"
        className="msg-toolbar-btn msg-branch-btn msg-branch-prev"
        disabled={currentIndex <= 0}
        onClick={onPrev}
        label={i18n('message.branch.prev', 'Previous version')}
        title={i18n('message.branch.prev', 'Previous version')}
        icon={<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" shapeRendering="geometricPrecision" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>}
      />
      <span className="msg-branch-counter" aria-live="polite">
        {currentIndex + 1} / {total}
      </span>
      <IconButton
        variant="shared"
        size="touch"
        className="msg-toolbar-btn msg-branch-btn msg-branch-next"
        disabled={currentIndex >= total - 1}
        onClick={onNext}
        label={i18n('message.branch.next', 'Next version')}
        title={i18n('message.branch.next', 'Next version')}
        icon={<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" shapeRendering="geometricPrecision" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>}
      />
    </div>
  );
}

interface MessageToolbarProps {
  message: LegacyChatMessage;
  role: 'user' | 'assistant';
  pending?: boolean;
}

interface MessageToolbarActionsProps {
  message: LegacyChatMessage;
  role: 'user' | 'assistant';
  callbacks: MessageToolbarCallbacks;
  copied: boolean;
  liked: boolean;
  onCopy: () => void;
  onThumbsUp: () => void;
  likeButtonRef: React.RefObject<HTMLButtonElement | null>;
}

function MessageToolbarActions({
  message,
  role,
  callbacks,
  copied,
  liked,
  onCopy,
  onThumbsUp,
  likeButtonRef,
}: MessageToolbarActionsProps): React.ReactElement {
  const openMessageWorkbench = () => openWorkbench({
    id: String(message.clientId || message.id || Date.now()),
    title: i18n('workbench.conversationTitle', 'Conversation'),
    titleKey: 'workbench.conversationTitle',
    type: 'document',
    code: message.rawText || '',
    previewHtml: message.html || undefined,
  }, 'preview');

  return (
    <>
      <IconButton
        variant="shared"
        size="touch"
        label={copied ? i18n('message.copied', 'Copied') : i18n('message.copy', 'Copy')}
        onClick={onCopy}
        className={`msg-toolbar-btn${copied ? ' active' : ''}${copied ? ' is-copied' : ''}`}
        icon={copied ? toolbarIcon('check') : toolbarIcon('copy')}
      />
      {role === 'user' && (
        <>
          <IconButton variant="shared" size="touch" className="msg-toolbar-btn"
            label={i18n('message.edit', 'Edit message')} onClick={() => callbacks.onEdit?.()}
            icon={toolbarIcon('edit')} />
          <IconButton variant="shared" size="touch" className="msg-toolbar-btn"
            label={i18n('message.delete', 'Delete message')} onClick={() => callbacks.onDelete?.()}
            icon={toolbarIcon('trash')} />
        </>
      )}
      {role === 'assistant' && (
        <>
          <IconButton variant="shared" size="touch" className="msg-toolbar-btn"
            label={i18n('message.regenerate', 'Regenerate response')} onClick={() => callbacks.onRegenerate?.()}
            icon={toolbarIcon('regenerate')} />
          <span className="msg-toolbar-feedback">
            <IconButton
              variant="shared"
              size="touch"
              className={`msg-toolbar-btn${liked ? ' active' : ''}`}
              label={i18n('message.helpful', 'Helpful')}
              aria-pressed={liked}
              onClick={onThumbsUp}
              ref={likeButtonRef}
              icon={toolbarIcon('thumbsUp')}
            />
            <IconButton variant="shared" size="touch" className="msg-toolbar-btn"
              label={i18n('message.notHelpful', 'Not helpful')} onClick={() => callbacks.onThumbsDown?.()}
              icon={toolbarIcon('thumbsDown')} />
          </span>
          <MessageOverflow actions={[
            {
              label: i18n('workbench.open', '在工作台打开'),
              icon: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /></>,
              onClick: openMessageWorkbench,
            },
            { label: i18n('message.share', 'Share conversation'), icon: ShareIcon, onClick: () => callbacks.onShare?.() },
            { label: i18n('message.branch', 'Branch from here'), icon: BranchIcon, onClick: () => callbacks.onBranch?.() },
            { label: i18n('message.readAloud', 'Read aloud'), icon: ReadAloudIcon, onClick: (event) => callbacks.onReadAloud?.(event) },
            { label: i18n('message.reExplain', 'Re-explain from a different angle'), icon: ReExplainIcon, onClick: () => callbacks.onReExplain?.() },
            { label: i18n('message.helpful', 'Helpful'), icon: ThumbsUpIcon, mobileOnly: true, onClick: () => callbacks.onThumbsUp?.() },
            { label: i18n('message.notHelpful', 'Not helpful'), icon: ThumbsDownIcon, mobileOnly: true, onClick: () => callbacks.onThumbsDown?.() },
          ]} />
        </>
      )}
    </>
  );
}

function MessageToolbar({ message, role, pending = false }: MessageToolbarProps): React.ReactElement | null {
  const callbacks = useMessageToolbarCallbacks(message);
  const [copied, setCopied] = React.useState(false);
  const [liked, setLiked] = React.useState(false);
  const likeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const likeAnimationRef = React.useRef<Animation | null>(null);
  const [, refreshLanguage] = React.useReducer((revision: number) => revision + 1, 0);
  React.useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);
  React.useEffect(() => () => { likeAnimationRef.current?.cancel(); }, []);
  const id = typeof message.id === 'string' ? message.id
    : typeof message.clientId === 'string' ? message.clientId
    : '';

  const handleCopy = () => {
    callbacks.onCopy?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Pop the reaction icon. The icon is scaled rather than the button: the
   * button carries the active pill, and growing the pill 19% would read as
   * the whole row moving.
   *
   * The pop starts from wherever the icon currently is, and the kick is
   * scaled by the distance still left to the peak — so a second click in the
   * middle of the first pop settles the icon back instead of stacking a
   * second overshoot on top of it.
   */
  const playLikePop = () => {
    const button = likeButtonRef.current;
    const icon = button?.querySelector('svg');
    if (!icon) return;
    const current = readScale(icon);
    likeAnimationRef.current?.cancel();
    likeAnimationRef.current = animateSpring(icon, {
      config: SPRING_PRESETS.like,
      from: current,
      to: 1,
      overshoot: Math.max(0, LIKE_OVERSHOOT - (current - 1)),
      property: 'scale',
    });
  };

  const handleThumbsUp = () => {
    callbacks.onThumbsUp?.();
    const next = !liked;
    setLiked(next);
    if (next) playLikePop();
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
      {hasBranches && callbacks.onSwitchBranch && (
        <MessageBranchSwitcher
          currentIndex={branchInfo.currentIndex}
          total={branchInfo.variants.length}
          onPrev={() => callbacks.onSwitchBranch?.(branchInfo.currentIndex - 1)}
          onNext={() => callbacks.onSwitchBranch?.(branchInfo.currentIndex + 1)}
        />
      )}
      <MessageToolbarActions
        message={message}
        role={role}
        callbacks={callbacks}
        copied={copied}
        liked={liked}
        onCopy={handleCopy}
        onThumbsUp={handleThumbsUp}
        likeButtonRef={likeButtonRef}
      />
    </div>
  );
}

export { MessageToolbar };
