import { Input as ShadcnInput } from '../ui/shadcn/input';
import { Button } from '../ui/Button';
import type { SettingsLabel, SettingsSection } from './settings.types';

export function SettingsHeader({
  label,
  onClose,
}: {
  label: SettingsLabel;
  onClose: () => void;
}) {
  return (
    <div className="settings-header">
      <span className="settings-title" id="settingsTitle">{label('设置', 'Settings')}</span>
      <Button
        className="settings-close"
        id="settingsCloseBtn"
        aria-label={label('关闭', 'Close')}
        data-i18n-aria="common.close"
        data-initial-focus="true"
        onClick={onClose}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </Button>
    </div>
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
  categories: Array<[SettingsSection, string]>;
  label: SettingsLabel;
  query: string;
  section: SettingsSection;
  onQueryChange: (query: string) => void;
  onSectionChange: (section: SettingsSection) => void;
}) {
  return (
    <aside className="settings-nav" aria-label={label('设置分类', 'Settings categories')}>
      <ShadcnInput
        type="search"
        placeholder={label('搜索设置', 'Search settings')}
        aria-label={label('搜索设置', 'Search settings')}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {categories
        .filter(([, name]) => name.toLowerCase().includes(query.toLowerCase()))
        .map(([key, name]) => (
          <Button
            key={key}
            data-section={key}
            className={section === key ? 'active' : ''}
            aria-current={section === key ? 'page' : undefined}
            onClick={() => onSectionChange(key)}
          >{name}</Button>
        ))}
    </aside>
  );
}
