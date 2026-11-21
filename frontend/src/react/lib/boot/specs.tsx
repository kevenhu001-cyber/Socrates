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
import { retryImport } from './retryImport';
import { mountBasicComposer, releaseBasicComposer } from '../../ui/composerRecovery';

/* on-demand overlays (tools menu, cmdk, find,
   more-popover, share/usage modals) are dynamically imported in
   their mount callbacks below so their module graph stays out of the
   entry chunk; they still mount during the boot registry pass, just a
   tick later. RN sidebar and transcript hosts are reserved while their
   rendering trees load, independently of authentication/config requests. */
import { hydrateRecentsFilterChips } from '../../sidebar/RecentsFilterChips';
import { getLegacyActions, i18n } from '../../legacy/gateway.ts';
import {
  handleComposerEscape,
  submitComposer,
  submitPrimaryComposer,
} from '../../composer-input/lifecycle';

import { NewReplyPill } from './indicatorComponents';
import { createMountContainer } from './mountContainer';

const chrome = createMountContainer('chrome-container');
const content = createMountContainer('content-container');

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

function workspacePageSpecs(): MountSpec[] {
  return [
    { hostId: 'scheduledPanel', label: 'scheduled-page', mount: () => undefined },
    { hostId: 'libraryPanel', label: 'workspace-page', mount: () => undefined },
    content('libraryUploadReactRoot', 'library-upload-input', () =>
      import('../../pages/workspace/LibraryUploadInput').then((m) => m.LibraryUploadInput),
    ),
    { hostId: 'adminPanel', label: 'admin-page', mount: () => undefined },
    { hostId: 'spacesPanel', label: 'workspace-page', mount: () => undefined },
    { hostId: 'pluginsPanel', label: 'workspace-page', mount: () => undefined },
  ];
}

function lazyPortalSpecs(): MountSpec[] {
  return [
    {
      hostId: 'storageModalReactRoot',
      label: 'storage-modal',
      ensureHost: (doc) => ensureBodyChild(doc, 'storageModalReactRoot'),
      mount: () => import('../../storageModal').then((m) => m.mountStorageModal()),
    },
    {
      hostId: 'cheatsheetReactRoot',
      label: 'cheatsheet',
      ensureHost: (doc) => ensureBodyChild(doc, 'cheatsheetReactRoot'),
      mount: () => import('../../cheatsheet').then((m) => m.mountCheatsheet()),
    },
    {
      hostId: 'promptTemplatesReactRoot',
      label: 'prompt-templates',
      ensureHost: (doc) => ensureBodyChild(doc, 'promptTemplatesReactRoot'),
      mount: () => import('../../promptTemplatesModal').then((m) => m.mountPromptTemplatesModal()),
    },
    {
      hostId: 'confirmDialogReactRoot',
      label: 'confirm-dialog',
      ensureHost: (doc) => ensureBodyChild(doc, 'confirmDialogReactRoot'),
      mount: () => import('../../confirm').then((m) => m.mountConfirmDialog()),
    },
    {
      hostId: 'chatConfigurationReactRoot',
      label: 'chat-configuration',
      ensureHost: (doc) => ensureBodyChild(doc, 'chatConfigurationReactRoot'),
      mount: () => import('../../chat-configuration').then((m) => m.mountChatConfiguration()),
    },
  ];
}

/** Resolve once the main thread is idle (bounded), for roots off the first-paint path. */
function whenIdle(timeout = 1200): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function')
      window.requestIdleCallback(() => resolve(), { timeout });
    else window.setTimeout(resolve, 200);
  });
}

function overlayAndModalSpecs(): MountSpec[] {
  return [
    chrome('cookieConsentReactRoot', 'cookie-consent', () =>
      import('../../cookieConsent/CookieConsent').then((m) => m.CookieConsent),
    ),
    {
      hostId: 'cmdKReactRoot',
      label: 'cmd-k',
      ensureHost: (doc) => ensureBodyChild(doc, 'cmdKReactRoot'),
      mount: () => import('../../cmdk/CommandPalette').then((m) => m.mountCmdK()),
    },
    {
      hostId: 'findBar',
      label: 'find-in-session',
      mount: () =>
        import('../../find-in-session/FindInSession').then((m) => m.hydrateFindInSession()),
    },
    {
      hostId: 'composerToolsRoot',
      label: 'composer-tools-menu',
      ensureHost: (doc) => ensureBodyChild(doc, 'composerToolsRoot'),
      mount: (host) =>
        import('../../composer/ComposerToolsMenu').then((m) => m.hydrateComposerToolsMenu(host)),
    },
    {
      hostId: 'moreNavPopoverRoot',
      label: 'more-popover',
      mount: () => import('../../morePopover').then((m) => m.hydrateMorePopover()),
    },
    {
      hostId: 'shareModalReactRoot',
      label: 'share-modal',
      ensureHost: (doc) => ensureBodyChild(doc, 'shareModalReactRoot'),
      mount: () => import('../../shareModal').then((m) => m.mountShareModal()),
    },
    {
      hostId: 'usageModalReactRoot',
      label: 'usage-modal',
      ensureHost: (doc) => ensureBodyChild(doc, 'usageModalReactRoot'),
      mount: () => import('../../usageModal').then((m) => m.mountUsageModal()),
    },
  ];
}

