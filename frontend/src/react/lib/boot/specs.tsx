/**
 * Mount specs — flat data structure consumed by `runMountRegistry`.
 *
 * Each spec describes one host element React takes over at bootstrap.
 * The list is in execution order so the comment blocks below describe
 * the bootstrap sequence (required roots first, global React roots last).
 */

import { StrictMode } from 'react';
import { hydrateOwnedRoot, mountOwnedRoot } from './ownedRoot';

import { ErrorBoundary } from '../../ErrorBoundary';
import type { MountSpec } from './registry';

/* P_perf-modal-lazy — on-demand overlays (tools menu, cmdk, find,
   more-popover, profile/share/usage modals) are dynamically imported in
   their mount callbacks below so their module graph stays out of the
   entry chunk; they still mount during the boot registry pass, just a
   tick later. Visible chrome (sidebar nav, recents, session list,
   message list, attachment chips) stays statically imported. */
import { hydrateRecentsFilterChips, mountSidebarNav } from '../../sidebar';
import { mountSidebarChrome } from '../../sidebar-chrome';
import { mountSessionList } from '../../session-list';
import { mountMessageList } from '../../message-list';
import { getLegacyActions, i18n } from '../../legacy/gateway.ts';
import { handleComposerEscape, submitComposer, submitPrimaryComposer } from '../../composer-input/lifecycle';

