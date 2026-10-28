/* ui/keyboardShortcuts.js — extracted from main.js (B6 batch).
 * Global keyboard shortcut dispatchers (Ctrl+\, Cmd/Ctrl+K, full P5.6
 * shortcut table). Zero-behavior-change lift.
 * Cross-module actions resolve via direct imports where available,
 * otherwise via window.* / typeof-guarded globals at event time.
 */
import { stateStore } from '../state/store.js';
import { showToast } from './toast.js';
import { openCheatsheet, closeCheatsheet } from './cheatsheet.js';
import { toggleTheme } from '../displayPrefs.js';
import { toggleSidebar } from '../sidebar/sidebar.service.ts';
import { openNav } from '../sidebar/navigation.service.ts';
import { openShareModal, closeShareModal } from './share.js';
/* closeUsageModal resolves via window.* — ui/usage.js is lazy-loaded and
   the overlay can only be visible after the module mounted. */
import { closeStorageModal } from './storage.js';
import { closePromptTemplatesModal } from './promptTemplates.js';
/* Settings is a lazy React surface; the stable close command stays on window. */
import { closeProfile, openProfile, toggleProfileWebSearch } from './profile.js';
import { isFindOpen } from '../react/find-in-session/findInSession.actions.ts';
import { getComposerMarkdown, setComposerMarkdown, focusComposer } from '../composer/controller.ts';
import { findLastUserMessage } from '../render/markdown.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

function isCommandShortcut(event, key, shiftKey = false) {
  return (event.metaKey || event.ctrlKey)
    && !event.altKey
    && event.shiftKey === shiftKey
    && (event.key || '').toLowerCase() === key;
}

function isVisible(id) {
  const overlay = document.getElementById(id);
  return Boolean(overlay && !overlay.classList.contains('hidden'));
}

function closeVisibleOverlay(event, id, close) {
  if (!isVisible(id)) return false;
  event.preventDefault();
  close();
  return true;
}

function closeOpenModal(event) {
  if (event.key !== 'Escape') return false;
  if (typeof isFindOpen === 'function' && isFindOpen()) {
    event.preventDefault();
    window.closeFindInSession();
    return true;
  }

  const modalClosers = [
    ['cmdKOverlay', () => window.closeCmdK()],
    ['storageModalOverlay', closeStorageModal],
    ['promptTemplatesOverlay', closePromptTemplatesModal],
    ['profileOverlay', closeProfile],
    ['settingsOverlay', () => window.closeSettings?.()],
    ['cheatsheetOverlay', closeCheatsheet],
    ['usageOverlay', () => window.closeUsageModal?.()],
    ['tagEditorPopover', () => window.closeTagEditor()],
    ['shareOverlay', closeShareModal],
  ];

  return modalClosers.some(([id, close]) => closeVisibleOverlay(event, id, close));
}

function handleBackslashSidebar(event) {
  if (event.key !== '\\' || !event.ctrlKey) return false;
  event.preventDefault();
  toggleSidebar();
  return true;
}

function handleCmdK(event) {
  if (!isCommandShortcut(event, 'k')) return false;
  event.preventDefault();
  if (typeof window.openCmdK === 'function') window.openCmdK();
  return true;
}

function handleFind(event) {
  if (!isCommandShortcut(event, 'f')) return false;
  const chatView = document.getElementById('chatView');
  if (!chatView || chatView.classList.contains('hidden')) return false;
  event.preventDefault();
  if (typeof window.openFindInSession === 'function') window.openFindInSession();
  return true;
}

function handleCheatsheet(event) {
  const command = event.metaKey || event.ctrlKey;
  if (!command || event.altKey || !['/', '?'].includes(event.key)) return false;
  event.preventDefault();
  openCheatsheet();
  return true;
}

function handleSidebar(event) {
  if (!isCommandShortcut(event, 'b')) return false;
  event.preventDefault();
  toggleSidebar();
  return true;
}

function handleProfile(event) {
  if (!isCommandShortcut(event, '.')) return false;
  event.preventDefault();
  if (typeof openProfile === 'function') {
    if (isVisible('profileOverlay')) closeProfile();
    else openProfile();
  }
  return true;
}

function handleNewChat(event) {
  if (!isCommandShortcut(event, 'o', true)) return false;
  event.preventDefault();
  if (typeof window.startNewChat === 'function') window.startNewChat();
  return true;
}

function handleShare(event) {
  if (!isCommandShortcut(event, 's', true)) return false;
  event.preventDefault();
  if (typeof openShareModal === 'function' && stateStore.read('currentSessionId')) {
    openShareModal();
  } else {
    showToast(t('toast.shareStartFirst'));
  }
  return true;
}

function handleTheme(event) {
  if (!isCommandShortcut(event, 't', true)) return false;
  event.preventDefault();
  if (typeof toggleTheme === 'function') toggleTheme();
  return true;
}

function handleWebSearch(event) {
  if (!isCommandShortcut(event, 'f', true)) return false;
  event.preventDefault();
  toggleProfileWebSearch();
  return true;
}

function handleThinkingPreference(event) {
  if (!isCommandShortcut(event, 'm', true)) return false;
  event.preventDefault();
  if (typeof window.thinkingOn !== 'undefined') {
    window.thinkingOn = !window.thinkingOn;
    try {
      localStorage.setItem('socrates-thinking', JSON.stringify(window.thinkingOn));
    } catch (error) {
      reportSwallow(error, 'ui/keyboardShortcuts.js:155', 'expected');
    }
  }
  return true;
}

function handleSend(event) {
  if (!isCommandShortcut(event, 'enter')) return false;
  const composer = event.target?.closest?.('.rich-composer');
  if (!composer) return true;
  event.preventDefault();
  if (composer.getAttribute('data-surface') === 'topic') window.startSession();
  else if (typeof window.submitChatMessage === 'function') window.submitChatMessage();
  return true;
}

function handleProjects(event) {
  if (!isCommandShortcut(event, 'a', true)) return false;
  event.preventDefault();
  openNav('projects');
  return true;
}

function handleCycleProject(event) {
  if (!isCommandShortcut(event, 'p', true)) return false;
  event.preventDefault();
  window.cycleActiveProject();
  return true;
}

function handlePromptRecall(event) {
  if (event.key !== 'ArrowUp' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  const composer = event.target?.closest?.('.rich-composer[data-surface="chat"]');
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

function dispatchShortcut(event) {
  for (const handleShortcut of SHORTCUT_HANDLERS) {
    if (handleShortcut(event)) return;
  }
}

export function installKeyboardShortcuts() {
  document.addEventListener('keydown', dispatchShortcut);
}

export default installKeyboardShortcuts;
