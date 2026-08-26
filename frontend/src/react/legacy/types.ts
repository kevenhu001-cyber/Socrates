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

export interface LegacySessions {
  loadSession(sessionId: string): Promise<void> | void;
  setRecentsFilter(filter: string | null): void;
  getRecentsFilter?(): string | null;
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
}

export interface LegacyActions {
  messages: LegacyMessages;
  navigation: LegacyNavigation;
  sessions: LegacySessions;
  composer: LegacyComposer;
  cmdK: LegacyCmdK;
  share: LegacyShare;
  profile: LegacyProfile;
  workspace: LegacyWorkspace;
  scheduled: LegacyScheduled;
  postRender: LegacyPostRender;
}

export type LegacyDomain = keyof LegacyActions;