import { NewReplyPill } from './indicatorComponents';

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
    /* 1. Bootstrap seeds the chat runtime store before this registry
       runs, so every root can subscribe during mount. */
    { hostId: 'msgList', label: 'msg-list', mount: () => mountMessageList().root !== null },
    { hostId: 'newReplyPill', label: 'new-reply-pill', mount: (host) => {
      hydrateOwnedRoot(host, 'new-reply-pill', <StrictMode><NewReplyPill host={host} /></StrictMode>);
    } },
    /* 2. Overlays / modals / popovers */
    { hostId: 'cookieConsentReactRoot', label: 'cookie-consent', mount: (host) => {
      return import('../../cookieConsent/CookieConsent').then(({ CookieConsent }) => {
        mountOwnedRoot(host, 'cookie-consent', <CookieConsent />);
      });
    } },
    { hostId: 'cmdKOverlay', label: 'cmd-k',
      mount: () => import('../../cmdk/CommandPalette').then((m) => m.hydrateCmdKOverlay()) },
    { hostId: 'findBar', label: 'find-in-session',
      mount: () => import('../../find-in-session/FindInSession').then((m) => m.hydrateFindInSession()) },
    { hostId: 'sidebarNav', label: 'sidebar-nav', mount: () => mountSidebarNav() },
    { hostId: 'sidebarSearchRow', label: 'sidebar-search-row', mount: (host) => {
      return import('../../sidebar-chrome/SidebarSearchRow').then(({ SidebarSearchRow }) => {
        mountOwnedRoot(host, 'sidebar-search-row', <SidebarSearchRow />);
      });
    } },
    { hostId: 'homeQuickActions', label: 'home-quick-actions', mount: (host) => {
      return import('../../home/HomeStartComponents').then(({ HomeQuickActions }) => {
        mountOwnedRoot(host, 'home-quick-actions', <HomeQuickActions />);
      });
    } },
    { hostId: 'homeTutorStarters', label: 'home-tutor-starters', mount: (host) => {
      return import('../../home/HomeStartComponents').then(({ HomeTutorStarters }) => {
        mountOwnedRoot(host, 'home-tutor-starters', <HomeTutorStarters />);
      });
    } },
    /* The header chrome — one root renders every control inside
       `<div class="top-bar" id="topBar">`. Its ids are the shell
       contract for the legacy runtime, so the React tree owns the
       markup while the runtime keeps toggling classes and text.
       P_perf-static-closure — dynamically imported: the header is not on
       the first-paint path either, and the primitive it pulls in would
       otherwise grow the entry chunk past its gzip budget. */
    { hostId: 'topBar', label: 'top-bar',
      mount: () => import('../../topbar/TopBar').then((m) => m.mountTopBar()) },
    { hostId: 'recentsFilterChips', label: 'recents-filter-chips', mount: () => hydrateRecentsFilterChips() },
    { hostId: 'mistakesPanel', label: 'mistakes-panel', mount: (host) => {
      return import('../../tutor/MistakeBookPanel').then(({ MistakeBookPanel }) => {
        mountOwnedRoot(host, 'mistakes-panel', <MistakeBookPanel />);
      });
    } },
    { hostId: 'teachingPlanContent', label: 'teaching-plan', mount: (host) => {
      return import('../../tutor/KnowledgePanel').then(({ TeachingPlanPanel }) => {
        mountOwnedRoot(host, 'teaching-plan', <TeachingPlanPanel />);
      });
    } },
    { hostId: 'kbContent', label: 'knowledge-map', mount: (host) => {
      return import('../../tutor/KnowledgePanel').then(({ KnowledgeMapPanel }) => {
        mountOwnedRoot(host, 'knowledge-map', <KnowledgeMapPanel />);
      });
    } },
    { hostId: 'composerToolsRoot', label: 'composer-tools-menu',
      ensureHost: (doc) => ensureBodyChild(doc, 'composerToolsRoot'),
      mount: (host) => import('../../composer/ComposerToolsMenu').then((m) => m.hydrateComposerToolsMenu(host)) },
    { hostId: 'moreNavPopoverRoot', label: 'more-popover',
      mount: () => import('../../morePopover').then((m) => m.hydrateMorePopover()) },
    { hostId: 'shareOverlay', label: 'share-modal',
      mount: () => import('../../shareModal').then((m) => m.hydrateShareModal()) },
    { hostId: 'profileOverlay', label: 'profile-modal',
      mount: () => import('../../profileModal').then((m) => m.hydrateProfileModal()) },
    { hostId: 'usageOverlay', label: 'usage-modal',
      mount: () => import('../../usageModal').then((m) => m.hydrateUsageModal()) },
    /* 3. Sidebar chrome — one root owns the header and portaled user
       footer; they share the bridge snapshot (sidebar-chrome/mount.tsx). */
    { hostId: 'sidebarHeader', label: 'sidebar-chrome', mount: () => { mountSidebarChrome(); } },
    { hostId: 'sidebarFooterActions', label: 'sidebar-footer-actions', mount: (host) => {
      return import('../../sidebar-chrome/SidebarFooterActions').then(({ SidebarFooterActions }) => {
        mountOwnedRoot(host, 'sidebar-footer-actions', <SidebarFooterActions />);
      });
    } },
    /* 4. Workspace pages — the registry tags each panel as React-owned;
       the nav mounts them on demand through pageMounts.ts. */
    { hostId: 'scheduledPanel', label: 'scheduled-page', mount: () => undefined },
    { hostId: 'libraryPanel', label: 'workspace-page', mount: () => undefined },
    { hostId: 'libraryUploadReactRoot', label: 'library-upload-input', mount: (host) => {
      return import('../../pages/workspace/LibraryUploadInput').then(({ LibraryUploadInput }) => {
        mountOwnedRoot(host, 'library-upload-input', <LibraryUploadInput />);
      });
    } },
    /* /admin operator console — the React page owns #adminPanel when
       the sidebar routes to it. */
    { hostId: 'adminPanel', label: 'admin-page', mount: () => undefined },
    { hostId: 'spacesPanel', label: 'workspace-page', mount: () => undefined },
    { hostId: 'pluginsPanel', label: 'workspace-page', mount: () => undefined },
    /* 5. Lazy portal roots */
    { hostId: 'storageModalReactRoot', label: 'storage-modal',
      ensureHost: (doc) => ensureBodyChild(doc, 'storageModalReactRoot'),
      mount: () => import('../../storageModal').then((m) => m.mountStorageModal()) },
    { hostId: 'cheatsheetReactRoot', label: 'cheatsheet',
      ensureHost: (doc) => ensureBodyChild(doc, 'cheatsheetReactRoot'),
      mount: () => import('../../cheatsheet').then((m) => m.mountCheatsheet()) },
    { hostId: 'promptTemplatesReactRoot', label: 'prompt-templates',
      ensureHost: (doc) => ensureBodyChild(doc, 'promptTemplatesReactRoot'),
      mount: () => import('../../promptTemplatesModal').then((m) => m.mountPromptTemplatesModal()) },
    /* M4 step 4.5c — confirm dialog is React-owned. The static
       index.html #confirmDialog markup was removed; the mount spec
       lazily creates the body-level root the component renders into. */
    { hostId: 'confirmDialogReactRoot', label: 'confirm-dialog',
      ensureHost: (doc) => ensureBodyChild(doc, 'confirmDialogReactRoot'),
      mount: () => import('../../confirm').then((m) => m.mountConfirmDialog()) },
    { hostId: 'chatConfigurationReactRoot', label: 'chat-configuration',
      ensureHost: (doc) => ensureBodyChild(doc, 'chatConfigurationReactRoot'),
      mount: () => import('../../chat-configuration').then((m) => m.mountChatConfiguration()) },
    { hostId: 'artifactsWorkbench', label: 'artifacts-workbench',
      mount: () => import('../../workbench/WorkbenchDrawer').then(({ WorkbenchDrawer }) => {
        const el = document.getElementById('artifactsWorkbench');
        if (el) {
          mountOwnedRoot(el, 'artifacts-workbench', <WorkbenchDrawer />);
        }
      }) },
    /* 5. Lazy portal roots. The session list mounts into the existing
       `#recentsList` host (mountSessionList targets that id directly);
       the hostId must match it or the registry skips the spec and the
       Recents list stays empty. */
    { hostId: 'recentsList', label: 'session-list',
      mount: () => mountSessionList() },
    /* 6. Global React roots — composer, message list, workflow layer.
       P_perf-composer-lazy — RichComposer pulls the whole tiptap/prosemirror
       editor chain (vendor-editor, ~460 KB). Mount it via dynamic import so
       that chunk leaves the first-paint preload graph; the shell's composer
       area keeps its reserved height until the component mounts moments
       after reveal.
       P_composer-single — ONE editor for the whole app. The typed controller
       owns the surface state and slot placement while this root stays
       mounted, preserving each draft, token, focus and chip. The typed
       lifecycle commands branch on the live surface, so the editor does not
       remount when the view flips. */
    { hostId: 'composerInputWrap', label: 'composer-shell', mount: (host) => {
      return import('../../composer-input').then(({ ComposerShell }) => {
        mountOwnedRoot(host, 'composer-shell', <ErrorBoundary><ComposerShell
          placeholder={i18n('topic.inputPlaceholder', 'What would you like to explore?')}
          onSubmit={() => submitComposer(legacyComposer)}
          onPrimarySubmit={() => submitPrimaryComposer(legacyComposer)}
          onStop={() => legacyComposer.stopChatResponse()}
          onEscape={() => handleComposerEscape(legacyComposer)} /></ErrorBoundary>);
      });
    } },
    { hostId: 'workflowLayerReactRoot', label: 'workflow-layer',
      ensureHost: ensureWorkflowHost,
      mount: (host) => {
        return import('../../extensions/WorkflowLayer').then(({ WorkflowLayer }) => {
          mountOwnedRoot(host, 'workflow-layer', <ErrorBoundary><WorkflowLayer /></ErrorBoundary>);
        });
      } },

  ];
}
