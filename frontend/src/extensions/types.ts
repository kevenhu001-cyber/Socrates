// frontend/src/extensions/types.ts
// Canonical contract for the extension subsystem.
//
// Every composer extension (write / research / explore / deepResearch /
// analyze / exam / extensiveThinking / upload / skills) is declared once
// as an ExtensionDefinition and registered in the ExtensionRegistry.
// The three consumers — the React tools menu, the legacy extensions
// picker, and the editor token chip — read the same registry so a new
// extension only needs one module file + one register() call.

export type ExtensionKind = 'template' | 'toggle' | 'action';

export type ComposerSurface = 'topic' | 'chat';

/** Menu placement + ordering. Omitted placement = not shown there. */
export interface ExtensionPlacement {
  /** Order in the React "+" tools menu. */
  tools?: number;
  /** Order in the legacy extensions picker dropdown. */
  picker?: number;
}

/** Subset of the definition that drives the active-template chip. */
export interface TemplateChipSpec {
  key: string;
  title: string;
  icon: string;
  hint: string;
}

/** Runtime handed to a module's activation/deactivation callbacks.
 *  All legacy window.* access is funneled through this context so
 *  modules stay DOM-free and unit-testable. */
export interface ExtensionContext {
  /** The composer surface the extension was activated from. */
  surface: ComposerSurface;
  /** Activate the template chip + inject systemPrompt on next send.
   *  Mirrors legacy setActiveTemplate(); merges side-effect ordering
   *  (previous extension's onDeactivate runs before this onActivate). */
  setTemplate(
    spec: TemplateChipSpec & {
      systemPrompt: string;
      body?: string;
      shortcut?: string;
      runId?: string;
      workflow?: 'explore' | 'deepResearch' | 'research' | 'analyze';
    },
  ): void;
  /** Clear the active template (no-op if none active). */
  clearTemplate(): void;
  /** Read the composer markdown of a surface. */
  getMarkdown(surface?: ComposerSurface): string;
  /** Focus the composer. */
  focusComposer(surface?: ComposerSurface, position?: 'start' | 'end'): void;
  /** i18n with a fallback. */
  t(key: string, fallback: string): string;
  /** Transient toast message. */
  toast(message: string): void;
  /** Show a structured search/agent progress log (reuses the
   *  .search-progress visual shell + step vocabulary). */
  startProgress(opts?: {
    title?: string;
    mount?: HTMLElement | null;
    collapsed?: boolean;
  }): SearchProgressHandle;
  /** Publish a workflow-stage event to the agent-run store so any
   *  subscribed UI (explore stepper / analyze workbench) can render it. */
  publishAgentRun(event: AgentRunEvent): void;

  // ── legacy bridge (optional per extension) ──────────────────────────────
  openNav?(page: string): void;
  openPromptTemplatesModal?(): void;
  openAttachmentPicker?(mode: 'topic' | 'chat'): void;
  /** Legacy web-search toggle (flips window.webSearchOn). */
  toggleWebSearch?(): void;
  /** Legacy deep-research auto-launch (reads composer, clears it, runs). */
  launchDeepResearch?(): void;
  /** Legacy quick-chip sync (reflects webSearchOn / deepResearchOn). */
  syncQuickChips?(): void;
  /** Client-side web pre-fetch; onStep feeds the search progress log. */
  fetchWebContext?(
    query: string,
    opts?: { background?: boolean; onStep?: (ev: { kind: string; data?: Record<string, unknown> }) => void },
  ): Promise<unknown>;
}

/** Handle returned by ctx.startProgress() — mirrors ui/searchProgress.js. */
export interface SearchProgressHandle {
  onStep(ev: { kind: string; data?: Record<string, unknown> }): void;
  appendStep(text: string, kind?: 'running' | 'ok' | 'warn' | 'err'): void;
  finalize(summary?: { state?: string; message?: string }): void;
  remove(): void;
}

/** Workflow-stage event published to the agent-run store. */
export interface AgentRunEvent {
  runId: string;
  workflow: 'explore' | 'deepResearch' | 'research' | 'analyze';
  stage: 'planning' | 'searching' | 'reading' | 'synthesizing' | 'completed' | 'failed';
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  current?: number;
  total?: number;
  message?: string;
  toolCallIds?: string[];
}

/** One extension's full declaration. */
export interface ExtensionDefinition {
  /** Canonical id — used by menus, token chip, side-effects, shortcuts. */
  key: string;
  kind: ExtensionKind;
  nameKey: string;
  nameFallback: string;
  descriptionKey?: string;
  descriptionFallback?: string;
  hintKey?: string;
  hintFallback?: string;
  /** Inline SVG (single source for menu + token chip). */
  icon: string;
  shortcut?: string;
  // ── template kind only ──
  systemPrompt?: string;
  body?: string;
  // ── activation/deactivation side-effects (replaces main.js EXTENSION_SIDE_EFFECTS) ──
  onActivate?: (ctx: ExtensionContext) => void;
  onDeactivate?: (ctx: ExtensionContext) => void;
  // ── behavior switches ──
  autoFocus?: boolean;
  autoLaunch?: boolean;
  placement: ExtensionPlacement;
}
