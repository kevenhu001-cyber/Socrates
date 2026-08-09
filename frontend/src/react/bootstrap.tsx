import { StrictMode } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';

import { ErrorBoundary } from './ErrorBoundary';

import { hydrateAttachmentChipsRows } from './attachments';
import { hydrateComposerToolsMenu } from './composer';
import { hydrateCmdKOverlay } from './cmdk/CommandPalette';
import { hydrateFindInSession } from './find-in-session/FindInSession';
import { hydrateMorePopover } from './morePopover';
import { hydrateProfileModal } from './profileModal';
import { hydrateShareModal } from './shareModal';
import { hydrateUsageModal } from './usageModal';
import { mountScheduledPage } from './pages/scheduled';
import { hydrateRecentsFilterChips, hydrateSidebarNav } from './sidebar';
import { installChatRuntimeBridge } from './chatRuntimeStore';
import { useChatStreamStatus, useIsChatStreaming } from './useChatRuntime';
import { mountWorkspacePage } from './pages/workspace';
import { mountStorageModal } from './storageModal';
import { mountCheatsheet } from './cheatsheet';
import { mountPromptTemplatesModal } from './promptTemplatesModal';
import { installSidebarChromeBridge } from './sidebar-chrome';
import { SidebarHeader } from './sidebar-chrome/SidebarHeader';
import { SidebarFooter } from './sidebar-chrome/SidebarFooter';
import { mountSessionList } from './session-list';
import { mountMessageList } from './message-list';
import { RichComposer } from './composer-input';
import { WorkflowLayer } from './extensions/WorkflowLayer';
import { getLegacyActions, i18n } from './legacy/gateway';

const NEW_REPLY_PILL_ID = 'newReplyPill';
const SEND_BUTTON_CONTENT_ID = 'sendBtnContent';
const START_BUTTON_CONTENT_ID = 'startBtnContent';
const CMDK_OVERLAY_ID = 'cmdKOverlay';
const SIDEBAR_NAV_ID = 'sidebarNav';
const RECENTS_FILTER_CHIPS_ID = 'recentsFilterChips';
const COMPOSER_TOOLS_MENU_ID = 'composerToolsMenu';
const ATTACHMENT_CHIPS_ID = 'attachmentChips';
const TOPIC_ATTACHMENT_CHIPS_ID = 'topicAttachmentChips';

let sendButtonRoot: Root | null = null;
let topicComposerRoot: Root | null = null;
let chatComposerRoot: Root | null = null;

function isReferenceMobile(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(max-width: 640px)').matches);
}

function composerPlaceholder(key: string, fallback: string): string {
  return isReferenceMobile() ? '问问 Socrates' : i18n(key, fallback);
}

function NewReplyPillContent(): string {
  // Establish the first React subscription without changing the legacy
  // element's markup, text, visibility logic, or delegated click behavior.
  useIsChatStreaming();
  return '↓ New reply';
}

function SendButtonContent() {
  const streamStatus = useChatStreamStatus();

  if (streamStatus === 'streaming') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>
    );
  }

  return (
    <svg
      className={streamStatus === 'idle' ? 'icon-arrow' : undefined}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M7 12v1M11 9v7M15 6v12M19 10v8" />
    </svg>
  );
}

/**
 * Starts React by hydrating the first, deliberately small feature slice.
 *
 * The legacy element retains its id, classes, click delegation, and visibility
 * logic. React owns only its existing text node, so the visible
 * UI and event surface are unchanged.
 */
