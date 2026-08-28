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

const MOBILE_MENU_ITEMS: ReadonlyArray<{
  action: ComposerToolsAction;
  label: string;
  icon: string;
}> = [
  {
    action: 'camera',
    label: 'Camera',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7.5h3l1.4-2h7.2l1.4 2h3v11H4z"/><circle cx="12" cy="13" r="3.4"/></svg>',
  },
  {
    action: 'photos',
    label: 'Photos',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><circle cx="15.5" cy="9" r="1.5"/><path d="m5.5 17 4.2-4.5 3.1 3 2.1-2 3.6 3.5"/></svg>',
  },
  {
    action: 'upload',
    label: 'Files',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M8.5 12.5 14 7a3 3 0 0 1 4.2 4.2l-7 7a5 5 0 0 1-7.1-7.1l7.2-7.2"/><path d="m7.1 14 7-7"/></svg>',
  },
  {
    action: 'skills',
    label: 'Plugins',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M8.2 9.5a2.2 2.2 0 1 1 3.8-1.6v8.2a2.2 2.2 0 1 0 3.8-1.6"/><path d="m6.5 14.5 2-2 2 2M13.5 9.5l2 2 2-2"/></svg>',
  },
  {
    action: 'extensiveThinking',
    label: 'Think deeper',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4.2 16a8.5 8.5 0 0 1 15.6 0"/><path d="m12 14 3.2-4.6"/><circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none"/></svg>',
  },
];

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
    ? i18n(spec.descriptionKey, spec.descriptionFallback ?? '')
    : '';

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

function MobileMenuItem({
  action,
  label,
  icon,
  active,
  onPick,
}: (typeof MOBILE_MENU_ITEMS)[number] & {
  active: boolean;
  onPick: (action: ComposerToolsAction) => void;
}) {
  return (
    <button
      type="button"
      className={`composer-tools-item composer-tools-mobile-item${active ? ' is-active' : ''}`}
      role="menuitem"
      data-composer-action={action}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onPick(action);
      }}
    >
      <span className="composer-tools-icon" dangerouslySetInnerHTML={{ __html: icon }} />
      <span className="composer-tools-copy"><span>{label}</span></span>
      {active ? (
        <svg className="composer-tools-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
      ) : null}
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
      <div className="composer-tools-desktop-items">
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
      </div>
      <div className="composer-tools-mobile-items">
        {MOBILE_MENU_ITEMS.map((item) => (
          <MobileMenuItem
            key={item.action}
            {...item}
            active={item.action === activeKey}
            onPick={onPick}
          />
        ))}
      </div>
    </>
  );
}

function ComposerToolsMenu() {
  useComposerToolsSnapshot();
  const { pick } = useComposerToolsDispatch();
  const extensionState = window as unknown as {
    _activeTemplate?: { extensionKey?: string } | null;
    extensiveThinkingOn?: boolean;
  };
  const activeKey = extensionState._activeTemplate?.extensionKey
    ?? (extensionState.extensiveThinkingOn ? 'extensiveThinking' : null);

  return <MenuItems activeKey={activeKey} onPick={pick} />;
}

export interface ComposerToolsHandle {
  menu: HTMLElement;
  root: Root;
  destroy: () => void;
}

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
