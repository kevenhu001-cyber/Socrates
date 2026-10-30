// frontend/src/extensions/index.ts
// Extension subsystem entry point.
//
// installExtensions() imports every module (which registers its
// ExtensionDefinition) and installs thin window.* delegators so legacy inline
// handlers and the existing windowExports.js keep working with identical signatures.
//
// IMPORTANT: this module must be imported for side effects from
// windowExports.js (or main.js) so Vite keeps it in the bundle.

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
 * Thin window.* delegators — identical signatures to the legacy
 * hardcoded actions so external inline handlers never break.
 * Installed after all modules are registered.
 */
/**
 * Public dispatch helper for legacy entry points (extensions picker,
 * composer tools). Toggle-kind extensions deactivate when already
 * active; template/action kinds always activate. Returns true if a
 * registered module handled the key.
 */
export function dispatchExtension(key: string): boolean {
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

export function installWindowExtensionDelegates(): void {
  installExtensions();

  const w = window as unknown as {
    composeAction?: () => void;
    researchAction?: () => void;
    exploreAction?: () => void;
    deepResearchAction?: () => void;
    analyzeAction?: () => void;
    toggleExtensionByKey?: (key: string) => void;
    __socratesExtensionDispatch?: (key: string) => boolean;
  };

  if (!w.composeAction) w.composeAction = composeAction;
  if (!w.researchAction) w.researchAction = researchAction;
  if (!w.exploreAction) w.exploreAction = exploreAction;
  if (!w.deepResearchAction) w.deepResearchAction = deepResearchAction;
  if (!w.analyzeAction) w.analyzeAction = analyzeAction;
  if (!w.toggleExtensionByKey) {
    w.toggleExtensionByKey = (key: string) => {
      dispatchExtension(key);
    };
  }
  w.__socratesExtensionDispatch = dispatchExtension;
}

function createContextForKey() {
  return buildExtensionContext(getVisibleComposerSurface());
}

export { registry };