export function bootstrapReactCompatibilityRuntime(): Root {
  const pill = document.getElementById(NEW_REPLY_PILL_ID);
  const sendButtonContent = document.getElementById(SEND_BUTTON_CONTENT_ID);
  if (!pill) {
    throw new Error('React migration target "#newReplyPill" was not found.');
  }
  if (!sendButtonContent) {
    throw new Error('React migration target "#sendBtnContent" was not found.');
  }
  if (pill.dataset.reactMigrationRuntime) {
    throw new Error('React compatibility runtime was initialized more than once.');
  }
  if (sendButtonContent.dataset.reactMigrationRuntime) {
    throw new Error('React send-button runtime was initialized more than once.');
  }

  pill.setAttribute('data-react-migration-runtime', 'new-reply-pill');
  sendButtonContent.setAttribute('data-react-migration-runtime', 'send-button');
  installChatRuntimeBridge();

  const startBtnContent = document.getElementById(START_BUTTON_CONTENT_ID);
  if (startBtnContent && !startBtnContent.dataset.reactMigrationRuntime) {
    startBtnContent.setAttribute('data-react-migration-runtime', 'start-button');
    const startRoot = createRoot(startBtnContent);
    startRoot.render(
      <StrictMode>
        <svg className="icon-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M7 12v1M11 9v7M15 6v12M19 10v8" />
        </svg>
      </StrictMode>,
    );
  }

  const pillRoot = hydrateRoot(
    pill,
    <StrictMode>
      <NewReplyPillContent />
    </StrictMode>,
  );

  sendButtonRoot = hydrateRoot(
    sendButtonContent,
    <StrictMode>
      <SendButtonContent />
    </StrictMode>,
  );

  const cmdKOverlay = document.getElementById(CMDK_OVERLAY_ID);
  if (cmdKOverlay && !cmdKOverlay.dataset.cmdKReactHydrated) {
    hydrateCmdKOverlay();
  }

  // Hydrate the in-session find bar (Ctrl-F). React owns the DOM inside
  // #findBar; the bridge functions (openFindInSession, onFindInput, etc.)
  // are still available via window exports for legacy inline handlers.
  const findBar = document.getElementById('findBar');
  if (findBar && !findBar.dataset.findInSessionReactHydrated) {
    hydrateFindInSession();
  }

  const sidebarNav = document.getElementById(SIDEBAR_NAV_ID);
  if (sidebarNav && !sidebarNav.dataset.sidebarReactHydrated) {
    hydrateSidebarNav();
  }

  const recentsChips = document.getElementById(RECENTS_FILTER_CHIPS_ID);
  if (recentsChips && !recentsChips.dataset.recentChipsReactHydrated) {
    hydrateRecentsFilterChips();
  }

  const composerMenu = document.getElementById(COMPOSER_TOOLS_MENU_ID);
  if (composerMenu && !composerMenu.dataset.composerToolsReactHydrated) {
    hydrateComposerToolsMenu();
  }

  const attachmentChips = document.getElementById(ATTACHMENT_CHIPS_ID);
  const topicAttachmentChips = document.getElementById(TOPIC_ATTACHMENT_CHIPS_ID);
  if ((attachmentChips || topicAttachmentChips) && !window.__socratesAttachmentsBridge) {
    hydrateAttachmentChipsRows();
  }

  const legacyComposer = getLegacyActions().composer;
  const topicComposerHost = document.getElementById('topicComposerRoot');
  if (topicComposerHost && !topicComposerHost.dataset.richComposerMounted) {
    topicComposerHost.dataset.richComposerMounted = '1';
    topicComposerRoot = createRoot(topicComposerHost);
    topicComposerRoot.render(
      <ErrorBoundary>
        <RichComposer
          surface="topic"
          placeholder={composerPlaceholder('topic.inputPlaceholder', 'What would you like to explore?')}
          onSubmit={() => legacyComposer.startSession()}
        />
      </ErrorBoundary>,
    );
  }

  const chatComposerHost = document.getElementById('chatComposerRoot');
  if (chatComposerHost && !chatComposerHost.dataset.richComposerMounted) {
    chatComposerHost.dataset.richComposerMounted = '1';
    chatComposerRoot = createRoot(chatComposerHost);
    chatComposerRoot.render(
      <ErrorBoundary>
        <RichComposer
          surface="chat"
          placeholder={isReferenceMobile() ? '回复 Socrates' : i18n('chat.inputPlaceholder', 'Send a message')}
          onSubmit={() => legacyComposer.submitChatMessage()}
          onEscape={() => legacyComposer.stopChatResponse()}
        />
      </ErrorBoundary>,
    );
  }

  const morePopover = document.getElementById('moreNavPopover');
  if (morePopover && !morePopover.dataset.morePopoverReactHydrated) {
    hydrateMorePopover();
  }

  const shareOverlay = document.getElementById('shareOverlay');
  if (shareOverlay && !shareOverlay.dataset.shareReactHydrated) {
    hydrateShareModal();
  }

  const profileOverlay = document.getElementById('profileOverlay');
  if (profileOverlay && !profileOverlay.dataset.profileReactHydrated) {
    hydrateProfileModal();
  }

  const usageOverlay = document.getElementById('usageOverlay');
  if (usageOverlay && !usageOverlay.dataset.usageReactHydrated) {
    hydrateUsageModal();
  }

  // Hydrate sidebar header (logo, new chat, close sidebar)
  const sidebarHeader = document.getElementById('sidebarHeader');
  if (sidebarHeader && !sidebarHeader.dataset.sidebarChromeReactHydrated) {
    sidebarHeader.dataset.sidebarChromeReactHydrated = '1';
    sidebarHeader.setAttribute('data-react-migration-runtime', 'sidebar-header');
    installSidebarChromeBridge();
    const headerRoot = createRoot(sidebarHeader);
    headerRoot.render(<SidebarHeader />);
  }

  // Hydrate sidebar user row (inside the footer, leaving the footer actions
  // and display-prefs popover as legacy HTML).
  const sidebarUserRow = document.getElementById('sidebarUserRow');
  if (sidebarUserRow && !sidebarUserRow.dataset.sidebarChromeReactHydrated) {
    sidebarUserRow.dataset.sidebarChromeReactHydrated = '1';
    sidebarUserRow.setAttribute('data-react-migration-runtime', 'sidebar-user-row');
    installSidebarChromeBridge();
    const userRowRoot = createRoot(sidebarUserRow);
    userRowRoot.render(<SidebarFooter />);
  }

  // Register scheduled page mount for React mode
  const scheduledPanel = document.getElementById('scheduledPanel');
  if (scheduledPanel && !scheduledPanel.dataset.scheduledReactHydrated) {
    scheduledPanel.dataset.scheduledReactHydrated = '1';
    scheduledPanel.setAttribute('data-react-migration-runtime', 'scheduled-page');
    window.__socratesMountScheduled = () => {
      mountScheduledPage();
      // Trigger the legacy fetch; the bridge will rerender React
      if (typeof window.__socratesNavRenderScheduled === 'function') {
        window.__socratesNavRenderScheduled();
      }
    };
  }

  // Register workspace pages mount for React mode (library, projects, plugins)
  const workspacePageIds = ['libraryPanel', 'spacesPanel', 'pluginsPanel'];
  const pageMap: Record<string, string> = { libraryPanel: 'library', spacesPanel: 'projects', pluginsPanel: 'plugins' };
  workspacePageIds.forEach((id) => {
    const panel = document.getElementById(id);
    if (panel && !panel.dataset.workspaceReactHydrated) {
      panel.dataset.workspaceReactHydrated = '1';
      panel.setAttribute('data-react-migration-runtime', 'workspace-page');
    }
  });
  window.__socratesMountWorkspace = (page: string) => {
    mountWorkspacePage(page);
  };

  // Register storage modal mount for React mode
  let storageRoot = document.getElementById('storageModalReactRoot');
  if (!storageRoot) {
    storageRoot = document.createElement('div');
    storageRoot.id = 'storageModalReactRoot';
    storageRoot.setAttribute('data-react-migration-runtime', 'storage-modal');
    document.body.appendChild(storageRoot);
  }
  mountStorageModal();

  // Register cheatsheet mount for React mode
  let cheatsheetRoot = document.getElementById('cheatsheetReactRoot');
  if (!cheatsheetRoot) {
    cheatsheetRoot = document.createElement('div');
    cheatsheetRoot.id = 'cheatsheetReactRoot';
    cheatsheetRoot.setAttribute('data-react-migration-runtime', 'cheatsheet');
    document.body.appendChild(cheatsheetRoot);
  }
  mountCheatsheet();

  // Register prompt templates modal mount for React mode
  let promptTemplatesRoot = document.getElementById('promptTemplatesReactRoot');
  if (!promptTemplatesRoot) {
    promptTemplatesRoot = document.createElement('div');
    promptTemplatesRoot.id = 'promptTemplatesReactRoot';
    promptTemplatesRoot.setAttribute('data-react-migration-runtime', 'prompt-templates');
    document.body.appendChild(promptTemplatesRoot);
  }
  mountPromptTemplatesModal();

  // Mount session list (recents)
  mountSessionList();

  // Mount the chat message list. React owns #msgList; legacy
  // addMessage / loadSession / branchContext detect the runtime via
  // `data-react-migration-runtime="msg-list"` and skip DOM mutation.
  const msgList = document.getElementById('msgList');
  if (msgList && !msgList.dataset.msgListReactHydrated) {
    mountMessageList();
  }

  // Mount the workflow progress layer. The stepper (research/explore
  // stage progress) and the analyze workbench (live tool-call activity)
  // both subscribe to the agent-run store and render into this single
  // always-present host. The host is appended to #appShell as a sibling
  // of <main> so it stays visible across all panels (chat, library,
  // projects, plugins, exam, etc.) — mounting it inside #chatView would
  // hide it whenever the user navigates away from chat.
  const workflowLayer = document.getElementById('workflowLayerReactRoot');
  const appShell = document.getElementById('appShell');
  if (appShell && !workflowLayer) {
    const host = document.createElement('div');
    host.id = 'workflowLayerReactRoot';
    host.setAttribute('data-react-migration-runtime', 'workflow-layer');
    appShell.appendChild(host);
    const workflowRoot = createRoot(host);
    workflowRoot.render(
      <ErrorBoundary>
        <WorkflowLayer />
      </ErrorBoundary>,
    );
  }

  // Re-sync the workspace route now that __socratesMountWorkspace (and
  // the per-page createRoot) are registered. nav.js's own
  // syncWorkspaceRoute runs on DOMContentLoaded, but main.js
  // dynamically imports this module AFTER that — so the first run
  // saw __socratesMountWorkspace as undefined, openLibrary() skipped
  // mountWorkspacePage(), and React never rendered into #libraryPanel.
  // Calling it again here ensures deep-link URLs (/library, /projects,
  // /plugins) actually mount React.
  try { (window as any).syncWorkspaceRoute?.(); } catch (_) { /* swallow */ }

  return pillRoot;
}
