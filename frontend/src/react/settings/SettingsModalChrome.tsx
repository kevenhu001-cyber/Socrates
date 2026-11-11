import { InputGroup, InputGroupInput, InputGroupAddon } from '../ui/shadcn/input-group';
import { Button } from '../ui/shadcn/button';
import { DialogHeader, DialogTitle, DialogClose } from '../ui/shadcn/dialog';
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
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import type { SettingsLabel, SettingsSection } from './settings.types';
import type { SettingsCategory } from './useSettingsNavigation';

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

export function SettingsHeader({
  label,
}: {
  label: SettingsLabel;
}) {
  return (
    <DialogHeader className="settings-header flex-row items-center justify-between">
      <DialogTitle id="settingsTitle" className="settings-title">{label('设置', 'Settings')}</DialogTitle>
      <DialogClose render={
        <Button
          variant="ghost" size="icon"
          id="settingsCloseBtn"
          aria-label={label('关闭', 'Close')}
          data-i18n-aria="common.close"
          data-initial-focus="true"
        />
      }>
        <XIcon data-icon="inline-start" aria-hidden />
      </DialogClose>
    </DialogHeader>
  );
}

export function SettingsMobileBack({ label, onBack }: { label: SettingsLabel; onBack: () => void }) {
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
  return (
    <aside className="settings-nav" aria-label={label('设置分类', 'Settings categories')}>
      <InputGroup className="settings-search shrink-0">
        <InputGroupInput
          id="settingsSearchInput"
          type="search"
          placeholder={label('搜索设置', 'Search settings')}
          aria-label={label('搜索设置', 'Search settings')}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <InputGroupAddon><SearchIcon aria-hidden /></InputGroupAddon>
      </InputGroup>
      <div className="settings-nav-categories" role="group" aria-label={label('设置类别', 'Settings categories')}>
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
              <span className="settings-category-icon"><CategoryIcon aria-hidden /></span>
              <span className="settings-category-copy">
                <span className="settings-category-name">{name}</span>
                <span className="settings-category-description">{description}</span>
              </span>
              <ChevronRightIcon className="settings-category-chevron" aria-hidden />
            </Button>
          );
        })}
        {categories.length === 0
          ? <p className="settings-nav-empty" role="status">{label('没有匹配的设置。', 'No matching settings.')}</p>
          : null}
      </div>
    </aside>
  );
}
