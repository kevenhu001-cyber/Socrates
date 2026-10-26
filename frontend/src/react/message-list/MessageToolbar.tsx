import React from 'react';
import { getIconDescriptor } from '../../ui/iconRegistry';
import { INTERFACE_ICON_STROKE } from '../../ui/icons/interfaceIcons';
import { animateSpring, readScale } from '../../ui/motion/spring';
import { SPRING_PRESETS } from '@socrates/core/motion/spring';
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
  /** A handle on the button, for the controls that animate themselves. */
  buttonRef?: React.Ref<HTMLButtonElement>;
}

const CopyIcon = getIconDescriptor('copy').children;
const CheckIcon = getIconDescriptor('check').children;
const EditIcon = getIconDescriptor('edit').children;
const DeleteIcon = getIconDescriptor('trash').children;
const ShareIcon = getIconDescriptor('share').children;
const RegenerateIcon = getIconDescriptor('regenerate').children;
const ThumbsUpIcon = getIconDescriptor('thumbsUp').children;
const ThumbsDownIcon = getIconDescriptor('thumbsDown').children;
const BranchIcon = getIconDescriptor('branch').children;
const ReExplainIcon = getIconDescriptor('bulb').children;
const ReadAloudIcon = getIconDescriptor('speaker').children;

/* The reaction pop: one visible overshoot of roughly 19% that settles back.
 * The number is the spring's own — stiffness 380 / damping 18 give ζ = 0.46
 * and a peak of 19.5% — so the curve and the amplitude are one decision. */
const LIKE_OVERSHOOT = 0.195;

function IconButton({ label, onClick, children, svgInner, active, modifier, buttonRef }: IconButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`btn btn-icon btn-touch msg-toolbar-btn${active ? ' active' : ''}${modifier ? ` ${modifier}` : ''}`}
      aria-label={label}
      onClick={onClick}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth={INTERFACE_ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        shapeRendering="geometricPrecision"
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
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" shapeRendering="geometricPrecision" aria-hidden="true">
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
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" shapeRendering="geometricPrecision" aria-hidden="true">
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
    c.onCopy?.();
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
    c.onThumbsUp?.();
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
            onClick={handleThumbsUp}
            active={liked}
            buttonRef={likeButtonRef}
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
