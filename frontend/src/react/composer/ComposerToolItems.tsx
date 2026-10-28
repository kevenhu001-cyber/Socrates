import { Button } from '../ui/shadcn/button';
import { Icon } from '../../ui/Icon';
import { i18n, menuCopy, MOBILE_MENU_ITEMS, type MenuItemSpec } from './composerToolsMenuData';
import type { ComposerToolsAction } from './types';

export function MenuItem({
  spec,
  active,
  onPick,
}: {
  spec: MenuItemSpec;
  active: boolean;
  onPick: (action: ComposerToolsAction) => void;
}) {
  const { label, description } = menuCopy(spec);

  return (
    <Button
      type="button"
      variant="surface"
      size="surface"
      className={`composer-tools-item${active ? ' is-active' : ''}`}
      role={spec.kind === 'toggle' ? 'menuitemcheckbox' : 'menuitem'}
      data-composer-action={spec.key}
      aria-label={description ? `${label}: ${description}` : label}
      aria-checked={spec.kind === 'toggle' ? active : undefined}
      aria-keyshortcuts={spec.shortcut || undefined}
      onClick={(event) => {
        event.stopPropagation();
        onPick(spec.key as ComposerToolsAction);
      }}
    >
      <span className="composer-tools-icon" dangerouslySetInnerHTML={{ __html: spec.icon }} />
      <span className="composer-tools-copy">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
      {spec.shortcut ? <kbd>{spec.shortcut}</kbd> : null}
      {active ? <span className="composer-tools-active-dot" aria-hidden="true" /> : null}
    </Button>
  );
}

export function MobileMenuItem({
  action,
  labelKey,
  label,
  icon,
  active,
  onPick,
}: (typeof MOBILE_MENU_ITEMS)[number] & {
  active: boolean;
  onPick: (action: ComposerToolsAction) => void;
}) {
  const text = i18n(labelKey, label);
  return (
    <Button
      type="button"
      variant="surface"
      size="surface"
      className={`composer-tools-item composer-tools-mobile-item${active ? ' is-active' : ''}`}
      role="menuitem"
      data-composer-action={action}
      aria-label={text}
      onClick={(event) => {
        event.stopPropagation();
        onPick(action);
      }}
    >
      <span className="composer-tools-icon" dangerouslySetInnerHTML={{ __html: icon }} />
      <span className="composer-tools-copy"><span>{text}</span></span>
      {active ? (
        <Icon name="check" className="composer-tools-check" />
      ) : null}
    </Button>
  );
}
