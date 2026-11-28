import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Input } from '../ui/v3';
import { Button } from '../ui/shadcn/button';
import { PageTabs } from '../ui/page/PageTabs';
import { cn } from 'cn';
import { Icon, type IconProps } from '../../legacy/Icon';
import { useUserInfo } from '../sidebar-chrome/sidebarChrome.store';
import { settingsPreferenceActions, useSettingsPreferencesStore } from './settings.store';
import type { SaveSettingsPreference, SettingsLabel, SettingsSection } from './settings.types';
import type { SettingsCategory } from './settingsNavigation';

const categoryIcons: Record<SettingsSection, IconProps['name']> = {
  general: 'sliders',
  display: 'display',
  notifications: 'bell',
  personalization: 'personalization',
  models: 'model',
  apps: 'apps',
  data: 'dataControls',
  account: 'user',
};

const settingsGroups = [
  ['general', 'display', 'personalization', 'notifications'],
  ['models', 'apps'],
  ['data', 'account'],
] as const;

function SettingsIdentity({
  label,
  onOpen,
}: Readonly<{ label: SettingsLabel; onOpen: () => void }>) {
  const user = useUserInfo();
  const free = user.tier === 'diophantus' || user.tier === 'free';
  return (
    <Button
      type="button"
      variant="ghost"
      size="surface"
      className="settings-index-identity"
      data-section="account"
      aria-label={label('账户', 'Account')}
      onClick={onOpen}
    >
      <span className="settings-identity-avatar">
        <Icon name="user" size={22} />
      </span>
      <span className="settings-identity-copy">
        <span>{user.displayName || user.email || label('访客', 'Guest')}</span>
        <span>
          {user.email && user.displayName
            ? user.email
            : free
              ? label('免费版', 'Free')
              : user.tierLabel}
        </span>
      </span>
      <Icon name="chevronRight" className="settings-category-chevron" size={16} />
    </Button>
  );
}

function MobileAppearance({
  label,
  savePreference,
}: Readonly<{
  label: SettingsLabel;
  savePreference: SaveSettingsPreference;
}>) {
  const appearance = useSettingsPreferencesStore((state) => state.theme);
  const title = label('颜色模式', 'Color mode');
  const modes = [
    ['light', label('浅色', 'Light')],
    ['dark', label('深色', 'Dark')],
    ['system', label('跟随系统', 'System')],
  ] as const;
  return (
    <div className="settings-index-appearance">
      <div className="settings-index-appearance-title">
        <span className="settings-category-icon">
          <Icon name="moon" size={20} />
        </span>
        {title}
      </div>
      <PageTabs
        className="settings-theme-options"
        ariaLabel={title}
        value={appearance}
        items={modes.map(([value, name]) => ({ value, label: name }))}
        onChange={(mode) => {
          if (appearance === mode) return;
          settingsPreferenceActions.setTheme(mode);
          void savePreference({ theme: mode });
        }}
      />
    </div>
  );
}

export function SettingsMobileSearch({
  label,
  open,
  onToggle,
}: Readonly<{
  label: SettingsLabel;
  open: boolean;
  onToggle: () => void;
}>) {
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className="settings-search-trigger"
      aria-controls="settingsSearchInput"
      aria-expanded={open}
      aria-label={label('搜索设置', 'Search settings')}
      onClick={onToggle}
    >
      <Icon name="search" size={18} />
    </Button>
  );
}

export function SettingsMobileBack({
  label,
  onBack,
}: Readonly<{
  label: SettingsLabel;
  onBack: () => void;
}>) {
  return (
    <Button
      id="settingsMobileBack"
      type="button"
      variant="ghost"
      className="settings-mobile-back"
      onClick={onBack}
    >
      <Icon name="chevronLeft" size={20} />
      {label('所有设置', 'All settings')}
    </Button>
  );
}

export function SettingsNavigation({
  categories,
  label,
  query,
  section,
  mobile,
  searchOpen,
  savePreference,
  onQueryChange,
  onSectionChange,
}: Readonly<{
  categories: SettingsCategory[];
  label: SettingsLabel;
  query: string;
  section: SettingsSection;
  mobile: boolean;
  searchOpen: boolean;
  savePreference: SaveSettingsPreference;
  onQueryChange: (query: string) => void;
  onSectionChange: (section: SettingsSection) => void;
}>) {
  /* Arrow keys walk the rail like a tab list: the categories are one
     control group, so moving between them should not require Tab through
     every row. Focus follows the selection, matching the visual state. */
  const onCategoryKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-section]'),
    );
    if (!items.length) return;
    event.preventDefault();
    const current = items.findIndex((item) => item === document.activeElement);
    const index = Math.max(0, current);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
    items[next]?.click();
  };

  const renderCategory = ({ key, name, description }: SettingsCategory) => {
    const categoryIcon = categoryIcons[key];
    const current = !mobile && section === key;
    return (
      <Button
        type="button"
        variant="ghost"
        size="surface"
        key={key}
        data-section={key}
        className={cn('settings-nav-item', 'justify-start', current && 'active')}
        aria-current={current ? 'page' : undefined}
        onClick={() => onSectionChange(key)}
      >
        <span className="settings-category-icon">
          <Icon name={categoryIcon} size={20} />
        </span>
        <span className="settings-category-copy">
          <span className="settings-category-name">{name}</span>
          <span className="settings-category-description">{description}</span>
        </span>
        <Icon name="chevronRight" className="settings-category-chevron" size={16} />
      </Button>
    );
  };

  const showOverview = mobile && !query.trim();
  const groups = settingsGroups.map((keys) =>
    keys.flatMap((key) =>
      categories.filter((category) => category.key === key && (!showOverview || key !== 'account')),
    ),
  );
  const groupLabels = [
    label('偏好设置', 'Preferences'),
    label('模型与服务', 'Models & services'),
    label('数据与账户', 'Data & account'),
  ];

  return (
    <nav className="settings-nav" aria-label={label('设置分类', 'Settings categories')}>
      {showOverview ? (
        <SettingsIdentity label={label} onOpen={() => onSectionChange('account')} />
      ) : null}
      <div className={cn('settings-search shrink-0', mobile && !searchOpen && 'hidden')}>
        <Input
          id="settingsSearchInput"
          type="search"
          size="md"
          pill
          startAdornment={<Icon name="search" size={16} />}
          placeholder={label('搜索设置', 'Search settings')}
          aria-label={label('搜索设置', 'Search settings')}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div
        className="settings-nav-categories"
        role="group"
        aria-label={label('设置类别', 'Settings categories')}
        onKeyDown={mobile ? undefined : onCategoryKeyDown}
      >
        {groups.map((group, index) =>
          group.length ? (
            <div className="settings-index-group" key={settingsGroups[index][0]}>
              {mobile && !query.trim() ? (
                <p className="settings-index-group-label">{groupLabels[index]}</p>
              ) : null}
              {group.map(renderCategory)}
            </div>
          ) : null,
        )}
        {categories.length === 0 ? (
          <p className="settings-nav-empty" role="status">
            {label('没有匹配的设置。', 'No matching settings.')}
          </p>
        ) : null}
      </div>
      {showOverview ? <MobileAppearance label={label} savePreference={savePreference} /> : null}
    </nav>
  );
}
