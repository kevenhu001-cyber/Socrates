import { createRoot, type Root } from 'react-dom/client';

import { t as _t } from '../legacy/gateway';
import {
  installComposerToolsBridge,
} from './composerToolsStore';
import {
  useComposerToolsDispatch,
  useComposerToolsSnapshot,
} from './legacyAdapter';
import type { ComposerToolsAction } from './types';

const MENU_ID = 'composerToolsMenu';

interface MenuItemSpec {
  action: ComposerToolsAction;
  labelKey: string;
  labelFallback: string;
  descriptionKey?: string;
  descriptionFallback?: string;
  icon: string;
}

const UPLOAD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>';
const PEN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>';
/* Deep research: a telescope — long-range, deliberate investigation. The
   old four-point "sparkle" star is retired across the product. */
const TELESCOPE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44"/><path d="m13.56 11.747 4.332-.924"/><path d="m16 21-3.105-6.21"/><path d="M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z"/><path d="m6.158 8.633 1.114 4.456"/><path d="m8 21 3.105-6.21"/><circle cx="12" cy="13" r="2"/></svg>';
/* Explore: a compass — staged scope→search→integrate→deliver workflow. */
const EXPLORE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>';
const ANALYZE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m4 7 6-4 6 7 5-4"/></svg>';
const EXAM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M4 3h16v18H4z"/><path d="M8 8h8M8 12h5M8 16h3"/><path d="m15 15 1.5 1.5L20 13"/></svg>';
const SKILLS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><path d="M17 14v6M14 17h6"/></svg>';

const ITEMS: MenuItemSpec[] = [
  { action: 'upload', labelKey: 'composer.menu.upload', labelFallback: 'Add files', descriptionKey: 'composer.menu.uploadHint', descriptionFallback: 'Images, PDFs, notes and data', icon: UPLOAD_ICON },
  { action: 'write', labelKey: 'composer.write', labelFallback: 'Write & edit', descriptionKey: 'composer.writeHint', descriptionFallback: 'Draft, rewrite and polish', icon: PEN_ICON },
  { action: 'research', labelKey: 'composer.research', labelFallback: 'Find sources', descriptionKey: 'composer.researchHint', descriptionFallback: 'Search and compare evidence', icon: SEARCH_ICON },
  { action: 'explore', labelKey: 'composer.explore', labelFallback: 'Explore', descriptionKey: 'composer.exploreHint', descriptionFallback: 'Scope, batch search, report', icon: EXPLORE_ICON },
  { action: 'deepResearch', labelKey: 'composer.deepResearch', labelFallback: 'Deep research', descriptionKey: 'composer.deepResearchHint', descriptionFallback: 'Plan, search, read, report', icon: TELESCOPE_ICON },
  { action: 'analyze', labelKey: 'composer.analyze', labelFallback: 'Analyze data', descriptionKey: 'composer.analyzeHint', descriptionFallback: 'Calculate, chart and export', icon: ANALYZE_ICON },
  { action: 'exam', labelKey: 'composer.exam', labelFallback: 'Create an exam', descriptionKey: 'composer.examHint', descriptionFallback: 'Blueprint, questions and grading', icon: EXAM_ICON },
  { action: 'skills', labelKey: 'composer.menu.skills', labelFallback: 'Your workflows', descriptionKey: 'composer.menu.skillsHint', descriptionFallback: 'Create your own', icon: SKILLS_ICON },
];

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v !== key ? v : fallback;
}

function MenuItem({ spec, onPick }: { spec: MenuItemSpec; onPick: (action: ComposerToolsAction) => void }) {
  const label = i18n(spec.labelKey, spec.labelFallback);
  const description = spec.descriptionKey ? i18n(spec.descriptionKey, spec.descriptionFallback ?? '') : '';
  return (
    <button
      type="button"
      className="composer-tools-item"
      role="menuitem"
      data-composer-action={spec.action}
      onClick={(event) => {
        event.stopPropagation();
        onPick(spec.action);
      }}
    >
      <span className="composer-tools-icon" dangerouslySetInnerHTML={{ __html: spec.icon }} />
      <span className="composer-tools-copy">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
    </button>
  );
}

/* ChatGPT-style minimal list: one icon + one label per row, no headings,
   section labels or per-item descriptions — the labels carry the meaning
   and the reduced chrome keeps the menu scannable at a glance. */
function MenuItems({ onPick }: { onPick: (action: ComposerToolsAction) => void }) {
  return (
    <>
      {ITEMS.map((spec) => (
        <MenuItem key={spec.action} spec={spec} onPick={onPick} />
      ))}
    </>
  );
}

function ComposerToolsMenu() {
  // Subscribe so we re-render when the legacy module publishes open/close.
  useComposerToolsSnapshot();
  const { pick } = useComposerToolsDispatch();

  return (
    <>
      <MenuItems onPick={pick} />
    </>
  );
}

export interface ComposerToolsHandle {
  menu: HTMLElement;
  root: Root;
  destroy: () => void;
}

/**
 * Hydrate the existing `#composerToolsMenu` element with React. Idempotent.
 * The element is pre-created on module load by `ui/composerTools.js`, so
 * React can mount eagerly. The element's classes, id, and role are owned
 * by the legacy module — React renders only the children (the 6 menu items
 * + dividers). The legacy click-outside / Escape / resize listeners in
 * `composerTools.js` still fire and still close the menu.
 */
export function hydrateComposerToolsMenu(): ComposerToolsHandle | null {
  const menu = document.getElementById(MENU_ID);
  if (!menu) return null;
  if (menu.dataset.composerToolsReactHydrated === '1') {
    throw new Error('Composer tools menu React runtime was initialized more than once.');
  }
  menu.dataset.composerToolsReactHydrated = '1';
  menu.setAttribute('data-react-migration-runtime', 'composer-tools-menu');

  installComposerToolsBridge();

  const root = createRoot(menu);
  root.render(<ComposerToolsMenu />);
  return {
    menu,
    root,
    destroy: () => {
      root.unmount();
      delete menu.dataset.composerToolsReactHydrated;
      menu.removeAttribute('data-react-migration-runtime');
    },
  };
}
