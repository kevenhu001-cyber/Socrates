import React from 'react';
import { Icon } from '../../ui/Icon';
import { getIconDescriptor, type IconName } from '../../ui/iconRegistry';
import { animateSpring, readScale } from '../../ui/motion/spring';
import { SPRING_PRESETS } from '@socrates/core/motion/spring';
import { MessageOverflow, type OverflowAction } from './MessageOverflow';
import type { LegacyChatMessage } from '../types/domain';
import type { MessageToolbarCallbacks } from './types';
import { useMessageToolbarCallbacks } from './useMessageActions';
import { i18n } from '../legacy/gateway';
import { Button } from '../ui/shadcn/button';
import { TOOL_BUTTON, ToolButton } from './ToolButton';
import { openWorkbench } from '../workbench/workbenchStore';

const ShareIcon = getIconDescriptor('share').children;
const ThumbsUpIcon = getIconDescriptor('thumbsUp').children;
const ThumbsDownIcon = getIconDescriptor('thumbsDown').children;
const BranchIcon = getIconDescriptor('branch').children;
const ReExplainIcon = getIconDescriptor('bulb').children;
const ReadAloudIcon = getIconDescriptor('speaker').children;
const CopyIcon = getIconDescriptor('copy').children;
const CheckIcon = getIconDescriptor('check').children;
const EditIcon = getIconDescriptor('edit').children;
const TrashIcon = getIconDescriptor('trash').children;
const RegenerateIcon = getIconDescriptor('regenerate').children;

/* `hover: none` is the same signal the toolbar's own CSS uses, so the compact
   layout and the stylesheet agree on what counts as a touch device. */
const TOUCH_QUERY = '(hover: none)';
const touchMedia = typeof window === 'undefined' ? null : window.matchMedia(TOUCH_QUERY);
const readTouch = () => touchMedia?.matches ?? false;
function subscribeTouch(onChange: () => void) {
  touchMedia?.addEventListener('change', onChange);
  return () => touchMedia?.removeEventListener('change', onChange);
}

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
      <Button
        variant="ghost"
        size="icon-sm"
        className={`${TOOL_BUTTON} msg-branch-btn msg-branch-prev`}
        disabled={currentIndex <= 0}
        onClick={onPrev}
        aria-label={i18n('message.branch.prev', 'Previous version')}
        title={i18n('message.branch.prev', 'Previous version')}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" shapeRendering="geometricPrecision" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </Button>
      <span className="msg-branch-counter" aria-live="polite">
        {currentIndex + 1} / {total}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className={`${TOOL_BUTTON} msg-branch-btn msg-branch-next`}
        disabled={currentIndex >= total - 1}
        onClick={onNext}
        aria-label={i18n('message.branch.next', 'Next version')}
        title={i18n('message.branch.next', 'Next version')}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" shapeRendering="geometricPrecision" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </Button>
    </div>
  );
}

