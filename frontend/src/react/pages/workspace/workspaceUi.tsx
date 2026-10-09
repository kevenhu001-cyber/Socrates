import { ListFilter } from 'lucide-react';
import { t as _t } from '../../legacy/gateway.ts';

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v !== key ? v : fallback;
}

function fileSize(item: { size?: number }): string {
  const size = Number(item.size || 0);
  return size
    ? size < 1024 * 1024
      ? Math.max(1, Math.round(size / 1024)) + ' KB'
      : (size / (1024 * 1024)).toFixed(1) + ' MB'
    : i18n('library.metaCreated', 'Created');
}

function libraryDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const isZh = document.documentElement.lang.toLowerCase().startsWith('zh');
  const locale = isZh ? 'zh-CN' : 'en-US';
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const elapsedDays = Math.floor(diffMs / (24 * 3600000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  let rel = '';
  if (elapsedDays >= 7) {
    rel = rtf.format(-Math.floor(elapsedDays / 7), 'week');
  } else if (elapsedDays >= 1) {
    rel = rtf.format(-elapsedDays, 'day');
  } else {
    const elapsedHours = Math.max(1, Math.round(diffMs / 3600000));
    rel = rtf.format(-elapsedHours, 'hour');
  }
  return isZh ? `修改于 ${rel}` : `Modified ${rel}`;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function FilterIcon() { return <ListFilter aria-hidden="true" width={18} height={18} />; }

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="18" height="18">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="18" height="18">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="18" height="18">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="14" height="14">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

const PLUGIN_DIRECTORY_PRIORITY = ['gmail', 'health', 'googledrive', 'github', 'supabase', 'googlecalendar', 'notion'];
const INSTALLED_DISPLAY_PRIORITY = ['calendar', 'browser', 'window', 'palette', 'zapier', 'chart', 'thumbsup', 'github', 'workflow', 'microsoft', 'vercel'];

function pluginDirectoryRank(id: string): number {
  const normalized = id.toLowerCase().replace(/^oc/, '').replace(/[^a-z0-9]/g, '');
  const rank = PLUGIN_DIRECTORY_PRIORITY.indexOf(normalized);
  return rank < 0 ? PLUGIN_DIRECTORY_PRIORITY.length : rank;
}

function installedRank(id: string): number {
  const normalized = id.toLowerCase().replace(/^oc/, '').replace(/[^a-z0-9]/g, '');
  const rank = INSTALLED_DISPLAY_PRIORITY.indexOf(normalized);
  return rank < 0 ? INSTALLED_DISPLAY_PRIORITY.length : rank;
}

function MoreIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
}

function projectMeta(project: { description?: string; createdAt?: string | number; updatedAt?: string | number; created_at?: string | number; updated_at?: string | number }): string {
  const rawDate = project.updatedAt || project.updated_at || project.createdAt || project.created_at;
  if (rawDate) {
    const date = new Date(rawDate);
    if (!Number.isNaN(date.getTime())) {
      const locale = document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
      return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
    }
  }
  return project.description || '';
}

function WorkspacePageHeader({ title, description, query, onQuery, actionLabel, onAction, compactAction }: {
  title: string; description: string; query: string; onQuery: (value: string) => void; actionLabel: string; onAction: () => void; compactAction?: boolean;
}) {
  const searchLabel = i18n('projects.search', i18n('common.search', 'Search'));
  return (
    <div className="workspace-page-head">
      <div><h1 id="projects-directory-title">{title}</h1><p>{description}</p></div>
      <div className="workspace-head-actions">
        <label className="workspace-search-field"><SearchIcon /><input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={searchLabel} aria-label={searchLabel} /></label>
        <button type="button" className={'workspace-create-button' + (compactAction ? ' projects-create-button' : '')} onClick={onAction}>{compactAction ? null : <PlusIcon />}<span>{actionLabel}</span></button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Plugins sub-component                                              */
/* ------------------------------------------------------------------ */

export { i18n, fileSize, libraryDate, SearchIcon, PlusIcon, FilterIcon, GridIcon, ListIcon, GearIcon, ChevronDownIcon, MoreIcon, pluginDirectoryRank, installedRank, projectMeta, WorkspacePageHeader };
