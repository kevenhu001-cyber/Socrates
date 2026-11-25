import { Icon } from '../../../legacy/Icon';
import { t as _t } from '../../../ui/legacyI18n.ts';

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
  let rel;
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

function PlusIcon() {
  return <Icon name="plus" size={20} />;
}

function FilterIcon() {
  return <Icon name="sliders" size={18} />;
}

function ChevronDownIcon() {
  return <Icon name="chevronDown" size={14} />;
}

const PLUGIN_DIRECTORY_PRIORITY = [
  'gmail',
  'health',
  'googledrive',
  'github',
  'supabase',
  'googlecalendar',
  'notion',
];
const INSTALLED_DISPLAY_PRIORITY = [
  'calendar',
  'browser',
  'window',
  'palette',
  'zapier',
  'chart',
  'thumbsup',
  'github',
  'workflow',
  'microsoft',
  'vercel',
];

function pluginDirectoryRank(id: string): number {
  const normalized = id
    .toLowerCase()
    .replace(/^oc/, '')
    .replace(/[^a-z0-9]/g, '');
  const rank = PLUGIN_DIRECTORY_PRIORITY.indexOf(normalized);
  return rank < 0 ? PLUGIN_DIRECTORY_PRIORITY.length : rank;
}

function installedRank(id: string): number {
  const normalized = id
    .toLowerCase()
    .replace(/^oc/, '')
    .replace(/[^a-z0-9]/g, '');
  const rank = INSTALLED_DISPLAY_PRIORITY.indexOf(normalized);
  return rank < 0 ? INSTALLED_DISPLAY_PRIORITY.length : rank;
}

function MoreIcon() {
  return <Icon name="more" size={20} />;
}

function projectMeta(project: {
  description?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  created_at?: string | number;
  updated_at?: string | number;
}): string {
  const rawDate =
    project.updatedAt || project.updated_at || project.createdAt || project.created_at;
  if (rawDate) {
    const date = new Date(rawDate);
    if (!Number.isNaN(date.getTime())) {
      const locale = document.documentElement.lang.toLowerCase().startsWith('zh')
        ? 'zh-CN'
        : 'en-US';
      return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
    }
  }
  return project.description || '';
}

/* ------------------------------------------------------------------ */
/*  Plugins sub-component                                              */
/* ------------------------------------------------------------------ */

export {
  i18n,
  fileSize,
  libraryDate,
  PlusIcon,
  FilterIcon,
  ChevronDownIcon,
  MoreIcon,
  pluginDirectoryRank,
  installedRank,
  projectMeta,
};