interface MessageToolbarProps {
  message: LegacyChatMessage;
  role: 'user' | 'assistant';
  onEdit?: () => void;
  pending?: boolean;
  /** True for the newest row in the transcript — the one that keeps its
   *  full action row on touch, where there is no hover to reveal the rest. */
  isLatest?: boolean;
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
  /** Touch layouts collapse an older row to a single "…" trigger. */
  compact: boolean;
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
  compact,
}: MessageToolbarActionsProps): React.ReactElement {
  const openMessageWorkbench = () => openWorkbench({
    id: String(message.clientId || message.id || Date.now()),
    title: i18n('workbench.conversationTitle', 'Conversation'),
    titleKey: 'workbench.conversationTitle',
    type: 'document',
    code: message.rawText || '',
    previewHtml: message.html || undefined,
  }, 'preview');

  const copyLabel = copied ? i18n('message.copied', 'Copied') : i18n('message.copy', 'Copy');

  /* One action list, two shapes. Pointer devices (and the newest row on
     touch) render the strip; an older row on touch collapses to a single
     "…" trigger, because five always-on buttons under every answer is the
     loudest thing on a phone screen and there is no hover to defer them. */
  const primaryActions: OverflowAction[] = role === 'user'
    ? [
        { label: copyLabel, icon: copied ? CheckIcon : CopyIcon, onClick: onCopy },
        { label: i18n('message.edit', 'Edit message'), icon: EditIcon, onClick: () => callbacks.onEdit?.() },
        { label: i18n('message.delete', 'Delete message'), icon: TrashIcon, onClick: () => callbacks.onDelete?.() },
      ]
    : [
        { label: copyLabel, icon: copied ? CheckIcon : CopyIcon, onClick: onCopy },
        { label: i18n('message.regenerate', 'Regenerate response'), icon: RegenerateIcon, onClick: () => callbacks.onRegenerate?.() },
        { label: i18n('message.helpful', 'Helpful'), icon: ThumbsUpIcon, onClick: onThumbsUp },
        { label: i18n('message.notHelpful', 'Not helpful'), icon: ThumbsDownIcon, onClick: () => callbacks.onThumbsDown?.() },
      ];

  const secondaryActions: OverflowAction[] = [
    {
      label: i18n('workbench.open', '在工作台打开'),
      icon: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /></>,
      onClick: openMessageWorkbench,
    },
    { label: i18n('message.share', 'Share conversation'), icon: ShareIcon, onClick: () => callbacks.onShare?.() },
    { label: i18n('message.branch', 'Branch from here'), icon: BranchIcon, onClick: () => callbacks.onBranch?.() },
    { label: i18n('message.readAloud', 'Read aloud'), icon: ReadAloudIcon, onClick: (event: React.MouseEvent<HTMLButtonElement>) => callbacks.onReadAloud?.(event) },
    { label: i18n('message.reExplain', 'Re-explain from a different angle'), icon: ReExplainIcon, onClick: () => callbacks.onReExplain?.() },
  ];

  if (compact) return <MessageOverflow actions={[...primaryActions, ...secondaryActions]} />;

  return (
    <>
      <ToolButton
        label={copyLabel}
        onClick={onCopy}
        className={`${copied ? 'active ' : ''}${copied ? 'is-copied' : ''}`}
      >
        {copied ? toolbarIcon('check') : toolbarIcon('copy')}
      </ToolButton>
      {role === 'user' && (
        <>
          <ToolButton label={i18n('message.edit', 'Edit message')} onClick={() => callbacks.onEdit?.()}>
            {toolbarIcon('edit')}
          </ToolButton>
          <ToolButton label={i18n('message.delete', 'Delete message')} onClick={() => callbacks.onDelete?.()}>
            {toolbarIcon('trash')}
          </ToolButton>
        </>
      )}
      {role === 'assistant' && (
        <>
          <ToolButton label={i18n('message.regenerate', 'Regenerate response')} onClick={() => callbacks.onRegenerate?.()}>
            {toolbarIcon('regenerate')}
          </ToolButton>
          <span className="msg-toolbar-feedback">
            <ToolButton
              label={i18n('message.helpful', 'Helpful')}
              aria-pressed={liked}
              onClick={onThumbsUp}
              ref={likeButtonRef}
              className={liked ? 'active' : undefined}
            >
              {toolbarIcon('thumbsUp')}
            </ToolButton>
            <ToolButton label={i18n('message.notHelpful', 'Not helpful')} onClick={() => callbacks.onThumbsDown?.()}>
              {toolbarIcon('thumbsDown')}
            </ToolButton>
          </span>
          <MessageOverflow actions={[
            ...secondaryActions,
            { label: i18n('message.helpful', 'Helpful'), icon: ThumbsUpIcon, mobileOnly: true, onClick: () => callbacks.onThumbsUp?.() },
            { label: i18n('message.notHelpful', 'Not helpful'), icon: ThumbsDownIcon, mobileOnly: true, onClick: () => callbacks.onThumbsDown?.() },
          ]} />
        </>
      )}
    </>
  );
}

function MessageToolbar({ message, role, onEdit, pending = false, isLatest = false }: MessageToolbarProps): React.ReactElement | null {
  const legacyCallbacks = useMessageToolbarCallbacks(message);
  const callbacks = onEdit ? { ...legacyCallbacks, onEdit } : legacyCallbacks;
  const touchLayout = React.useSyncExternalStore(subscribeTouch, readTouch);
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
  const compact = touchLayout && !isLatest;

  return (
    <div className="msg-toolbar" data-role={role} data-message-id={id} data-compact={compact ? 'true' : undefined}>
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
        compact={compact}
      />
    </div>
  );
}

export { MessageToolbar };
