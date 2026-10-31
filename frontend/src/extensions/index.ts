// frontend/src/extensions/index.ts
// Extension subsystem entry point.
//
// installExtensions() imports every module (which registers its
// ExtensionDefinition); feature actions dispatch through typed imports.
//
// Import this module from the startup composition or a feature action.

import { registry } from './registry';
import { buildExtensionContext } from './context';
import { getVisibleComposerSurface } from '../composer/controller.ts';

import { writeExtension } from './modules/write';
import { exploreExtension } from './modules/explore';
import { analyzeExtension } from './modules/analyze';
import { examExtension } from './modules/exam';
import { extensiveThinkingExtension } from './modules/extensiveThinking';
import { uploadExtension } from './modules/upload';
import { webSearchExtension } from './modules/webSearch';
import { deepResearchExtension } from './modules/deepResearch';
import { skillsExtension } from './modules/skills';
import { createImageExtension } from './modules/createImage';
import { createSiteExtension } from './modules/createSite';

let installed = false;

/**
 * Register all extension modules.
 * Idempotent — safe to call from multiple import sites.
 */
export function installExtensions(): void {
  if (installed) return;
  installed = true;

  registry
    .register(writeExtension)
    .register(exploreExtension)
    .register(analyzeExtension)
    .register(examExtension)
    .register(extensiveThinkingExtension)
    .register(uploadExtension)
    .register(webSearchExtension)
    .register(deepResearchExtension)
    .register(skillsExtension)
    .register(createImageExtension)
    .register(createSiteExtension);
}

/**
 * Public dispatch helper for legacy entry points (extensions picker,
 * composer tools). Toggle-kind extensions deactivate when already
 * active; template/action kinds always activate. Returns true if a
 * registered module handled the key.
 */
export function dispatchExtension(key: string): boolean {
  installExtensions();
  const def = registry.get(key);
  if (!def || typeof def.onActivate !== 'function') return false;
  const ctx = createContextForKey();
  const activeKey = (window as unknown as { _activeTemplate?: { extensionKey?: string } | null })
    ._activeTemplate?.extensionKey;
  if (def.kind === 'toggle' && activeKey === key) {
    def.onDeactivate?.(ctx);
  } else {
    def.onActivate(ctx);
  }
  return true;
}

export function composeAction(): void { dispatchExtension('write'); }
export function researchAction(): void { dispatchExtension('webSearch'); }
export function exploreAction(): void { dispatchExtension('explore'); }
export function deepResearchAction(): void { dispatchExtension('deepResearch'); }
export function analyzeAction(): void { dispatchExtension('analyze'); }

function createContextForKey() {
  return buildExtensionContext(getVisibleComposerSurface());
}

export { registry };
