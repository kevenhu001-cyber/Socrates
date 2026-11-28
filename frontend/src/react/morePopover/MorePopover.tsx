import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Button as UiButton } from '../ui/Button';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import type { Root } from 'react-dom/client';

import { t as _t } from '../../ui/legacyI18n.ts';
import { restingRect } from '../../legacy/pressFeedback.ts';
import { useIncognito } from '../app-mode/useIncognito.ts';
import { useMorePopoverStore } from '../../sidebar/morePopover.store.ts';
import { useMorePopoverDispatch, useMorePopoverSnapshot } from './morePopover.store';
import type { MorePopoverAction } from './types';
import { preloadSettingsPage } from '../settings/settings.preload.ts';

const POPOVER_ID = 'moreNavPopover';
const TRIGGER_ID = 'navMore';
const GAP = 8;

interface MenuItemSpec {
  action: MorePopoverAction;
  labelKey: string;
  labelFallback: string;
  icon: string;
  danger?: boolean;
}

const SHORTCUTS_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/></svg>';
const EXAM_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M9 12l2 2 4-4M8 3h8"/></svg>';
const INCOGNITO_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11h16M7 11l1.5-6h7l1.5 6"/><circle cx="8" cy="16" r="2.8"/><circle cx="16" cy="16" r="2.8"/><path d="M10.8 16h2.4"/></svg>';
const DISPLAY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h8M15 8h6M3 16h4M11 16h10"/><circle cx="13" cy="8" r="2"/><circle cx="9" cy="16" r="2"/></svg>';
const SETTINGS_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';

/* More keeps only the secondary entries that have no dedicated sidebar
   affordance. Plugins, API settings, display/theme, and sign-out live
   in the primary sidebar/footer, so they are intentionally omitted here. */
const ITEMS: MenuItemSpec[] = [
  {
    action: 'skills',
    labelKey: 'sidebar.nav.skills',
    labelFallback: 'Skills',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2"/><circle cx="17" cy="7" r="4"/><rect x="13" y="13" width="8" height="8" rx="2"/><path d="m3 21 4-7 4 7z"/></svg>',
  },
  {
    action: 'images',
    labelKey: 'sidebar.nav.images',
    labelFallback: 'Images',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  },
  {
    action: 'assistants',
    labelKey: 'sidebar.nav.assistants',
    labelFallback: 'Assistants',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="4"/><path d="M12 2v4M8 12h.01M16 12h.01M9 16c1.5 1 4.5 1 6 0"/></svg>',
  },
  { action: 'exam', labelKey: 'sidebar.nav.exam', labelFallback: 'Exam', icon: EXAM_ICON },
  {
    action: 'incognito',
    labelKey: 'sidebar.nav.incognito',
    labelFallback: 'Incognito chat',
    icon: INCOGNITO_ICON,
  },
  {
    action: 'display',
    labelKey: 'sidebar.more.display',
    labelFallback: 'Display & theme',
    icon: DISPLAY_ICON,
  },
  {
    action: 'settings',
    labelKey: 'sidebar.more.settings',
    labelFallback: 'API settings',
    icon: SETTINGS_ICON,
  },
  {
    action: 'shortcuts',
    labelKey: 'sidebar.more.shortcuts',
    labelFallback: 'Keyboard shortcuts',
    icon: SHORTCUTS_ICON,
  },
];

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v !== key ? v : fallback;
}

function MenuItem({
  spec,
  onPick,
  incognito,
}: Readonly<{
  spec: MenuItemSpec;
  incognito: boolean;
  onPick: (action: MorePopoverAction) => void;
}>) {
  const label = i18n(spec.labelKey, spec.labelFallback);
  const className = spec.danger
    ? 'sidebar-more-item sidebar-more-item-danger'
    : 'sidebar-more-item';
  const preloadSettings = spec.action === 'settings' ? preloadSettingsPage : undefined;
  return (
    <UiButton
      type="button"
      className={className}
      role={spec.action === 'incognito' ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={spec.action === 'incognito' ? incognito : undefined}
      onPointerEnter={preloadSettings}
      onPointerDown={preloadSettings}
      onFocus={preloadSettings}
      onClick={() => onPick(spec.action)}
    >
      <span dangerouslySetInnerHTML={{ __html: spec.icon }} />
      <span>{label}</span>
    </UiButton>
  );
}

export function MorePopover() {
  const isOpen = useMorePopoverSnapshot();
  const incognito = useIncognito();
  const { pick } = useMorePopoverDispatch();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ left: 8, top: 8 });

  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    const menu = menuRef.current;
    const trigger = document.getElementById(TRIGGER_ID);
    if (!menu || !trigger) return undefined;

    const updatePosition = () => {
      const rect = restingRect(trigger);
      const width = menu.offsetWidth || 220;
      const height = menu.offsetHeight;
      const maxLeft = Math.max(GAP, window.innerWidth - width - GAP);
      const left = Math.max(GAP, Math.min(rect.right - width, maxLeft));
      if (height > 0 && rect.top - GAP - height < GAP) {
        const maxTop = Math.max(GAP, window.innerHeight - height - GAP);
        const top = Math.max(GAP, Math.min(rect.bottom + GAP, maxTop));
        setPosition({ left, top, bottom: 'auto' });
      } else {
        setPosition({ left, top: 'auto', bottom: window.innerHeight - rect.top + GAP });
      }
    };
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || menu.contains(target) || trigger.contains(target)) return;
      useMorePopoverStore.getState().setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        useMorePopoverStore.getState().setOpen(false);
        trigger.focus({ preventScroll: true });
        return;
      }
      if (
        !(event.target instanceof Node) ||
        (!menu.contains(event.target) && !trigger.contains(event.target)) ||
        !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
      )
        return;
      const items = Array.from(
        menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]'),
      ).filter((item) => item.getClientRects().length > 0);
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLElement);
      let next = 0;
      if (event.key === 'End') next = items.length - 1;
      else if (event.key === 'ArrowDown') next = (current + 1) % items.length;
      else if (event.key === 'ArrowUp') next = current <= 0 ? items.length - 1 : current - 1;
      items[next]?.focus();
    };

    updatePosition();
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      document.removeEventListener('click', onDocumentClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [isOpen]);

  return (
    <div
      ref={menuRef}
      id={POPOVER_ID}
      className="sidebar-more-popover"
      role="menu"
      aria-label="更多"
      aria-hidden={!isOpen}
      inert={!isOpen}
      aria-orientation="vertical"
      aria-labelledby={TRIGGER_ID}
      data-open={String(isOpen)}
      style={position}
    >
      {ITEMS.map((item) => (
        <MenuItem key={item.action} spec={item} onPick={pick} incognito={incognito} />
      ))}
    </div>
  );
}

export interface MorePopoverHandle {
  popover: HTMLElement;
  root: Root;
  destroy: () => void;
}

/**
 * Mount the complete More menu into its stable React host. React owns its
 * visibility, placement, dismissal listeners, accessible state, and items.
 */
export function hydrateMorePopover(): MorePopoverHandle | null {
  const host = document.getElementById('moreNavPopoverRoot');
  if (!host) return null;
  return { popover: host, ...mountOwnedRoot(host, 'more-popover', <MorePopover />) };
}
