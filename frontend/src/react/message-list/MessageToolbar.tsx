import React, { useEffect, useRef, useState } from 'react';
import type { LegacyChatMessage } from '../types/domain';
import { useMessageToolbarCallbacks } from './useMessageActions';
import { t as _t } from '../legacy/gateway';

/* t() with an English fallback — same guard shape SidebarNav/SessionList
   use. The English fallbacks are byte-identical to the pre-i18n labels:
   e2e/message-list-compat selects buttons by aria-label in the default
   (en) locale. */
function ti18n(key: string, fallback: string): string {
  const v = _t(key);
  return v && v !== key ? v : fallback;
}

interface IconButtonProps {
  label: string;
  /** Stable selector for tests + menu wiring; survives label translation. */
  action: string;
  onClick?: (ev: React.MouseEvent<HTMLButtonElement>) => void;
  svgInner: string;
  active?: boolean;
}

function IconButton({ label, action, onClick, svgInner, active }: IconButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className={`msg-toolbar-btn${active ? ' active' : ''}`}
      data-msg-action={action}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: svgInner }}
      />
    </button>
  );
}

/* Inline SVGs, one per action. Kept next to the spec that renders them so
   the toolbar stays a single file until the icon registry absorbs them. */
const ICONS = {
  copy: '<rect width="14" height="14" x="8" y="8" rx="2.5"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',
  regenerate: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  thumbsUp: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
  thumbsDown: '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>',
  branch: '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  reExplain: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  readAloud: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
};

interface MenuAction {
  action: string;
  labelKey: string;
  labelFallback: string;
  svgInner: string;
  onClick?: (ev: React.MouseEvent<HTMLButtonElement>) => void;
}

/** Overflow ("…") menu for the assistant toolbar. Items stay mounted with
 *  the `hidden` attribute so count-based assertions and DOM snapshots keep
 *  working while the menu is closed; `.msg-toolbar-more.open` reveals it. */
function ToolbarMoreMenu({ actions }: { actions: MenuAction[] }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>('.msg-toolbar-more-btn')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    firstItemRef.current?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={`msg-toolbar-more${open ? ' open' : ''}`}
    >
      <button
        type="button"
        className="msg-toolbar-btn msg-toolbar-more-btn"
        data-msg-action="more"
        aria-label={ti18n('msg.more', 'More actions')}
        title={ti18n('msg.more', 'More actions')}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          dangerouslySetInnerHTML={{ __html: ICONS.more }}
        />
      </button>
      <span className="msg-toolbar-menu" role="menu" hidden={!open}>
        {actions.map((item, index) => (
          <button
            key={item.action}
            type="button"
            role="menuitem"
            className="msg-toolbar-menu-item"
            data-msg-action={item.action}
            ref={index === 0 ? firstItemRef : undefined}
            onClick={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              setOpen(false);
              item.onClick?.(ev);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              dangerouslySetInnerHTML={{ __html: item.svgInner }}
            />
            <span>{item.labelKey ? ti18n(item.labelKey, item.labelFallback) : item.labelFallback}</span>
          </button>
        ))}
      </span>
    </span>
  );
}

interface MessageToolbarProps {
  message: LegacyChatMessage;
  role: 'user' | 'assistant';
}

function MessageToolbar({ message, role }: MessageToolbarProps): React.ReactElement | null {
  const c = useMessageToolbarCallbacks(message);
  const id = typeof message.id === 'string' ? message.id
    : typeof message.clientId === 'string' ? message.clientId
    : '';

  if (role === 'user') {
    return (
      <div className="msg-toolbar" data-role={role} data-message-id={id}>
        <IconButton
          label={ti18n('msg.copy', 'Copy')}
          action="copy"
          onClick={() => c.onCopy?.()}
          svgInner={ICONS.copy}
        />
        <IconButton
          label={ti18n('msg.edit', 'Edit message')}
          action="edit"
          onClick={() => c.onEdit?.()}
          svgInner={ICONS.edit}
        />
        <IconButton
          label={ti18n('msg.delete', 'Delete message')}
          action="delete"
          onClick={() => c.onDelete?.()}
          svgInner={ICONS.trash}
        />
      </div>
    );
  }

  /* ChatGPT parity: the four actions a reader reaches for constantly stay
     inline; share / branch / re-explain / read-aloud move behind the "…"
     so an assistant bubble never carries a nine-wide button strip. */
  return (
    <div className="msg-toolbar" data-role={role} data-message-id={id}>
      <IconButton
        label={ti18n('msg.copy', 'Copy')}
        action="copy"
        onClick={() => c.onCopy?.()}
        svgInner={ICONS.copy}
      />
      <IconButton
        label={ti18n('msg.thumbsUp', 'Helpful')}
        action="thumbs-up"
        onClick={() => c.onThumbsUp?.()}
        svgInner={ICONS.thumbsUp}
      />
      <IconButton
        label={ti18n('msg.thumbsDown', 'Not helpful')}
        action="thumbs-down"
        onClick={() => c.onThumbsDown?.()}
        svgInner={ICONS.thumbsDown}
      />
      <IconButton
        label={ti18n('msg.regenerate', 'Regenerate response')}
        action="regenerate"
        onClick={() => c.onRegenerate?.()}
        svgInner={ICONS.regenerate}
      />
      <ToolbarMoreMenu
        actions={[
          {
            action: 'share',
            labelKey: 'msg.share',
            labelFallback: 'Share conversation',
            svgInner: ICONS.share,
            onClick: () => c.onShare?.(),
          },
          {
            action: 'branch',
            labelKey: 'msg.branch',
            labelFallback: 'Branch from here',
            svgInner: ICONS.branch,
            onClick: () => c.onBranch?.(),
          },
          {
            action: 're-explain',
            labelKey: 'msg.reExplain',
            labelFallback: 'Re-explain from a different angle',
            svgInner: ICONS.reExplain,
            onClick: () => c.onReExplain?.(),
          },
          {
            action: 'read-aloud',
            labelKey: 'msg.readAloud',
            labelFallback: 'Read aloud',
            svgInner: ICONS.readAloud,
            onClick: (ev) => c.onReadAloud?.(ev),
          },
        ]}
      />
    </div>
  );
}

export { MessageToolbar };
