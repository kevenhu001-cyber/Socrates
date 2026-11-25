import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { InputGroup, InputGroupInput, InputGroupAddon } from '../ui/shadcn/input-group';
import { Button } from '../ui/shadcn/button';
import {
  BellIcon,
  BoxesIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CpuIcon,
  DatabaseIcon,
  MonitorIcon,
  Settings2Icon,
  SparklesIcon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { Icon, type IconProps } from '../../legacy/Icon';
import { useUserInfo } from '../sidebar-chrome/sidebarChrome.store';
import { settingsPreferenceActions, useSettingsPreferencesStore } from './settings.store';
import type { SaveSettingsPreference, SettingsLabel, SettingsSection } from './settings.types';
import type { SettingsCategory } from './settingsNavigation';

const categoryIcons: Record<SettingsSection, LucideIcon> = {
  general: Settings2Icon,
  display: MonitorIcon,
  notifications: BellIcon,
  personalization: SparklesIcon,
  models: CpuIcon,
  apps: BoxesIcon,
  data: DatabaseIcon,
  account: UserRoundIcon,
};

const officialCategoryIcons: Partial<Record<SettingsSection, IconProps['name']>> = {
  general: 'sliders',
  notifications: 'bell',
  personalization: 'personalization',
  account: 'user',
};

const mobileGroups = [
  ['general', 'display', 'personalization', 'notifications'],
  ['models', 'apps'],
  ['data', 'account'],
] as const;

function SettingsIdentity({ label, onOpen }: { label: SettingsLabel; onOpen: () => void }) {
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
      <span className="settings-identity-avatar"><Icon name="user" size={22} /></span>
      <span className="settings-identity-copy">
        <span>{user.displayName || user.email || label('访客', 'Guest')}</span>
        <span>{user.email && user.displayName ? user.email : free ? label('免费版', 'Free') : user.tierLabel}</span>
      </span>
      <ChevronRightIcon className="settings-category-chevron" aria-hidden />
    </Button>
  );
}

function MobileAppearance({
  label,
  savePreference,
}: {
  label: SettingsLabel;
  savePreference: SaveSettingsPreference;
}) {
  const appearance = useSettingsPreferencesStore((state) => state.theme);
  const title = label('颜色模式', 'Color mode');
  const modes = [
    ['light', label('浅色', 'Light')],
    ['dark', label('深色', 'Dark')],
    ['system', label('跟随系统', 'System')],
  ] as const;
  return (
    <div className="settings-index-appearance" role="group" aria-label={title}>
      <div className="settings-index-appearance-title">
        <span className="settings-category-icon">
          <Icon name="moon" size={20} />
        </span>
        {title}
      </div>
      <div className="settings-theme-options">
        {modes.map(([mode, name]) => (
          <Button
            key={mode}
            variant="ghost"
            size="surface"
            className="settings-theme-choice"
            aria-pressed={appearance === mode}
            onClick={() => {
              if (appearance === mode) return;
              settingsPreferenceActions.setTheme(mode);
              void savePreference({ theme: mode });
            }}
          >
            <span className="settings-theme-preview" data-preview={mode} aria-hidden />
            <span>{name}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function SettingsMobileSearch({
  label,
  open,
  onToggle,
}: {
  label: SettingsLabel;
  open: boolean;
  onToggle: () => void;
}) {
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
}: {
  label: SettingsLabel;
  onBack: () => void;
}) {
  return (
    <Button
      id="settingsMobileBack"
      type="button"
      variant="ghost"
      className="settings-mobile-back"
      onClick={onBack}
    >
      <ChevronLeftIcon aria-hidden />
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
}: {
  categories: SettingsCategory[];
  label: SettingsLabel;
  query: string;
  section: SettingsSection;
  mobile: boolean;
  searchOpen: boolean;
  savePreference: SaveSettingsPreference;
  onQueryChange: (query: string) => void;
  onSectionChange: (section: SettingsSection) => void;
}) {
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
    const index = current < 0 ? 0 : current;
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
    const CategoryIcon = categoryIcons[key];
    const official = officialCategoryIcons[key];
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
          {official ? <Icon name={official} size={20} /> : <CategoryIcon aria-hidden />}
        </span>
        <span className="settings-category-copy">
          <span className="settings-category-name">{name}</span>
          <span className="settings-category-description">{description}</span>
        </span>
        <ChevronRightIcon className="settings-category-chevron" aria-hidden />
      </Button>
    );
  };

  const showOverview = mobile && !query.trim();
  const groups = mobile
    ? mobileGroups.map((keys) =>
        keys.flatMap((key) => categories.filter((category) => category.key === key && (!showOverview || key !== 'account'))),
      )
    : [];

  return (
    <nav className="settings-nav" aria-label={label('设置分类', 'Settings categories')}>
      {showOverview ? <SettingsIdentity label={label} onOpen={() => onSectionChange('account')} /> : null}
      <InputGroup className={cn('settings-search shrink-0', mobile && !searchOpen && 'hidden')}>
        <InputGroupInput
          id="settingsSearchInput"
          type="search"
          placeholder={label('搜索设置', 'Search settings')}
          aria-label={label('搜索设置', 'Search settings')}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
      </InputGroup>
      <div
        className="settings-nav-categories"
        role="group"
        aria-label={label('设置类别', 'Settings categories')}
        onKeyDown={mobile ? undefined : onCategoryKeyDown}
      >
        {mobile
          ? groups.map((group, index) =>
              group.length ? (
                <div className="settings-index-group" key={mobileGroups[index][0]}>
                  {showOverview ? (
                    <p className="settings-index-group-label">
                      {[
                        label('偏好设置', 'Preferences'),
                        label('模型与服务', 'Models & services'),
                        label('数据与账户', 'Data & account'),
                      ][index]}
                    </p>
                  ) : null}
                  {showOverview && index === 0 ? (
                    <MobileAppearance label={label} savePreference={savePreference} />
                  ) : null}
                  {group.map(renderCategory)}
                </div>
              ) : null,
            )
          : categories.map(renderCategory)}
        {categories.length === 0 ? (
          <p className="settings-nav-empty" role="status">
            {label('没有匹配的设置。', 'No matching settings.')}
          </p>
        ) : null}
      </div>
    </nav>
  );
}
