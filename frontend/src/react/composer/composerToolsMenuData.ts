import {
  t as _t,
} from '../legacy/gateway.ts';
import { registry } from '../../extensions/registry';
import { extensiveThinkingExtension } from '../../extensions/modules/extensiveThinking';
import type { ExtensionDefinition } from '../../extensions/types';

export type MenuItemSpec = ExtensionDefinition;

const MOBILE_MENU_ICON_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

export const MOBILE_MENU_ITEMS: ReadonlyArray<{
  action: 'camera' | 'photos';
  labelKey: string;
  label: string;
  icon: string;
}> = [
  {
    action: 'camera',
    labelKey: 'composer.tools.camera',
    label: 'Camera',
    icon: MOBILE_MENU_ICON_OPEN + '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  },
  {
    action: 'photos',
    labelKey: 'composer.tools.photos',
    label: 'Photos',
    icon: MOBILE_MENU_ICON_OPEN + '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  },
];

export const TOOL_GROUPS: ReadonlyArray<{
  key: string;
  labelKey: string;
  label: string;
  actions: ReadonlyArray<string>;
}> = [
  {
    key: 'context',
    labelKey: 'composer.tools.group.context',
    label: 'Add context',
    actions: ['upload'],
  },
  {
    key: 'research',
    labelKey: 'composer.tools.group.research',
    label: 'Search & research',
    actions: ['webSearch', 'explore', 'deepResearch'],
  },
  {
    key: 'create',
    labelKey: 'composer.tools.group.create',
    label: 'Create & analyze',
    actions: ['write', 'analyze', 'createImage', 'createSite', 'exam', 'skills'],
  },
];

/* The phone sheet keeps camera, photos, files, image creation, and search
   ahead of longer workflows. The desktop twin retains all group labels. */
export const MOBILE_GROUP_ORDER: ReadonlyArray<{
  key: string;
  labelKey: string;
  label: string;
  actions: ReadonlyArray<string>;
}> = [
  {
    key: 'context',
    labelKey: 'composer.tools.group.context',
    label: 'Add context',
    actions: ['upload'],
  },
  {
    key: 'create',
    labelKey: 'composer.tools.group.create',
    label: 'Create & analyze',
    actions: ['createImage'],
  },
  {
    key: 'research',
    labelKey: 'composer.tools.group.research',
    label: 'Search & research',
    actions: ['webSearch', 'explore', 'deepResearch'],
  },
  {
    key: 'workflows',
    labelKey: 'composer.tools.group.create',
    label: 'Create & analyze',
    actions: ['write', 'analyze', 'createSite', 'exam', 'skills'],
  },
];

export const MOBILE_THINKING_SPEC: MenuItemSpec = {
  ...extensiveThinkingExtension,
  nameKey: 'composer.tools.thinkDeeper',
  nameFallback: 'Think deeper',
};

export function toolDefinitions(): MenuItemSpec[] {
  return registry.byPlacement('tools');
}

export function i18n(key: string, fallback: string): string {
  const value = _t(key);
  return value !== key ? value : fallback;
}

export function menuCopy(spec: MenuItemSpec): { label: string; description: string } {
  const label = i18n(spec.nameKey, spec.nameFallback);
  const description = spec.descriptionKey
    ? i18n(spec.descriptionKey, spec.descriptionFallback ?? '')
    : '';
  return { label, description };
}
