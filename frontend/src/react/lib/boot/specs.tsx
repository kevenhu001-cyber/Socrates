/**
 * Mount specs — flat data structure consumed by `runMountRegistry`.
 *
 * Each spec describes one host element React takes over at bootstrap.
 * The list is in execution order so the comment blocks below describe
 * the bootstrap sequence (required roots first, global React roots last).
 */

import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import { ErrorBoundary } from '../../ErrorBoundary';
import type { MountSpec } from './registry';

import { hydrateComposerToolsMenu } from '../../composer/ComposerToolsMenu';
import { hydrateCmdKOverlay } from '../../cmdk/CommandPalette';
import { hydrateFindInSession } from '../../find-in-session/FindInSession';
import { hydrateMorePopover } from '../../morePopover';
import { hydrateProfileModal } from '../../profileModal';
import { hydrateShareModal } from '../../shareModal';
import { hydrateUsageModal } from '../../usageModal';
import { hydrateRecentsFilterChips, hydrateSidebarNav } from '../../sidebar';
import { mountStorageModal } from '../../storageModal';
import { mountCheatsheet } from '../../cheatsheet';
import { mountPromptTemplatesModal } from '../../promptTemplatesModal';
import { mountConfirmDialog } from '../../confirm';
import { mountChatConfiguration } from '../../chat-configuration';
import { installSidebarChromeBridge } from '../../sidebar-chrome/sidebarChrome.bridge';
import { SidebarHeader } from '../../sidebar-chrome/SidebarHeader';
import { SidebarFooter } from '../../sidebar-chrome/SidebarFooter';
import { mountSessionList } from '../../session-list';
import { mountMessageList } from '../../message-list';
import { RichComposer } from '../../composer-input';
import { WorkflowLayer } from '../../extensions/WorkflowLayer';
import { installThinkingPanelBridge, mountThinkingPanel } from '../../thinking-panel';
import { getLegacyActions, i18n } from '../../legacy/gateway';
import { hydrateAttachmentChipsRows } from '../../attachments/AttachmentChipsRow';
import { installAttachmentsBridge } from '../../attachments/attachments.bridge';
import { installWorkspaceBridge } from '../../pages/workspace/workspace.bridge';

import { NewReplyPill, SendButton, StartButton } from './indicatorComponents';

/* Module-level reference the registry's pill mount needs to capture. */
export let pillRoot: import('react-dom/client').Root | null = null;
export function setPillRoot(root: import('react-dom/client').Root | null): void {
  pillRoot = root;
}

/* Portal helpers — lazily create a body-level host element when the
   page didn't ship one in index.html. */
function ensureBodyChild(doc: Document, id: string): HTMLElement | null {
  let host = doc.getElementById(id);
  if (!host) {
    host = doc.createElement('div');
    host.id = id;
    doc.body.appendChild(host);
  }
  return host;
}

function ensureWorkflowHost(doc: Document): HTMLElement | null {
  let host = doc.getElementById('workflowLayerReactRoot');
  if (host) return host;
  const chatView = doc.getElementById('chatView');
  const chatInputBar = doc.getElementById('chatInputBar');
  if (!chatView || !chatInputBar) return null;
  host = doc.createElement('div');
  host.id = 'workflowLayerReactRoot';
  chatView.insertBefore(host, chatInputBar);
  return host;
}

const loadedPages = new Set<string>();

function loadPage(hostId: string, load: () => Promise<void>): void {
  const host = document.getElementById(hostId);
  if (host && !loadedPages.has(hostId)) {
    host.classList.remove('visually-hidden');
    host.textContent = 'Loading…';
    host.setAttribute('aria-busy', 'true');
  }
  void load().then(() => loadedPages.add(hostId)).catch(() => {
    if (host) host.textContent = 'Could not load this page. Please try again.';
  }).finally(() => host?.removeAttribute('aria-busy'));
}

