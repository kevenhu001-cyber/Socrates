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

/* P_perf-modal-lazy — on-demand overlays (tools menu, cmdk, find,
   more-popover, profile/share/usage modals) are dynamically imported in
   their mount callbacks below so their module graph stays out of the
   entry chunk; they still mount during the boot registry pass, just a
   tick later. Visible chrome (sidebar nav, recents, session list,
   message list, attachment chips) stays statically imported. */
import { hydrateRecentsFilterChips, hydrateSidebarNav } from '../../sidebar';
import { mountSidebarChrome } from '../../sidebar-chrome';
import { mountSessionList } from '../../session-list';
import { mountMessageList } from '../../message-list';
import { WorkflowLayer } from '../../extensions/WorkflowLayer';
import { installThinkingPanelBridge, mountThinkingPanel } from '../../thinking-panel';
import { getLegacyActions, i18n } from '../../legacy/gateway';
import { hydrateAttachmentChipsRows } from '../../attachments/AttachmentChipsRow';
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

/* Workspace/scheduled/admin panels are mounted on demand through
   pageMounts.ts — sidebar navigation imports those functions directly;
   the specs below only tag the panels' ownership at bootstrap. */

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
    { hostId: 'cmdKOverlay', label: 'cmd-k',
      mount: () => { void import('../../cmdk/CommandPalette').then((m) => m.hydrateCmdKOverlay()); } },
    { hostId: 'findBar', label: 'find-in-session',
      mount: () => { void import('../../find-in-session/FindInSession').then((m) => m.hydrateFindInSession()); } },
    { hostId: 'sidebarNav', label: 'sidebar-nav', mount: () => hydrateSidebarNav() },
    { hostId: 'recentsFilterChips', label: 'recents-filter-chips', mount: () => hydrateRecentsFilterChips() },
    { hostId: 'composerToolsMenu', label: 'composer-tools-menu',
      mount: () => { void import('../../composer/ComposerToolsMenu').then((m) => m.hydrateComposerToolsMenu()); } },
    /* One spec covers both chips hosts: hydrateAttachmentChipsRows mounts
       #attachmentChips and #topicAttachmentChips together and installs the
       attachments bridge internally. A second spec for the topic host
       would always skip — the host is already marked when the registry
       reaches it. */
    { hostId: 'attachmentChips', label: 'attachment-chips',
      mount: () => { hydrateAttachmentChipsRows(); } },
    { hostId: 'moreNavPopover', label: 'more-popover',
      mount: () => { void import('../../morePopover').then((m) => m.hydrateMorePopover()); } },
    { hostId: 'shareOverlay', label: 'share-modal',
      mount: () => { void import('../../shareModal').then((m) => m.hydrateShareModal()); } },
    { hostId: 'profileOverlay', label: 'profile-modal',
      mount: () => { void import('../../profileModal').then((m) => m.hydrateProfileModal()); } },
    { hostId: 'usageOverlay', label: 'usage-modal',
      mount: () => { void import('../../usageModal').then((m) => m.hydrateUsageModal()); } },
    /* 3. Sidebar chrome — one root owns the header and portaled user
       footer; they share the bridge snapshot (sidebar-chrome/mount.tsx). */
    { hostId: 'sidebarHeader', label: 'sidebar-chrome', mount: () => { mountSidebarChrome(); } },
    /* 4. Workspace pages — the registry tags each panel as React-owned;
       the nav mounts them on demand through pageMounts.ts. */
    { hostId: 'scheduledPanel', label: 'scheduled-page', mount: () => undefined },
    { hostId: 'libraryPanel', label: 'workspace-page', mount: () => { installWorkspaceBridge(); } },
    /* /admin operator console — the React page owns #adminPanel when
       the sidebar routes to it. */
    { hostId: 'adminPanel', label: 'admin-page', mount: () => undefined },
    { hostId: 'spacesPanel', label: 'workspace-page', mount: () => undefined },
    { hostId: 'pluginsPanel', label: 'workspace-page', mount: () => undefined },
    /* 5. Lazy portal roots */
    { hostId: 'storageModalReactRoot', label: 'storage-modal',
      ensureHost: (doc) => ensureBodyChild(doc, 'storageModalReactRoot'),
      mount: () => { void import('../../storageModal').then((m) => m.mountStorageModal()); } },
    { hostId: 'cheatsheetReactRoot', label: 'cheatsheet',
      ensureHost: (doc) => ensureBodyChild(doc, 'cheatsheetReactRoot'),
      mount: () => { void import('../../cheatsheet').then((m) => m.mountCheatsheet()); } },
    { hostId: 'promptTemplatesReactRoot', label: 'prompt-templates',
      ensureHost: (doc) => ensureBodyChild(doc, 'promptTemplatesReactRoot'),
      mount: () => { void import('../../promptTemplatesModal').then((m) => m.mountPromptTemplatesModal()); } },
    /* M4 step 4.5c — confirm dialog is React-owned. The static
       index.html #confirmDialog markup was removed; the mount spec
       lazily creates the body-level root the component renders into. */
    { hostId: 'confirmDialogReactRoot', label: 'confirm-dialog',
      ensureHost: (doc) => ensureBodyChild(doc, 'confirmDialogReactRoot'),
      mount: () => { void import('../../confirm').then((m) => m.mountConfirmDialog()); } },
    { hostId: 'chatConfigurationReactRoot', label: 'chat-configuration',
      ensureHost: (doc) => ensureBodyChild(doc, 'chatConfigurationReactRoot'),
      mount: () => { void import('../../chat-configuration').then((m) => m.mountChatConfiguration()); } },
    /* 5. Lazy portal roots. The session list mounts into the existing
       `#recentsList` host (mountSessionList targets that id directly);
       the hostId must match it or the registry skips the spec and the
       Recents list stays empty. */
    { hostId: 'recentsList', label: 'session-list',
      mount: () => mountSessionList() },
    /* 6. Global React roots — composer, message list, workflow layer, thinking panel.
       P_perf-composer-lazy — RichComposer pulls the whole tiptap/prosemirror
       editor chain (vendor-editor, ~460 KB). Mount it via dynamic import so
       that chunk leaves the first-paint preload graph; the shell's composer
       area keeps its reserved height until the component mounts moments
       after reveal. */
    { hostId: 'topicComposerRoot', label: 'rich-composer', mount: (host) => {
      void import('../../composer-input').then(({ RichComposer }) => {
        createRoot(host).render(<ErrorBoundary><RichComposer surface="topic"
          placeholder={i18n('topic.inputPlaceholder', 'What would you like to explore?')}
          onSubmit={() => legacyComposer.startSession()} /></ErrorBoundary>);
      });
    } },
    { hostId: 'chatComposerRoot', label: 'rich-composer', mount: (host) => {
      void import('../../composer-input').then(({ RichComposer }) => {
        createRoot(host).render(<ErrorBoundary><RichComposer surface="chat"
          placeholder={i18n('chat.inputPlaceholder', 'Send a message')}
          onSubmit={() => legacyComposer.submitChatMessage()}
          onEscape={() => legacyComposer.stopChatResponse()} /></ErrorBoundary>);
      });
    } },
    { hostId: 'workflowLayerReactRoot', label: 'workflow-layer',
      ensureHost: ensureWorkflowHost,
      mount: (host) => { createRoot(host).render(<ErrorBoundary><WorkflowLayer /></ErrorBoundary>); } },
    { hostId: 'thinkingPanelReactRoot', label: 'thinking-panel',
      ensureHost: (doc) => { installThinkingPanelBridge(); return ensureBodyChild(doc, 'thinkingPanelReactRoot'); },
      mount: (host) => mountThinkingPanel(host) },
  ];
}
