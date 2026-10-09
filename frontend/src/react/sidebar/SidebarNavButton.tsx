import type { MouseEvent } from 'react';
import { t as translate } from '../legacy/gateway.ts';
import { navButtonId, type NavButtonSpec } from './sidebarNav.items';

function i18n(key: string, fallback: string): string {
  const value = translate(key);
  return value !== key ? value : fallback;
}

export function SidebarNavButton({
  item,
  active,
  onClick,
}: {
  item: NavButtonSpec;
  active: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const label = i18n(item.i18nKey, item.label);
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-touch sidebar-nav-btn${active ? ' active' : ''}`}
      data-nav={item.key}
      id={navButtonId(item.key)}
      data-i18n-title={item.i18nKey}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span dangerouslySetInnerHTML={{ __html: item.icon }} />
      {item.badgeKey ? (
        <span className="nav-label-wrap">
          <span data-i18n-key={item.i18nKey}>{label}</span>
          <span className="nav-new-badge" data-i18n-key={item.badgeKey}>{i18n(item.badgeKey, 'New')}</span>
        </span>
      ) : (
        <span data-i18n-key={item.i18nKey}>{label}</span>
      )}
      {item.key === 'new' ? <span className="nav-kbd">{i18n('sidebar.nav.kbd', '⌘K')}</span> : null}
    </button>
  );
}