export function mountRegistryList(): MountSpec[] {
  const legacyComposer = getLegacyActions().composer;
  return [
    /* 1. Bootstrap installs the chat runtime bridge before this registry
       runs, so every root can subscribe during mount. */
    { hostId: 'msgList', label: 'msg-list', mount: () => mountMessageList().root !== null },
    { hostId: 'newReplyPill', label: 'new-reply-pill', mount: (host) => {
      setPillRoot(hydrateRoot(host, <StrictMode><NewReplyPill host={host} /></StrictMode>));
    } },
    { hostId: 'sendBtnContent', label: 'send-button', mount: (host) => {
      createRoot(host).render(<StrictMode><SendButton /></StrictMode>);
    } },
    { hostId: 'startBtnContent', label: 'start-button', mount: (host) => {
      createRoot(host).render(<StrictMode><StartButton /></StrictMode>);
    } },
    /* 2. Overlays / modals / popovers */
    { hostId: 'cmdKOverlay', label: 'cmd-k', mount: () => hydrateCmdKOverlay() },
    { hostId: 'findBar', label: 'find-in-session', mount: () => hydrateFindInSession() },
    { hostId: 'sidebarNav', label: 'sidebar-nav', mount: () => hydrateSidebarNav() },
    { hostId: 'recentsFilterChips', label: 'recents-filter-chips', mount: () => hydrateRecentsFilterChips() },
    { hostId: 'composerToolsMenu', label: 'composer-tools-menu', mount: () => hydrateComposerToolsMenu() },
    { hostId: 'attachmentChips', label: 'attachment-chips',
      mount: () => { installAttachmentsBridge(); hydrateAttachmentChipsRows(); } },
    { hostId: 'topicAttachmentChips', label: 'attachment-chips',
      mount: () => { installAttachmentsBridge(); hydrateAttachmentChipsRows(); } },
    { hostId: 'moreNavPopover', label: 'more-popover', mount: () => hydrateMorePopover() },
    { hostId: 'shareOverlay', label: 'share-modal', mount: () => hydrateShareModal() },
    { hostId: 'profileOverlay', label: 'profile-modal', mount: () => hydrateProfileModal() },
    { hostId: 'usageOverlay', label: 'usage-modal', mount: () => hydrateUsageModal() },
    /* 3. Sidebar chrome — install the bridge once before mounting both header + footer */
    { hostId: 'sidebarHeader', label: 'sidebar-header', mount: (host) => {
      installSidebarChromeBridge();
      createRoot(host).render(<SidebarHeader />);
    } },
    { hostId: 'sidebarUserRow', label: 'sidebar-user-row', mount: (host) => {
      installSidebarChromeBridge();
      createRoot(host).render(<SidebarFooter />);
    } },
    /* 4. Workspace pages — the registry tags each panel; the nav call
       funnels through `__socratesMountWorkspace` regardless. */
    { hostId: 'scheduledPanel', label: 'scheduled-page', mount: () => {
      window.__socratesMountScheduled = () => {
        loadPage('scheduledList', async () => {
          const { mountScheduledPage } = await import('../../pages/scheduled/ScheduledPage');
          mountScheduledPage();
          window.__socratesNavRenderScheduled?.();
        });
      };
    } },
    { hostId: 'libraryPanel', label: 'workspace-page', mount: () => {
      installWorkspaceBridge();
      window.__socratesMountWorkspace = (page: string) => {
        const hostId = page === 'library' ? 'libraryList' : page === 'projects' ? 'spacesList' : 'pluginsList';
        loadPage(hostId, async () => {
          const { mountWorkspacePage } = await import('../../pages/workspace/WorkspacePage');
          mountWorkspacePage(page);
        });
      };
    } },
    /* /admin operator console — the React page mounts into the
       static #adminPanelBody when the sidebar routes to it. */
    { hostId: 'adminPanel', label: 'admin-page', mount: () => {
      window.__socratesMountAdmin = () => {
        loadPage('adminPanelBody', async () => {
          const { mountAdminPage } = await import('../../adminModal/AdminPage');
          mountAdminPage();
        });
      };
    } },
    { hostId: 'spacesPanel', label: 'workspace-page', mount: () => undefined },
    { hostId: 'pluginsPanel', label: 'workspace-page', mount: () => undefined },
    /* 5. Lazy portal roots */
    { hostId: 'storageModalReactRoot', label: 'storage-modal',
      ensureHost: (doc) => ensureBodyChild(doc, 'storageModalReactRoot'),
      mount: () => mountStorageModal() },
    { hostId: 'cheatsheetReactRoot', label: 'cheatsheet',
      ensureHost: (doc) => ensureBodyChild(doc, 'cheatsheetReactRoot'),
      mount: () => mountCheatsheet() },
    { hostId: 'promptTemplatesReactRoot', label: 'prompt-templates',
      ensureHost: (doc) => ensureBodyChild(doc, 'promptTemplatesReactRoot'),
      mount: () => mountPromptTemplatesModal() },
    /* M4 step 4.5c — confirm dialog is React-owned. The static
       index.html #confirmDialog markup was removed; the mount spec
       lazily creates the body-level root the component renders into. */
    { hostId: 'confirmDialogReactRoot', label: 'confirm-dialog',
      ensureHost: (doc) => ensureBodyChild(doc, 'confirmDialogReactRoot'),
      mount: () => mountConfirmDialog() },
    { hostId: 'chatConfigurationReactRoot', label: 'chat-configuration',
      ensureHost: (doc) => ensureBodyChild(doc, 'chatConfigurationReactRoot'),
      mount: () => mountChatConfiguration() },
    /* 5. Lazy portal roots. The session list mounts into the existing
       `#recentsList` host (mountSessionList targets that id directly);
       the hostId must match it or the registry skips the spec and the
       Recents list stays empty. */
    { hostId: 'recentsList', label: 'session-list',
      mount: () => mountSessionList() },
    /* 6. Global React roots — composer, message list, workflow layer, thinking panel */
    { hostId: 'topicComposerRoot', label: 'rich-composer', mount: (host) => {
      createRoot(host).render(<ErrorBoundary><RichComposer surface="topic"
        placeholder={i18n('topic.inputPlaceholder', 'What would you like to explore?')}
        onSubmit={() => legacyComposer.startSession()} /></ErrorBoundary>);
    } },
    { hostId: 'chatComposerRoot', label: 'rich-composer', mount: (host) => {
      createRoot(host).render(<ErrorBoundary><RichComposer surface="chat"
        placeholder={i18n('chat.inputPlaceholder', 'Send a message')}
        onSubmit={() => legacyComposer.submitChatMessage()}
        onEscape={() => legacyComposer.stopChatResponse()} /></ErrorBoundary>);
    } },
    { hostId: 'workflowLayerReactRoot', label: 'workflow-layer',
      ensureHost: ensureWorkflowHost,
      mount: (host) => { createRoot(host).render(<ErrorBoundary><WorkflowLayer /></ErrorBoundary>); } },
    { hostId: 'thinkingPanelReactRoot', label: 'thinking-panel',
      ensureHost: (doc) => { installThinkingPanelBridge(); return ensureBodyChild(doc, 'thinkingPanelReactRoot'); },
      mount: (host) => mountThinkingPanel(host) },
  ];
}
