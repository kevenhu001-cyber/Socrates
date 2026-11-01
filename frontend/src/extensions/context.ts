// frontend/src/extensions/context.ts
// Builds the ExtensionContext handed to each extension module's
// onActivate/onDeactivate callbacks. All legacy window.* access is
// funneled through this single adapter so modules stay DOM-free and
// unit-testable. Side-effect ordering (previous extension's
// onDeactivate before next onActivate) is coordinated here via the
// legacy setActiveTemplate — which already runs
// EXTENSION_SIDE_EFFECTS — so modules only declare their own
// onActivate/onDeactivate for non-template side-effects (e.g. the
// webSearch toggle lives in EXTENSION_SIDE_EFFECTS keyed "webSearch",
// so template extensions that must open web search set extensionKey
// "webSearch" and let the legacy pipeline flip the flag).

import {
  focusComposer,
  getComposerMarkdown,
  getVisibleComposerSurface,
  setComposerExtensionToken,
} from '../composer/controller.ts';
import type {
  AgentRunEvent,
  ComposerSurface,
  ExtensionContext,
  ExtensionOutputMode,
  TemplateChipSpec,
} from './types';
import { publishAgentRun } from './agentRunStore';
import { toggleWebSearch } from '../chat/webSearchToggle.ts';
import { openNav } from '../sidebar/navigation.service.ts';
import { setActiveTemplate, clearActiveTemplate } from '../chat/templateSlash.ts';
import { showToast } from '../ui/toast.ts';
import { openPromptTemplatesModal } from '../ui/promptTemplates.ts';
import { openAttachmentPicker } from '../attachments/render.ts';
import { t } from '../i18n.ts';

type SetActiveTemplateSpec = TemplateChipSpec & {
  systemPrompt: string;
  body?: string;
  shortcut?: string;
  /** Optional run context carried onto the legacy _activeTemplate so the
   *  chat pipeline can publish searching/completed against the same runId
   *  the module used for its planning event. Absent for plain templates. */
  runId?: string;
  workflow?: 'explore' | 'deepResearch' | 'research' | 'analyze' | 'agent';
  /** Output rendering mode carried onto _activeTemplate so renderAssistantHTML
   *  can wrap the assistant's reply in a .canvas-block when this is 'canvas'. */
  outputMode?: ExtensionOutputMode;
};

/** Resolve the surface a module should act on. Falls back to visible. */
function resolveSurface(surface?: ComposerSurface): ComposerSurface {
  if (surface === 'chat' || surface === 'topic') return surface;
  return getVisibleComposerSurface();
}

export function buildExtensionContext(surface: ComposerSurface): ExtensionContext {
  return {
    surface,

    setTemplate(spec: SetActiveTemplateSpec) {
      setActiveTemplate({
        id: `tpl-${spec.key}`,
        title: spec.title,
        shortcut: spec.shortcut,
        icon: spec.icon,
        systemPrompt: spec.systemPrompt,
        body: spec.body ?? '',
        hint: spec.hint,
        extensionKey: spec.key,
        runId: spec.runId,
        workflow: spec.workflow,
        outputMode: spec.outputMode,
      });
    },

    clearTemplate() {
      clearActiveTemplate();
    },

    getMarkdown(s) {
      return getComposerMarkdown(resolveSurface(s));
    },

    focusComposer(s, position) {
      focusComposer(resolveSurface(s), position ?? 'end');
    },

    t(key, fallback) {
      const v = t(key);
      return v !== key ? v : fallback;
    },

    toast(message) {
      showToast(message);
    },

    publishAgentRun(event: AgentRunEvent) {
      publishAgentRun(event);
    },

    // ── legacy bridge passthroughs ──
    openNav: (page) => openNav(page),
    openPromptTemplatesModal: () => openPromptTemplatesModal(),
    openAttachmentPicker: (_mode) => {
      // Legacy picker takes an element id — one composer, one input.
      openAttachmentPicker('composerAttachInput');
    },
    toggleWebSearch: () => toggleWebSearch(),
  };
}

// Re-exported so modules that need the token chip directly can use it
// without reaching into react internals.
export function setExtensionTokenOnSurface(
  surface: ComposerSurface,
  token: TemplateChipSpec | null,
): void {
  setComposerExtensionToken(surface, token);
}
