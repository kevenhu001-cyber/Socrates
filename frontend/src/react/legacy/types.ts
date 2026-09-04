// frontend/src/react/legacy/types.ts
// Typed interface for all legacy system actions invoked by React components.
//
// Every function here is backed by a legacy JS module (main.js, ui/*.js, etc.)
// and published via window.__socratesLegacy. React code never reads window.X
// directly — it always goes through getLegacyActions() from gateway.ts.
//
// Each domain should be migrated out of this file as its functions are
// extracted into standalone TypeScript modules (C5).

export interface LegacyMessages {
  editUserMessage(messageId: string): void;
  regenerateAssistantMessage(messageId: string): void;
  deleteUserMessage(messageId: string): Promise<void> | void;
  branchFromMessage(messageId: string, options?: { reExplain?: boolean }): Promise<void> | void;
  sendFeedback(messageId: string, value: 'up' | 'down'): void;
  toggleReadAloud(element: HTMLElement, text: string): void;
  openShareModal(): void;
  showToast?(message: string): void;
}

export interface LegacyNavigation {
  resetApp(): void;
  toggleSidebar(): void;
  openNav(key: string): void;
  openSettings(): void;
  closeSettings(): void;
  openProfile(): void;
  closeProfile(): void;
  openUsageModal(): void;
  closeUsageModal(): void;
  openStorageModal(): void;
  closeStorageModal(): void;
  openPromptTemplatesModal(): void;
  closePromptTemplatesModal(): void;
  openCheatsheet(): void;
  closeCheatsheet(): void;
  closeMorePopover(): void;
  toggleDisplayPrefs(): void;
  signOut(): void;
}

/* M4 step 4.5b — settings modal button actions, called from React's
   SettingsModal.tsx (which owns the overlay skeleton). Backed by
   ui/settings.js exports. */
export interface LegacySettings {
  toggleAPI(): void;
  addProvider(): void;
  clearSettings(): void;
  saveSettings(): void;
}

/* M4 step 4.5c — confirm-dialog actions, called from React's
   ConfirmDialog.tsx (which owns the overlay skeleton). Backed by
   ui/confirm.js exports. */
export interface LegacyConfirm {
  closeConfirm(resolveWith?: boolean): void;
}

export interface LegacySessions {
  loadSession(sessionId: string): Promise<void> | void;
  setRecentsFilter(filter: string | null): void;
  getRecentsFilter?(): string | null;
  setRecentsSearch(query: string): void;
  retryRecentsFetch(): void;
  clearRecentsFilter(): void;
  onRecentsFilterChipClick(value: string): void;
  openTagEditor(sessionId: string, event?: Event): void;
  deleteSession(sessionId: string, event?: Event): Promise<void> | void;
  onSessionDragStart(event: Event, sessionId: string): void;
  onSessionDragEnd(event: Event): void;
  restoreSession(sessionId: string): Promise<void> | void;
  confirmPurgeSession(sessionId: string): Promise<void> | void;
}

export interface LegacyComposer {
  openAttachmentPicker(mode: string): void;
  composeAction(): void;
  researchAction(): void;
  deepResearchAction(): void;
  analyzeAction(): void;
  toggleExtensionByKey(key: string): void;
  removeAttachment(id: string): void;
  renderAttachmentChips?(): void;
  startSession(): Promise<void> | void;
  submitChatMessage(): Promise<void> | void;
  stopChatResponse(): void;
}

export interface LegacyCmdK {
  openCmdK(): void;
  closeCmdK(): void;
  onCmdKInput(value: string): void;
  onCmdKKey(event: KeyboardEvent): void;
  openCmdKResult(index: number): void;
}

export interface LegacyShare {
  selectShareVis(vis: string): void;
  createShareLink(): void;
  copyShareLink(): void;
  revokeShareLink(): void;
  closeShareModal(): void;
}

export interface LegacyProfile {
  saveProfileName(name: string): void;
  onCustomInstructionsChange(): void;
  toggleProfileWebSearch(): void;
  confirmClearCache(): void;
  confirmClearSettings(): void;
  confirmDeleteAccount(): void;
  setLang(lang: string): void;
}

