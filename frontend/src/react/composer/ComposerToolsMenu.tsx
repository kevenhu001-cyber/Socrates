import { createRoot, type Root } from 'react-dom/client';

import { t as _t } from '../legacy/gateway';
import { installComposerToolsBridge } from './composerToolsStore';
import {
  useComposerToolsDispatch,
  useComposerToolsSnapshot,
} from './legacyAdapter';
import { registry } from '../../extensions/registry';
import type { ExtensionDefinition } from '../../extensions/types';
import type { ComposerToolsAction } from './types';

const MENU_ID = 'composerToolsMenu';

type MenuItemSpec = ExtensionDefinition;

const FALLBACK_DESCRIPTIONS: Record<string, string> = {
  upload: 'Images, PDFs, notes and data',
  write: 'Draft, rewrite and polish',
  research: 'Search and compare evidence',
  explore: 'Scope, batch search, report',
  deepResearch: 'Plan, search, read, report',
  analyze: 'Calculate, chart and export',
  exam: 'Blueprint, questions and grading',
  skills: 'Create your own',
};

function toolDefinitions(): MenuItemSpec[] {
  return registry.byPlacement('tools');
}

function i18n(key: string, fallback: string): string {
  const value = _t(key);
  return value !== key ? value : fallback;
}

function MenuItem({
  spec,
  active,
  onPick,
}: {
  spec: MenuItemSpec;
  active: boolean;
  onPick: (action: ComposerToolsAction) => void;
}) {
  const label = i18n(spec.nameKey, spec.nameFallback);
  const description = spec.descriptionKey
    ? i18n(spec.descriptionKey, spec.descriptionFallback ?? FALLBACK_DESCRIPTIONS[spec.key] ?? '')
    : FALLBACK_DESCRIPTIONS[spec.key] ?? '';

  return (
    <button
      type="button"
      className={`composer-tools-item${active ? ' is-active' : ''}`}
      role="menuitem"
      data-composer-action={spec.key}
      aria-label={description ? `${label}: ${description}` : label}
      aria-keyshortcuts={spec.shortcut || undefined}
      onClick={(event) => {
        event.stopPropagation();
        onPick(spec.key as ComposerToolsAction);
      }}
    >
      <span className="composer-tools-icon" dangerouslySetInnerHTML={{ __html: spec.icon }} />
      <span className="composer-tools-copy">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
      {spec.shortcut ? <kbd>{spec.shortcut}</kbd> : null}
      {active ? <span className="composer-tools-active-dot" aria-label="Active" /> : null}
    </button>
  );
}

function MenuItems({
  activeKey,
  onPick,
}: {
  activeKey: string | null;
  onPick: (action: ComposerToolsAction) => void;
}) {
  return (
    <>
      <div className="composer-tools-heading">
        <span>Tools</span>
        <span className="composer-tools-heading-hint">Choose a workflow</span>
      </div>
      {toolDefinitions().map((spec) => (
        <MenuItem
          key={spec.key}
          spec={spec}
          active={spec.key === activeKey}
          onPick={onPick}
        />
      ))}
    </>
  );
}

function ComposerToolsMenu() {
  // Subscribe so we re-render when the legacy module publishes open/close.
  useComposerToolsSnapshot();
  const { pick } = useComposerToolsDispatch();
  const activeKey = (window as unknown as {
    _activeTemplate?: { extensionKey?: string } | null;
  })._activeTemplate?.extensionKey ?? null;

  return <MenuItems activeKey={activeKey} onPick={pick} />;
}

export interface ComposerToolsHandle {
  menu: HTMLElement;
  root: Root;
  destroy: () => void;
}

/** Hydrate the existing menu while the legacy module keeps ownership of its
 * positioning, click-outside handling, Escape handling, and open state. */
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
