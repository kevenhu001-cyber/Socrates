import { Button } from '../ui/shadcn/button';
import { Icon } from '../../legacy/Icon';
import type { IconProps } from '../../legacy/Icon';
import { menuCopy, workflowGlyph, type MenuItemSpec } from './composerToolsMenuData';
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
      <span className="composer-tools-icon">
        <Icon name={workflowGlyph(spec.key)} size={18} />
      </span>
      <span className="composer-tools-copy">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
      {spec.shortcut ? <kbd>{spec.shortcut}</kbd> : null}
      {/* RN-7: an active tool reads as a check, like a selected plugin — never a dot. */}
      {active ? (
        <Icon name="check" className="composer-tools-check composer-tools-active-check" />
      ) : null}
    </Button>
  );
}

export function MobileToolRow({
  action,
  iconName,
  title,
  subtitle,
  rightText,
  active,
  isToggle,
  onPick,
}: {
  action: ComposerToolsAction;
  iconName: IconProps['name'];
  title: string;
  subtitle?: string;
  rightText?: string;
  active?: boolean;
  isToggle?: boolean;
  onPick: (action: ComposerToolsAction) => void;
}) {
  return (
    <Button
      type="button"
      variant="surface"
      size="surface"
      className={`composer-tools-item composer-tools-row-item${active ? ' is-active' : ''}`}
      role={isToggle ? 'menuitemcheckbox' : 'menuitem'}
      data-composer-action={action}
      aria-label={subtitle ? `${title}: ${subtitle}` : title}
      aria-checked={isToggle ? Boolean(active) : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onPick(action);
      }}
    >
      <span className="composer-tools-icon composer-tools-row-icon">
        <Icon name={iconName} size={22} />
      </span>
      <span className="composer-tools-copy composer-tools-row-copy">
        <span className="composer-tools-row-title">{title}</span>
        {subtitle ? <span className="composer-tools-row-subtitle">{subtitle}</span> : null}
      </span>
      <span className="composer-tools-row-right">
        {rightText && !active ? (
          <span className="composer-tools-row-status">{rightText}</span>
        ) : null}
        {active ? (
          <Icon name="check" className="composer-tools-check composer-tools-active-check" />
        ) : !isToggle && (rightText || action === 'managePlugins' || action === 'skills') ? (
          <Icon name="chevronRight" size={16} className="composer-tools-row-arrow" />
        ) : null}
      </span>
    </Button>
  );
}