export interface LegacyWorkspace {
  switchLibraryTab(tab: string): void;
  filterLibrary(query: string): void;
  openLibraryItem(id: string, kind: string, collection?: string): void;
  toggleLibrarySelect(id: string, checked: boolean): void;
  toggleSelectAllLibrary(checked: boolean): void;
  deleteSelectedLibrary(): void;
  startLibraryRename(id: string, key: string): void;
  cancelLibraryRename(): void;
  saveLibraryRename(input: HTMLInputElement): void;
  deleteLibraryFile(id: string): void;
  renameArtifact(id: string): void;
  openCreateProject(): void;
  openEditProject(id: string): void;
  openProjectWorkspace(id: string): void;
  connectProjectConnector(id: string): void;
  refreshProjectConnector(id: string): void;
  openProjectConnectorForm(id: string): void;
  toggleCodexMcp(key: string, enabled: boolean): Promise<void> | void;
  checkCodexMcpHealth(key: string): Promise<void> | void;
  openArxivSearch(): void;
  openZoteroLibrary(): void;
}

export interface LegacyScheduled {
  openCreateScheduledTask(): void;
  openEditScheduledTask(id: string): void;
  toggleScheduledTask(id: string, pause: boolean): void;
  runScheduledTask(id: string): void;
  deleteScheduledTask(id: string): void;
}

export interface LegacyPostRender {
  processPendingMermaid(root?: HTMLElement): void;
  processPendingViz?(root?: HTMLElement): void;
  processPendingVizActions(root?: HTMLElement): void;
  wireCodeBlockHeaders(root: HTMLElement): void;
  wireMsgBodyImages(root: HTMLElement): void;
  restorePersistedMessageExtras?(
    root: HTMLElement,
    message: Record<string, unknown>,
    idPrefix?: string,
  ): void;
  /**
   * Tool outputs that are not text: the v1 chart spec a call produced and any
   * saved files attached to it. Both mounters dedup by id in the DOM, so the
   * declarative renderer (react/tool-run) and the history-recovery pass above
   * can hand the same host div to both without ever drawing a card twice.
   */
  mountVisualization?(
    spec: Record<string, unknown>,
    host: HTMLElement,
    options?: { toolCallId?: string },
  ): unknown;
  appendInlineArtifact?(
    fileId: string,
    mimeType?: string,
    outEl?: HTMLElement | null,
    displayName?: string,
  ): void;
}

/**
 * Legacy markdown rendering, kept in legacy because it registers the
 * viz/mermaid placeholders that `postRender` later fills in. The React tool
 * renderer (react/tool-run) uses it per prose segment so answer text keeps
 * its existing formatting while tool rows come from structured data.
 */
export interface LegacyRender {
  renderAssistantHTML(rawText: string): string;
  /**
   * Streaming-safe variant: tolerates an unclosed fence, formula, or scaffold
   * tag, so a partially-arrived answer renders as markdown instead of raw
   * LaTeX. Used for a turn that is still in flight; the settled string still
   * goes through `renderAssistantHTML`.
   */
  renderAssistantProgressive?(rawText: string): string;
}

/**
 * The right-hand reasoning panel. Legacy owns the panel's event channel
 * (`window.__socratesThinkingPanelBridge`); a declarative turn's status line
 * asks for it through here instead of reaching for window directly.
 */
export interface LegacyThinking {
  openPanel(messageId: string | null): void;
}

/**
 * Live-turn controls that a declarative render needs to hand back to the
 * streaming pipeline: retrying a turn that timed out before its first token,
 * and answering a tool-approval request the run is blocked on.
 */
export interface LegacyLiveTurn {
  /** False when no live turn claims this message — the button is a no-op. */
  retry(messageId: string): boolean;
  /** Null when the turn's runtime is gone (page reload, or already decided). */
  decideApproval(messageId: string, toolCallId: string, decision: string): void | Promise<void>;
}

export interface LegacyActions {
  messages: LegacyMessages;
  navigation: LegacyNavigation;
  settings: LegacySettings;
  confirm: LegacyConfirm;
  sessions: LegacySessions;
  composer: LegacyComposer;
  cmdK: LegacyCmdK;
  share: LegacyShare;
  profile: LegacyProfile;
  workspace: LegacyWorkspace;
  scheduled: LegacyScheduled;
  postRender: LegacyPostRender;
  render: LegacyRender;
  thinking?: LegacyThinking;
  liveTurn?: LegacyLiveTurn;
}

export type LegacyDomain = keyof LegacyActions;
