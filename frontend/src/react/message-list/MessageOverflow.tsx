import { useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';
import { i18n } from '../legacy/gateway';
import { DeferredMenu } from '../menu/DeferredMenu';

export interface OverflowAction {
  label: string;
  icon: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  mobileOnly?: boolean;
}

const readMobile = () => window.matchMedia('(max-width: 768px)').matches;
const subscribeClosed = () => () => {};
function subscribeMobile(onChange: () => void) {
  const media = window.matchMedia('(max-width: 768px)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/** The shared primitive owns navigation and placement. Hidden phone actions are
 * excluded from its item collection, including when an open menu is resized. */
export function MessageOverflow({ actions }: { actions: OverflowAction[] }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const mobile = useSyncExternalStore(open ? subscribeMobile : subscribeClosed, readMobile);
  const label = i18n('message.moreActions', 'More actions');
  return <DeferredMenu open={open} onOpenChange={setOpen} className="msg-action-menu" label={label} align="start"
    trigger={<button ref={trigger} type="button" className="btn btn-icon btn-touch msg-toolbar-btn" aria-label={label}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
    </button>}>
    {({ FoundationMenuItem }) => actions.filter((action) => mobile || !action.mobileOnly).map((action) =>
      <FoundationMenuItem key={action.label} className={action.mobileOnly ? 'msg-action-mobile-only' : undefined}
        onClick={(event) => {
          // Match hidePopover's synchronous return to the toolbar before an
          // action opens a modal and captures its own focus-return target.
          setOpen(false);
          trigger.current?.focus({ preventScroll: true });
          action.onClick?.(event);
        }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{action.icon}</svg>
        {action.label}
      </FoundationMenuItem>,
    )}
  </DeferredMenu>;
}
