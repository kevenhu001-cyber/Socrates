import { useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { i18n } from '../legacy/gateway';

export interface OverflowAction {
  label: string;
  icon: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  mobileOnly?: boolean;
}

/** Native popover provides light dismissal, Escape, and focus restoration. */
export function MessageOverflow({ actions }: { actions: OverflowAction[] }) {
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={trigger} type="button" className="btn btn-icon btn-touch msg-toolbar-btn"
      aria-label={i18n('message.moreActions', 'More actions')} aria-haspopup="menu"
      popoverTarget={id}
      onClick={() => {
        const rect = trigger.current!.getBoundingClientRect();
        const menu = popup.current!;
        menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 248))}px`;
        menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 280))}px`;
      }}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
    </button>
    <div ref={popup} id={id} popover="auto" className="msg-action-menu" role="menu"
      aria-label={i18n('message.moreActions', 'More actions')}
      onToggle={(event) => {
        if (event.newState === 'open') popup.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }}
      onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')].filter((button) => button.getClientRects().length);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      {actions.map((action) => <button key={action.label} type="button" role="menuitem"
        className={action.mobileOnly ? 'msg-action-mobile-only' : undefined}
        onClick={(event) => { popup.current?.hidePopover(); action.onClick?.(event); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{action.icon}</svg>
        {action.label}
      </button>)}
    </div>
  </>;
}
