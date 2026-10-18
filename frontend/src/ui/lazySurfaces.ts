type ShareModule = typeof import('./share.js');
type CheatsheetModule = typeof import('./cheatsheet.js');
type StorageModule = typeof import('./storage.js');
type PromptTemplatesModule = typeof import('./promptTemplates.js');

let shareModulePromise: Promise<ShareModule> | null = null;
let cheatsheetModulePromise: Promise<CheatsheetModule> | null = null;
let storageModulePromise: Promise<StorageModule> | null = null;
let promptTemplatesModulePromise: Promise<PromptTemplatesModule> | null = null;

function loadOnce<T>(
  current: Promise<T> | null,
  assign: (next: Promise<T> | null) => void,
  loader: () => Promise<T>,
  label: string,
): Promise<T> {
  if (current) return current;
  const next = loader().catch((error) => {
    assign(null);
    console.error(`[lazy-surface] failed to load ${label}`, error);
    throw error;
  });
  assign(next);
  return next;
}

export function loadShareSurface(): Promise<ShareModule> {
  return loadOnce(
    shareModulePromise,
    (next) => { shareModulePromise = next; },
    () => import('./share.js'),
    'share',
  );
}

export function openShareModal(sessionId?: string): void {
  void loadShareSurface().then((module) => module.openShareModal(sessionId));
}

export function closeShareModal(): void {
  if (!shareModulePromise) return;
  void shareModulePromise.then((module) => module.closeShareModal());
}

export function selectShareVis(visibility: string): void {
  void loadShareSurface().then((module) => module.selectShareVis(visibility));
}

export function createShareLink(): Promise<unknown> {
  return loadShareSurface().then((module) => module.createShareLink());
}

export function copyShareLink(): Promise<unknown> {
  return loadShareSurface().then((module) => module.copyShareLink());
}

export function revokeShareLink(): Promise<unknown> {
  return loadShareSurface().then((module) => module.revokeShareLink());
}

export function loadSharedSession(token: string): Promise<unknown> {
  return loadShareSurface().then((module) => module.loadSharedSession(token));
}

export function loadCheatsheetSurface(): Promise<CheatsheetModule> {
  return loadOnce(
    cheatsheetModulePromise,
    (next) => { cheatsheetModulePromise = next; },
    () => import('./cheatsheet.js'),
    'cheatsheet',
  );
}

export function openCheatsheet(): void {
  void loadCheatsheetSurface().then((module) => module.openCheatsheet());
}

export function closeCheatsheet(): void {
  if (!cheatsheetModulePromise) return;
  void cheatsheetModulePromise.then((module) => module.closeCheatsheet());
}

export function loadStorageSurface(): Promise<StorageModule> {
  return loadOnce(
    storageModulePromise,
    (next) => { storageModulePromise = next; },
    () => import('./storage.js'),
    'storage',
  );
}

export function openStorageModal(): void {
  void loadStorageSurface().then((module) => module.openStorageModal());
}

export function closeStorageModal(): void {
  if (!storageModulePromise) return;
  void storageModulePromise.then((module) => module.closeStorageModal());
}

export function loadPromptTemplatesSurface(): Promise<PromptTemplatesModule> {
  return loadOnce(
    promptTemplatesModulePromise,
    (next) => { promptTemplatesModulePromise = next; },
    () => import('./promptTemplates.js'),
    'prompt templates',
  );
}

export function openPromptTemplatesModal(): void {
  void loadPromptTemplatesSurface().then((module) => module.openPromptTemplatesModal());
}

export function closePromptTemplatesModal(): void {
  if (!promptTemplatesModulePromise) return;
  void promptTemplatesModulePromise.then((module) => module.closePromptTemplatesModal());
}