function composerShellSpec(
  legacyComposer: ReturnType<typeof getLegacyActions>['composer'],
): MountSpec {
  return {
    hostId: 'composerInputWrap',
    label: 'composer-shell',
    mount: async (host) => {
      const showBasicEditor = window.setTimeout(() => {
        if (host.isConnected) mountBasicComposer(host);
      }, 300);
      try {
        const { ComposerShell } = await retryImport(() => import('../../composer-input'));
        if (document.getElementById('composerInputWrap') !== host) {
          releaseBasicComposer(host);
          return false;
        }
        mountOwnedRoot(
          host,
          'composer-shell',
          <ErrorBoundary>
            <ComposerShell
              placeholder={i18n('topic.inputPlaceholder', 'What would you like to explore?')}
              onSubmit={() => submitComposer(legacyComposer)}
              onPrimarySubmit={() => submitPrimaryComposer(legacyComposer)}
              onStop={() => legacyComposer.stopChatResponse()}
              onEscape={() => handleComposerEscape(legacyComposer)}
            />
          </ErrorBoundary>,
        );
        releaseBasicComposer(host);
      } finally {
        window.clearTimeout(showBasicEditor);
        if (!host.isConnected) releaseBasicComposer(host);
      }
    },
  };
}

export function mountRegistryList(): MountSpec[] {
  const legacyComposer = getLegacyActions().composer;
  return [
    /* 1. Bootstrap seeds the chat runtime store before this registry
       runs, so every root can subscribe during mount. */
    {
      hostId: 'msgList',
      label: 'msg-list',
      mount: (host) =>
        import('../../message-list/MessageList').then(({ mountMessageList }) => {
          // A read-only shared transcript intentionally retains its own owner.
          return document.getElementById('msgList') === host && mountMessageList().root !== null;
        }),
    },
    {
      hostId: 'newReplyPill',
      label: 'new-reply-pill',
      mount: (host) => {
        hydrateOwnedRoot(
          host,
          'new-reply-pill',
          <StrictMode>
            <NewReplyPill host={host} />
          </StrictMode>,
        );
      },
    },
    /* 2. Overlays / modals / popovers */
    ...overlayAndModalSpecs(),
    {
      hostId: 'sidebarNav',
      label: 'sidebar-nav',
      mount: (host) =>
        import('../../sidebar/SidebarNav').then(({ mountSidebarNav }) => {
          return document.getElementById('sidebarNav') === host && mountSidebarNav();
        }),
    },
    chrome('sidebarSearchRow', 'sidebar-search-row', () =>
      import('../../sidebar-chrome/SidebarSearchRow').then((m) => m.SidebarSearchRow),
    ),
    /* RN-1 — the landing empty state is React Native (packages/ui/src/home)
       rendered through react-native-web; the lazy import keeps RNW out of
       the entry chunk. */
    content('homeHero', 'home-hero', () =>
      import('../../home/HomeStartComponents').then((m) => m.HomeHeroRoot),
    ),
    content('learningModeBar', 'learning-mode-bar', () =>
      whenIdle().then(() =>
        import('../../tutor/QuestionChainRoot').then((m) => m.SessionLearningModes),
      ),
    ),
    {
      hostId: 'topBar',
      label: 'top-bar',
      mount: () => import('../../topbar/TopBar').then((m) => m.mountTopBar()),
    },
    {
      hostId: 'recentsFilterChips',
      label: 'recents-filter-chips',
      mount: () => hydrateRecentsFilterChips(),
    },
    content('mistakesPanel', 'mistakes-panel', () =>
      import('../../tutor/MistakeBookPanel').then((m) => m.MistakeBookPanel),
    ),
    content('teachingPlanContent', 'teaching-plan', () =>
      import('../../tutor/KnowledgePanel').then((m) => m.TeachingPlanPanel),
    ),
    content('kbContent', 'knowledge-map', () =>
      import('../../tutor/KnowledgePanel').then((m) => m.KnowledgeMapPanel),
    ),
    /* 3. Sidebar chrome — one root owns the header and portaled user
       footer; they share the bridge snapshot (sidebar-chrome/mount.tsx). */
    {
      hostId: 'sidebarHeader',
      label: 'sidebar-chrome',
      mount: (host) =>
        import('../../sidebar-chrome/mount').then(({ mountSidebarChrome }) => {
          if (document.getElementById('sidebarHeader') !== host) return false;
          mountSidebarChrome();
        }),
    },
    chrome('sidebarFooterActions', 'sidebar-footer-actions', () =>
      import('../../sidebar-chrome/SidebarFooterActions').then((m) => m.SidebarFooterActions),
    ),
    /* 4. Workspace pages */
    ...workspacePageSpecs(),
    /* 5. Lazy portal roots */
    ...lazyPortalSpecs(),
    {
      hostId: 'recentsList',
      label: 'session-list',
      mount: (host) =>
        import('../../session-list').then(({ mountSessionList }) => {
          if (document.getElementById('recentsList') !== host) return false;
          mountSessionList();
        }),
    },
    /* 6. Global React roots — composer, message list, workflow layer. */
    composerShellSpec(legacyComposer),
    content(
      'workflowLayerReactRoot',
      'workflow-layer',
      () => import('../../extensions/WorkflowLayer').then((m) => m.WorkflowLayer),
      ensureWorkflowHost,
    ),
  ];
}
