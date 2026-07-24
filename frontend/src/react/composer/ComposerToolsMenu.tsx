import { hydrateRoot, type Root } from 'react-dom/client';

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
const SPARK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></svg>';
const SKILLS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><path d="M17 14v6M14 17h6"/></svg>';

const ITEMS: MenuItemSpec[] = [
  { action: 'upload', labelKey: 'composer.menu.upload', labelFallback: 'Upload files', icon: UPLOAD_ICON },
  { action: 'write', labelKey: 'composer.write', labelFallback: 'Write or edit', icon: PEN_ICON },
  { action: 'research', labelKey: 'composer.research', labelFallback: 'Find resources', icon: SEARCH_ICON },
  { action: 'deepResearch', labelKey: 'composer.deepResearch', labelFallback: 'Deep Research', icon: SPARK_ICON },
  { action: 'exam', labelKey: 'composer.exam', labelFallback: 'Generate exam', icon: SPARK_ICON },
  { action: 'skills', labelKey: 'composer.menu.skills', labelFallback: 'Skills & shortcuts', descriptionKey: 'composer.menu.skillsHint', descriptionFallback: 'Create your own', icon: SKILLS_ICON },
];

function i18n(key: string, fallback: string): string {
  try {
    if (typeof window.t === 'function') {
      const v = window.t(key);
      if (typeof v === 'string' && v !== key) return v;
    }
  } catch (_) { /* fall through */ }
  return fallback;
}

function MenuItem({ spec, onPick }: { spec: MenuItemSpec; onPick: (action: ComposerToolsAction) => void }) {
  const label = i18n(spec.labelKey, spec.labelFallback);
  const description = spec.descriptionKey ? i18n(spec.descriptionKey, spec.descriptionFallback ?? '') : '';
  return (
    <button
      type="button"
      className="composer-tools-item"
      role="menuitem"
      data-action={spec.action}
      onClick={() => onPick(spec.action)}
    >
      <span className="composer-tools-icon" dangerouslySetInnerHTML={{ __html: spec.icon }} />
      <span className="composer-tools-copy">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
    </button>
  );
}

function MenuItems({ onPick }: { onPick: (action: ComposerToolsAction) => void }) {
  /* Mirror the legacy render order so existing tests + CSS keep working:
     upload | write | research | deepResearch | exam | skills — with two
     dividers (after upload, before skills). */
  return (
    <>
      <MenuItem spec={ITEMS[0]} onPick={onPick} />
      <div className="composer-tools-divider" />
      <MenuItem spec={ITEMS[1]} onPick={onPick} />
      <MenuItem spec={ITEMS[2]} onPick={onPick} />
      <MenuItem spec={ITEMS[3]} onPick={onPick} />
      <MenuItem spec={ITEMS[4]} onPick={onPick} />
      <div className="composer-tools-divider" />
      <MenuItem spec={ITEMS[5]} onPick={onPick} />
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

  const root = hydrateRoot(menu, <ComposerToolsMenu />);
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