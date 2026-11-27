import React from 'react';
import { Icon } from '../../legacy/Icon';
import type { IconName } from '../../legacy/iconRegistry';
import { animateSpring, readScale } from '../../legacy/motion/spring';
import { SPRING_PRESETS } from '@socrates/core/motion/spring';
import { MessageOverflow, type OverflowAction } from './MessageOverflow';
import type { ChatMessage } from '../types/domain';
import type { MessageToolbarCallbacks } from './types';
import { useMessageToolbarCallbacks } from './useMessageActions';
import { i18n } from '../../ui/legacyI18n.ts';
import { Button } from '../ui/shadcn/button';
import { TOOL_BUTTON, ToolButton } from './ToolButton';

const ShareIcon: IconName = 'share';
const ThumbsUpIcon: IconName = 'thumbsUp';
const ThumbsDownIcon: IconName = 'thumbsDown';
const BranchIcon: IconName = 'branch';
const ReExplainIcon: IconName = 'bulb';
const ReadAloudIcon: IconName = 'speaker';
const CopyIcon: IconName = 'copy';
const CheckIcon: IconName = 'copyCheck';
const EditIcon: IconName = 'edit';
const TrashIcon: IconName = 'trash';
const RegenerateIcon: IconName = 'regenerate';

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

function MessageBranchSwitcher({
  currentIndex,
  total,
  onPrev,
  onNext,
}: MessageBranchSwitcherProps): React.ReactElement {
  return (
    <div
      className="msg-branch-switcher"
      role="group"
      aria-label={i18n('message.branch.navigation', 'Message versions')}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className={`${TOOL_BUTTON} msg-branch-btn msg-branch-prev`}
        disabled={currentIndex <= 0}
        onClick={onPrev}
        aria-label={i18n('message.branch.prev', 'Previous version')}
        title={i18n('message.branch.prev', 'Previous version')}
      >
        <Icon name="chevronLeft" size={12} />
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
        <Icon name="chevronRight" size={12} />
      </Button>
    </div>
  );
}

interface MessageToolbarProps {
  message: ChatMessage;
  role: 'user' | 'assistant';
  onEdit?: () => void;
  pending?: boolean;
  /** True for the newest row in the transcript — the one that keeps its
   *  full action row on touch, where there is no hover to reveal the rest. */
  isLatest?: boolean;
  contextMenu?: { open: boolean; setOpen: (open: boolean) => void };
}

interface MessageToolbarActionsProps {
  role: 'user' | 'assistant';
  callbacks: MessageToolbarCallbacks;
  copied: boolean;
  liked: boolean;
  onCopy: () => void;
  onThumbsUp: () => void;
  likeButtonRef: React.RefObject<HTMLButtonElement | null>;
  /** Historical rows expose their actions through the context menu. */
  compact: boolean;
  contextMenu?: { open: boolean; setOpen: (open: boolean) => void };
}

function buildOverflowActions(
  role: 'user' | 'assistant' | 'system',
  callbacks: MessageToolbarCallbacks,
  copyLabel: string,
  copied: boolean,
  onCopy: () => void,
  onThumbsUp: () => void,
): { primaryActions: OverflowAction[]; secondaryActions: OverflowAction[] } {
  const primaryActions: OverflowAction[] =
    role === 'user'
      ? [
          { label: copyLabel, icon: copied ? CheckIcon : CopyIcon, onClick: onCopy },
          {
            label: i18n('message.edit', 'Edit message'),
            icon: EditIcon,
            onClick: () => callbacks.onEdit?.(),
          },
          {
            label: i18n('message.delete', 'Delete message'),
            icon: TrashIcon,
            onClick: () => callbacks.onDelete?.(),
          },
        ]
      : [
          { label: copyLabel, icon: copied ? CheckIcon : CopyIcon, onClick: onCopy },
          {
            label: i18n('message.delete', 'Delete message'),
            icon: TrashIcon,
            onClick: () => callbacks.onDelete?.(),
          },
          {
            label: i18n('message.regenerate', 'Regenerate response'),
            icon: RegenerateIcon,
            onClick: () => callbacks.onRegenerate?.(),
          },
          { label: i18n('message.helpful', 'Helpful'), icon: ThumbsUpIcon, onClick: onThumbsUp },
          {
            label: i18n('message.notHelpful', 'Not helpful'),
            icon: ThumbsDownIcon,
            onClick: () => callbacks.onThumbsDown?.(),
          },
        ];

  const secondaryActions: OverflowAction[] = [
    {
      label: i18n('message.share', 'Share conversation'),
      icon: ShareIcon,
      onClick: () => callbacks.onShare?.(),
    },
    {
      label: i18n('message.branch', 'Branch from here'),
      icon: BranchIcon,
      onClick: () => callbacks.onBranch?.(),
    },
    {
      label: i18n('message.readAloud', 'Read aloud'),
      icon: ReadAloudIcon,
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => callbacks.onReadAloud?.(event),
    },
    {
      label: i18n('message.reExplain', 'Re-explain from a different angle'),
      icon: ReExplainIcon,
      onClick: () => callbacks.onReExplain?.(),
    },
  ];

  return { primaryActions, secondaryActions };
}

