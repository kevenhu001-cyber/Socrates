/* ui/keyboardShortcuts.ts — extracted from main.js (B6 batch).
 * Global keyboard shortcut dispatchers (Ctrl+\, Cmd/Ctrl+K, full P5.6
 * shortcut table). Zero-behavior-change lift.
 * Cross-module actions resolve via direct imports where available,
 * otherwise via window.* / typeof-guarded globals at event time.
 */
import { stateStore } from '../state/store.ts';
import { showToast } from './toast.js';
import { openCheatsheet, closeCheatsheet } from './cheatsheet.js';
import { toggleTheme } from '../displayPrefs.ts';
import { toggleSidebar } from '../sidebar/sidebar.service.ts';
import { openNav } from '../sidebar/navigation.service.ts';
import { openShareModal, closeShareModal } from './share.ts';
/* closeUsageModal resolves via window.* — ui/usage.ts is lazy-loaded and
   the overlay can only be visible after the module mounted. */
import { closeStorageModal } from './storage.js';
import { closePromptTemplatesModal } from './promptTemplates.ts';
/* Settings is a lazy React surface; the stable close command stays on window. */
import { closeProfile, openProfile, toggleProfileWebSearch } from './profile.ts';
import { isFindOpen } from '../react/find-in-session/findInSession.actions.ts';
import { getComposerMarkdown, setComposerMarkdown, focusComposer } from '../composer/controller.ts';
import { findLastUserMessage } from '../render/markdown.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


function isCommandShortcut(event: KeyboardEvent, key: string, shiftKey = false) {
  return (event.metaKey || event.ctrlKey)
    && !event.altKey
    && event.shiftKey === shiftKey
    && (event.key || '').toLowerCase() === key;
}

function isVisible(id: string) {
  const overlay = document.getElementById(id);
  return Boolean(overlay && !overlay.classList.contains('hidden'));
}

function closeVisibleOverlay(event: KeyboardEvent, id: any, close: () => void) {
  if (!isVisible(id)) return false;
  event.preventDefault();
  close();
  return true;
}

function closeOpenModal(event: KeyboardEvent) {
  if (event.key !== 'Escape') return false;
  if (typeof isFindOpen === 'function' && isFindOpen()) {
    event.preventDefault();
    browserWindow.closeFindInSession();
    return true;
  }

  const modalClosers: Array<[string, () => void]> = [
    ['cmdKOverlay', () => browserWindow.closeCmdK()],
    ['storageModalOverlay', closeStorageModal],
    ['promptTemplatesOverlay', closePromptTemplatesModal],
    ['profileOverlay', closeProfile],
    ['settingsOverlay', () => browserWindow.closeSettings?.()],
    ['cheatsheetOverlay', closeCheatsheet],
    ['usageOverlay', () => browserWindow.closeUsageModal?.()],
    ['tagEditorPopover', () => browserWindow.closeTagEditor()],
    ['shareOverlay', closeShareModal],
  ];

  return modalClosers.some(([id, close]) => closeVisibleOverlay(event, id, close));
}

function handleBackslashSidebar(event: KeyboardEvent) {
  if (event.key !== '\\' || !event.ctrlKey) return false;
  event.preventDefault();
  toggleSidebar();
  return true;
}

function handleCmdK(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 'k')) return false;
  event.preventDefault();
  if (typeof browserWindow.openCmdK === 'function') browserWindow.openCmdK();
  return true;
}

function handleFind(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 'f')) return false;
  const chatView = document.getElementById('chatView');
  if (!chatView || chatView.classList.contains('hidden')) return false;
  event.preventDefault();
  if (typeof browserWindow.openFindInSession === 'function') browserWindow.openFindInSession();
  return true;
}

function handleCheatsheet(event: KeyboardEvent) {
  const command = event.metaKey || event.ctrlKey;
  if (!command || event.altKey || !['/', '?'].includes(event.key)) return false;
  event.preventDefault();
  openCheatsheet();
  return true;
}

function handleSidebar(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 'b')) return false;
  event.preventDefault();
  toggleSidebar();
  return true;
}

function handleProfile(event: KeyboardEvent) {
  if (!isCommandShortcut(event, '.')) return false;
  event.preventDefault();
  if (typeof openProfile === 'function') {
    if (isVisible('profileOverlay')) closeProfile();
    else openProfile();
  }
  return true;
}

function handleNewChat(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 'o', true)) return false;
  event.preventDefault();
  if (typeof browserWindow.startNewChat === 'function') browserWindow.startNewChat();
  return true;
}

function handleShare(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 's', true)) return false;
  event.preventDefault();
  if (typeof openShareModal === 'function' && stateStore.read('currentSessionId')) {
    openShareModal();
  } else {
    showToast(browserWindow.t('toast.shareStartFirst'));
  }
  return true;
}

function handleTheme(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 't', true)) return false;
  event.preventDefault();
  if (typeof toggleTheme === 'function') toggleTheme();
  return true;
}

function handleWebSearch(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 'f', true)) return false;
  event.preventDefault();
  toggleProfileWebSearch();
  return true;
}

function handleThinkingPreference(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 'm', true)) return false;
  event.preventDefault();
  const next = !(browserWindow.thinkingOn === true);
  browserWindow.thinkingOn = next as typeof browserWindow.thinkingOn;
  try { localStorage.setItem('socrates-thinking', JSON.stringify(next)); }
  catch (error) { reportSwallow(error, 'ui/keyboardShortcuts.ts:155', 'expected'); }
  return true;
}

function handleSend(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 'enter')) return false;
  const composer = (event.target as Element)?.closest?.('.rich-composer');
  if (!composer) return true;
  event.preventDefault();
  if (composer.getAttribute('data-surface') === 'topic') browserWindow.startSession();
  else if (typeof browserWindow.submitChatMessage === 'function') browserWindow.submitChatMessage();
  return true;
}

function handleProjects(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 'a', true)) return false;
  event.preventDefault();
  openNav('projects');
  return true;
}

function handleCycleProject(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 'p', true)) return false;
  event.preventDefault();
  browserWindow.cycleActiveProject();
  return true;
}

function handlePromptRecall(event: KeyboardEvent) {
  if (event.key !== 'ArrowUp' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  const composer = (event.target as Element)?.closest?.('.rich-composer[data-surface="chat"]');
  if (!composer || getComposerMarkdown('chat')) return false;
  const lastUserMessage = findLastUserMessage();
  if (!lastUserMessage) return false;
  event.preventDefault();
  setComposerMarkdown('chat', lastUserMessage);
  focusComposer('chat');
  return true;
}

const SHORTCUT_HANDLERS = [
  closeOpenModal,
  handleBackslashSidebar,
  handleCmdK,
  handleFind,
  handleCheatsheet,
  handleSidebar,
  handleProfile,
  handleNewChat,
  handleShare,
  handleTheme,
  handleWebSearch,
  handleThinkingPreference,
  handleSend,
  handleProjects,
  handleCycleProject,
  handlePromptRecall,
];

function dispatchShortcut(event: KeyboardEvent) {
  for (const handleShortcut of SHORTCUT_HANDLERS) {
    if (handleShortcut(event)) return;
  }
}

export function installKeyboardShortcuts() {
  document.addEventListener('keydown', dispatchShortcut);
}

export default installKeyboardShortcuts;
