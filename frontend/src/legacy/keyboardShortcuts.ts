/* legacy/keyboardShortcuts.ts — extracted from legacy entry.
 * Global keyboard shortcut dispatchers (Ctrl+\, Cmd/Ctrl+K, full P5.6
 * shortcut table). Zero-behavior-change lift.
 * Cross-module actions resolve via direct imports where available,
 * otherwise via window.* / typeof-guarded globals at event time.
 */
import { sessionBridge } from '../store/index.ts';
import { showToast } from './toast.js';
import { openCheatsheet, closeCheatsheet } from './cheatsheet.js';
import { toggleTheme } from '../displayPrefs.ts';
import { toggleSidebar } from '../sidebar/sidebar.service.ts';
import { closeAccountPage, openNav } from '../sidebar/navigation.service.ts';
import { openShareModal, closeShareModal } from './share.ts';
/* closeUsageModal resolves via window.* — legacy/usage.ts is lazy-loaded and
   the overlay can only be visible after the module mounted. */
import { closeStorageModal } from './storage.js';
import { closePromptTemplatesModal } from './promptTemplates.ts';
import { closeSettings, openSettings } from '../react/settings/settings.service.ts';
import { closeProfile, openProfile, toggleProfileWebSearch } from './profile.ts';
import {
  closeFindInSession,
  isFindOpen,
  openFindInSession,
} from '../react/find-in-session/findInSession.actions.ts';
import { closeCmdK, openCmdK } from './cmdK.ts';
import { getComposerMarkdown, setComposerMarkdown, focusComposer } from '../composer/controller.ts';
import { cycleActiveProject, closeTagEditor } from '../session/organizeRuntime.ts';
import { findLastUserMessage } from '../render/markdown.ts';
import { findLastAssistantMessage } from '../render/markdownText.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { t } from '../i18n/index.ts';
import { startNewChat } from '../app/lifecycle/index.ts';
import { startSession } from '../chat/sessionBootstrap/index.ts';
import { submitChatMessage } from '../chat/sendPipeline.ts';

function isCommandShortcut(event: KeyboardEvent, key: string, shiftKey = false) {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    event.shiftKey === shiftKey &&
    (event.key || '').toLowerCase() === key
  );
}

function isVisible(id: string) {
  const overlay = document.getElementById(id);
  return Boolean(overlay && !overlay.hidden && !overlay.classList.contains('hidden'));
}

function closeVisibleOverlay(event: KeyboardEvent, id: string, close: () => void) {
  if (!isVisible(id)) return false;
  event.preventDefault();
  close();
  return true;
}

function closeOpenModal(event: KeyboardEvent) {
  if (event.key !== 'Escape') return false;
  if (typeof isFindOpen === 'function' && isFindOpen()) {
    event.preventDefault();
    closeFindInSession();
    return true;
  }

  const modalClosers: Array<[string, () => void]> = [
    ['cmdKOverlay', closeCmdK],
    ['storageModalOverlay', closeStorageModal],
    ['promptTemplatesOverlay', closePromptTemplatesModal],
    ['cheatsheetOverlay', closeCheatsheet],
    [
      'usageOverlay',
      () => {
        void import('./usage.ts')
          .then((module) => module.closeUsageModal())
          .catch((error) => reportSwallow(error, 'keyboardShortcuts.closeUsageModal'));
      },
    ],
    ['tagEditorPopover', closeTagEditor],
    ['shareOverlay', closeShareModal],
  ];

  if (modalClosers.some(([id, close]) => closeVisibleOverlay(event, id, close))) return true;
  if (event.defaultPrevented || isVisible('confirmOverlay') || !closeAccountPage()) return false;
  event.preventDefault();
  return true;
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
  openCmdK();
  return true;
}

function handleFind(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 'f')) return false;
  const chatView = document.getElementById('chatView');
  if (!chatView || chatView.classList.contains('hidden')) return false;
  event.preventDefault();
  openFindInSession();
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

function handleSettings(event: KeyboardEvent) {
  if (!isCommandShortcut(event, ',')) return false;
  event.preventDefault();
  if (isVisible('settingsPage')) closeSettings();
  else openSettings();
  return true;
}

function handleProfile(event: KeyboardEvent) {
  if (!isCommandShortcut(event, '.')) return false;
  event.preventDefault();
  if (typeof openProfile === 'function') {
    if (isVisible('profilePage')) closeProfile();
    else openProfile();
  }
  return true;
}

function handleCopyLastResponse(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 'c', true)) return false;
  if (window.getSelection?.()?.toString()) return false;
  const lastAssistantMessage = findLastAssistantMessage();
  if (!lastAssistantMessage) return false;
  event.preventDefault();
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(lastAssistantMessage).then(
      () => showToast(t('clipboard.copied')),
      () => showToast(t('clipboard.failed')),
    );
  }
  return true;
}

function handleNewChat(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 'o', true)) return false;
  event.preventDefault();
  startNewChat();
  return true;
}

function handleShare(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 's', true)) return false;
  event.preventDefault();
  if (typeof openShareModal === 'function' && sessionBridge.getSnapshot().currentSessionId) {
    openShareModal();
  } else {
    showToast(t('toast.shareStartFirst'));
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

function handleSend(event: KeyboardEvent) {
  if (!isCommandShortcut(event, 'enter')) return false;
  const composer = (event.target as Element)?.closest?.('.rich-composer');
  if (!composer) return true;
  event.preventDefault();
  if (composer.getAttribute('data-surface') === 'topic') void startSession();
  else void submitChatMessage();
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
  cycleActiveProject();
  return true;
}

function handlePromptRecall(event: KeyboardEvent) {
  if (event.key !== 'ArrowUp' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
    return false;
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
  handleSettings,
  handleProfile,
  handleCopyLastResponse,
  handleNewChat,
  handleShare,
  handleTheme,
  handleWebSearch,
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