function MessageToolbarActions({
  role,
  callbacks,
  copied,
  liked,
  onCopy,
  onThumbsUp,
  likeButtonRef,
  compact,
  contextMenu,
}: MessageToolbarActionsProps): React.ReactElement {
  const copyLabel = copied ? i18n('message.copied', 'Copied') : i18n('message.copy', 'Copy');
  const { primaryActions, secondaryActions } = buildOverflowActions(
    role,
    callbacks,
    copyLabel,
    copied,
    onCopy,
    onThumbsUp,
  );

  if (compact)
    return (
      <MessageOverflow
        actions={[...primaryActions, ...secondaryActions]}
        contextMenu={contextMenu}
      />
    );

  return (
    <>
      <ToolButton
        label={copyLabel}
        onClick={onCopy}
        className={`${copied ? 'active ' : ''}${copied ? 'is-copied' : ''}`}
      >
        {toolbarIcon(copied ? CheckIcon : CopyIcon)}
      </ToolButton>
      {role === 'user' && (
        <>
          {/* 2026-11-26 reference: copy · share · edit under the bubble.
              Delete stays on desktop rows; phones reach it from the
              long-press context menu. */}
          <ToolButton
            label={i18n('message.share', 'Share conversation')}
            onClick={() => callbacks.onShare?.()}
          >
            {toolbarIcon('share')}
          </ToolButton>
          <ToolButton
            label={i18n('message.edit', 'Edit message')}
            onClick={() => callbacks.onEdit?.()}
          >
            {toolbarIcon('edit')}
          </ToolButton>
          <ToolButton
            label={i18n('message.delete', 'Delete message')}
            onClick={() => callbacks.onDelete?.()}
            className="msg-toolbar-desktop-only"
          >
            {toolbarIcon('trash')}
          </ToolButton>
        </>
      )}
      {role === 'assistant' && (
        <>
          {/* 2026-11-26 reference answer row, left to right: copy · feedback ·
              read aloud · share · regenerate · more. Branch and re-explain
              live in the overflow. */}
          <span className="msg-toolbar-feedback">
            <ToolButton
              label={i18n('message.helpful', 'Helpful')}
              aria-pressed={liked}
              onClick={onThumbsUp}
              ref={likeButtonRef}
              className={liked ? 'active' : undefined}
            >
              {toolbarIcon(liked ? 'thumbsUpFilled' : ThumbsUpIcon)}
            </ToolButton>
            <ToolButton
              label={i18n('message.notHelpful', 'Not helpful')}
              onClick={() => callbacks.onThumbsDown?.()}
            >
              {toolbarIcon('thumbsDown')}
            </ToolButton>
          </span>
          <ToolButton
            label={i18n('message.readAloud', 'Read aloud')}
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => callbacks.onReadAloud?.(event)}
          >
            {toolbarIcon('speaker')}
          </ToolButton>
          <ToolButton
            label={i18n('message.share', 'Share conversation')}
            onClick={() => callbacks.onShare?.()}
          >
            {toolbarIcon('share')}
          </ToolButton>
          <ToolButton
            label={i18n('message.regenerate', 'Regenerate response')}
            onClick={() => callbacks.onRegenerate?.()}
          >
            {toolbarIcon('regenerate')}
          </ToolButton>
          <MessageOverflow
            actions={secondaryActions.filter(
              (action) => action.icon !== ShareIcon && action.icon !== ReadAloudIcon,
            )}
          />
        </>
      )}
    </>
  );
}

function MessageToolbar({
  message,
  role,
  onEdit,
  pending = false,
  isLatest,
  contextMenu,
}: MessageToolbarProps): React.ReactElement | null {
  const legacyCallbacks = useMessageToolbarCallbacks(message);
  const callbacks = onEdit ? { ...legacyCallbacks, onEdit } : legacyCallbacks;
  const [copied, setCopied] = React.useState(false);
  const [liked, setLiked] = React.useState(false);
  const likeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const likeAnimationRef = React.useRef<Animation | null>(null);
  const [, refreshLanguage] = React.useReducer((revision: number) => revision + 1, 0);
  React.useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);
  React.useEffect(
    () => () => {
      likeAnimationRef.current?.cancel();
    },
    [],
  );
  const id =
    typeof message.id === 'string'
      ? message.id
      : typeof message.clientId === 'string'
        ? message.clientId
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
    return (
      <div
        className="msg-toolbar"
        data-role={role}
        data-message-id={id}
        aria-hidden="true"
        inert
        style={{ visibility: 'hidden' }}
      />
    );
  }

  const branchInfo = message.branchInfo;
  const hasBranches = !!(
    branchInfo &&
    Array.isArray(branchInfo.variants) &&
    branchInfo.variants.length > 1
  );
  const compact = Boolean(contextMenu);

  return (
    <div
      className={contextMenu ? 'msg-context-actions' : 'msg-toolbar'}
      data-role={role}
      data-message-id={id}
      data-compact={compact ? 'true' : undefined}
    >
      {hasBranches && callbacks.onSwitchBranch && (!contextMenu || isLatest === false) && (
        <MessageBranchSwitcher
          currentIndex={branchInfo.currentIndex}
          total={branchInfo.variants.length}
          onPrev={() => callbacks.onSwitchBranch?.(branchInfo.currentIndex - 1)}
          onNext={() => callbacks.onSwitchBranch?.(branchInfo.currentIndex + 1)}
        />
      )}
      <MessageToolbarActions
        role={role}
        callbacks={callbacks}
        copied={copied}
        liked={liked}
        onCopy={handleCopy}
        onThumbsUp={handleThumbsUp}
        likeButtonRef={likeButtonRef}
        compact={compact}
        contextMenu={contextMenu}
      />
    </div>
  );
}

export { MessageToolbar };
