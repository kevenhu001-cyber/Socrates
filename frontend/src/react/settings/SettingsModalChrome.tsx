import type { SettingsLabel } from './settings.types';

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
      <button
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
      </button>
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
  categories: Array<[string, string]>;
  label: SettingsLabel;
  query: string;
  section: string;
  onQueryChange: (query: string) => void;
  onSectionChange: (section: string) => void;
}) {
  return (
    <aside className="settings-nav" aria-label={label('设置分类', 'Settings categories')}>
      <input
        type="search"
        placeholder={label('搜索设置', 'Search settings')}
        aria-label={label('搜索设置', 'Search settings')}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {categories
        .filter(([, name]) => name.toLowerCase().includes(query.toLowerCase()))
        .map(([key, name]) => (
          <button
            key={key}
            data-section={key}
            className={section === key ? 'active' : ''}
            onClick={() => onSectionChange(key)}
          >{name}</button>
        ))}
    </aside>
  );
}
