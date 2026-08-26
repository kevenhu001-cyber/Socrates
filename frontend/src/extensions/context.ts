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
} from '../react/composer-input/controller';
import { startSearchProgress } from '../ui/searchProgress.js';
import type {
  AgentRunEvent,
  ComposerSurface,
  ExtensionContext,
  ExtensionOutputMode,
  SearchProgressHandle,
  TemplateChipSpec,
} from './types';
import { publishAgentRun } from './agentRunStore';

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

interface LegacyWindow {
  setActiveTemplate?: (t: {
    id: string;
    title: string;
    shortcut?: string;
    icon: string;
    systemPrompt: string;
    body?: string;
    hint?: string;
    extensionKey?: string;
    runId?: string;
    workflow?: string;
    outputMode?: ExtensionOutputMode;
  }) => void;
  clearActiveTemplate?: () => void;
  showToast?: (msg: string) => void;
  openNav?: (page: string) => void;
  openPromptTemplatesModal?: () => void;
  openAttachmentPicker?: (mode: string) => void;
  toggleWebSearch?: () => void;
  launchDeepResearch?: () => void;
  syncQuickChips?: () => void;
  fetchWebContext?: (
    query: string,
    opts?: { background?: boolean; onStep?: (ev: { kind: string; data?: Record<string, unknown> }) => void },
  ) => Promise<unknown>;
}

function w(): LegacyWindow {
  return window as unknown as LegacyWindow;
}

/** Resolve the surface a module should act on. Falls back to visible. */
function resolveSurface(surface?: ComposerSurface): ComposerSurface {
  if (surface === 'chat' || surface === 'topic') return surface;
  return getVisibleComposerSurface();
}

export function buildExtensionContext(surface: ComposerSurface): ExtensionContext {
  return {
    surface,

    setTemplate(spec: SetActiveTemplateSpec) {
      const legacy = w();
      if (typeof legacy.setActiveTemplate !== 'function') return;
      legacy.setActiveTemplate({
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
      const legacy = w();
      if (typeof legacy.clearActiveTemplate === 'function') legacy.clearActiveTemplate();
    },

    getMarkdown(s) {
      return getComposerMarkdown(resolveSurface(s));
    },

    focusComposer(s, position) {
      focusComposer(resolveSurface(s), position ?? 'end');
    },

    t(key, fallback) {
      const fn = (window as unknown as { t?: (k: string) => string }).t;
      if (typeof fn === 'function') {
        const v = fn(key);
        return v !== key ? v : fallback;
      }
      return fallback;
    },

    toast(message) {
      const legacy = w();
      if (typeof legacy.showToast === 'function') legacy.showToast(message);
    },

    startProgress(opts): SearchProgressHandle {
      return startSearchProgress(opts?.title ?? '', {
        mount: opts?.mount ?? null,
        collapsed: opts?.collapsed ?? true,
      });
    },

    publishAgentRun(event: AgentRunEvent) {
      publishAgentRun(event);
    },

    // ── legacy bridge passthroughs ──
    openNav: (page) => w().openNav?.(page),
    openPromptTemplatesModal: () => w().openPromptTemplatesModal?.(),
    openAttachmentPicker: (mode) => {
      // Legacy picker takes an element id — map surface → input id.
      w().openAttachmentPicker?.(mode === 'topic' ? 'topicAttachInput' : 'attachInput');
    },
    toggleWebSearch: () => w().toggleWebSearch?.(),
    launchDeepResearch: () => w().launchDeepResearch?.(),
    syncQuickChips: () => w().syncQuickChips?.(),
    fetchWebContext: (query, opts) => {
      const fn = w().fetchWebContext;
      if (typeof fn !== 'function') return Promise.resolve(undefined);
      return fn(query, opts);
    },
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
