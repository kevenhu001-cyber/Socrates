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
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import type { SettingsLabel, SettingsSection } from './settings.types';
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
  onQueryChange,
  onSectionChange,
}: {
  categories: SettingsCategory[];
  label: SettingsLabel;
  query: string;
  section: SettingsSection;
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
  return (
    <nav className="settings-nav" aria-label={label('设置分类', 'Settings categories')}>
      <InputGroup className="settings-search shrink-0">
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
        onKeyDown={onCategoryKeyDown}
      >
        {categories.map(({ key, name, description }) => {
          const CategoryIcon = categoryIcons[key];
          return (
            <Button
              type="button"
              variant={section === key ? 'secondary' : 'ghost'}
              key={key}
              data-section={key}
              className={cn('settings-nav-item', 'justify-start', section === key && 'active')}
              aria-current={section === key ? 'page' : undefined}
              onClick={() => onSectionChange(key)}
            >
              <span className="settings-category-icon">
                <CategoryIcon aria-hidden />
              </span>
              <span className="settings-category-copy">
                <span className="settings-category-name">{name}</span>
                <span className="settings-category-description">{description}</span>
              </span>
              <ChevronRightIcon className="settings-category-chevron" aria-hidden />
            </Button>
          );
        })}
        {categories.length === 0 ? (
          <p className="settings-nav-empty" role="status">
            {label('没有匹配的设置。', 'No matching settings.')}
          </p>
        ) : null}
      </div>
    </nav>
  );
}
