/**
 * Root React application container for Socrates.
 * Consolidates the multi-root architecture into a single coherent React tree.
 */
import { lazy, Suspense } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { AuthGate } from './auth/AuthGate';
import { TopBar } from './topbar/TopBar';
import { SidebarHeader } from './sidebar-chrome/SidebarHeader';
import { SidebarNav } from './sidebar/SidebarNav';
import { SidebarSearchRow } from './sidebar-chrome/SidebarSearchRow';
import { SidebarFooterActions } from './sidebar-chrome/SidebarFooterActions';
import { RecentsFilterChips } from './sidebar/RecentsFilterChips';
import { SessionList } from './session-list';
import { MistakeBookPanel } from './tutor/MistakeBookPanel';
import { KnowledgeMapPanel, TeachingPlanPanel } from './tutor/KnowledgePanel';
import { MorePopover } from './morePopover/MorePopover';
import { MessageList } from './message-list/MessageList';
import { ComposerShell } from './composer-input';
import { NewReplyPill } from './lib/boot/indicatorComponents';
import { HomeHeroRoot } from './home/HomeStartComponents';
import { SessionLearningModes } from './tutor/QuestionChainRoot';
import { useSessionStore } from '../store/index.ts';
import { useNavigationStore } from '../sidebar/navigation.store.ts';
import { isWorkspacePage, type WorkspacePage as WorkspacePageKey } from '../sidebar/navigation.destinations';
import { getLegacyActions, i18n } from './legacy/gateway.ts';
import { handleComposerEscape, submitComposer, submitPrimaryComposer } from './composer-input/lifecycle.ts';

const WorkspacePage = lazy(() =>
  import('./pages/workspace/WorkspacePage').then((m) => ({ default: m.WorkspacePage }))
);
const ScheduledPage = lazy(() =>
  import('./pages/scheduled/ScheduledPage').then((m) => ({ default: m.ScheduledPage }))
);
const AdminPage = lazy(() =>
  import('./adminModal/AdminPage').then((m) => ({ default: m.AdminPage }))
);
const ExamView = lazy(() =>
  import('./exam/ExamView').then((m) => ({ default: m.ExamView }))
);
const WorkflowLayer = lazy(() =>
  import('./extensions/WorkflowLayer').then((m) => ({ default: m.WorkflowLayer }))
);
const CommandPalette = lazy(() =>
  import('./cmdk/CommandPalette').then((m) => ({ default: m.CommandPalette }))
);
const FindInSession = lazy(() =>
  import('./find-in-session/FindInSession').then((m) => ({ default: m.FindInSession }))
);
const CookieConsent = lazy(() =>
  import('./cookieConsent/CookieConsent').then((m) => ({ default: m.CookieConsent }))
);

export function App() {
  const activeDestination = useNavigationStore((state) => state.activeDestination);
  const messages = useSessionStore((state) => state.messages);
  const legacyComposer = getLegacyActions().composer;

  const hasMessages = messages && messages.length > 0;
  const isWorkspace = activeDestination && isWorkspacePage(activeDestination);
  const isScheduled = activeDestination === 'scheduled';
  const isAdmin = activeDestination === 'admin';
  const isExam = activeDestination === 'exam';

  return (
    <ErrorBoundary>
      <div className="auth-gate hidden" id="authGate" role="dialog" aria-modal="true" aria-label="Sign in">
        <AuthGate />
      </div>

      <div className="app" id="appShell">
        <aside className="sidebar" id="sidebar">
          <div className="sidebar-inner">
            <div className="sidebar-header" id="sidebarHeader">
              <SidebarHeader />
            </div>
            <nav className="sidebar-nav" id="sidebarNav" aria-label="Primary navigation">
              <SidebarNav />
            </nav>
            <div className="sidebar-nav-sep" role="separator" aria-orientation="horizontal" />
            <div id="moreNavPopoverRoot">
              <MorePopover />
            </div>
            <div className="sidebar-search-row" id="sidebarSearchRow">
              <SidebarSearchRow />
            </div>
            <div className="knowledge-panel tutor-only" id="knowledgePanel">
              <div id="teachingPlanContent">
                <TeachingPlanPanel />
              </div>
              <div id="kbContent">
                <KnowledgeMapPanel />
              </div>
            </div>
            <div className="recents-panel" id="recentsPanel">
              <div className="recents-header" />
              <div className="recents-filter-chips" id="recentsFilterChips">
                <RecentsFilterChips />
              </div>
              <div id="recentsList">
                <SessionList />
              </div>
            </div>
            <div className="recents-panel tutor-only sidebar-mistake-panel" id="mistakesPanel">
              <MistakeBookPanel />
            </div>

            <div className="sidebar-footer" id="sidebarFooter">
              <div className="user-row" id="sidebarUserRow">
                <div className="user-avatar" aria-hidden="true">?</div>
                <div className="user-identity">
                  <div className="user-name" />
                  <div className="user-plan">Free</div>
                </div>
              </div>
              <div className="sidebar-footer-actions" id="sidebarFooterActions">
                <SidebarFooterActions />
              </div>
            </div>
            <div
              className="sidebar-resize-handle"
              id="sidebarResizeHandle"
              aria-label="Drag to resize sidebar"
              title="Drag to resize sidebar"
            />
          </div>
        </aside>
        <div className="sidebar-backdrop" id="sidebarBackdrop" aria-hidden="true" />

        <main className="main">
          <div className="main-bg" aria-hidden="true" />
          <div className="top-bar" id="topBar">
            <TopBar />
          </div>

          <div className="main-content" id="mainContent" tabIndex={-1}>
            <div className="main-inner" id="mainInner">
              {/* Landing Home / Greeting View */}
              <div className={`topic-setup${hasMessages || activeDestination ? ' hidden' : ''}`} id="topicSetup">
                <div className="home-hero" id="homeHero">
                  <HomeHeroRoot />
                </div>
                <p className="topic-sub" id="topicSub" />
                <div className="topic-composer-slot composer-slot" id="topicComposerSlot">
                  {!hasMessages && !activeDestination && (
                    <div className="composer-input-wrap composer-shell" id="composerInputWrap">
                      <ComposerShell
                        placeholder={i18n('topic.inputPlaceholder', 'What would you like to explore?')}
                        onSubmit={() => submitComposer(legacyComposer)}
                        onPrimarySubmit={() => submitPrimaryComposer(legacyComposer)}
                        onStop={() => legacyComposer.stopChatResponse()}
                        onEscape={() => handleComposerEscape(legacyComposer)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Workspace Pages */}
              {isWorkspace && (
                <Suspense fallback={<div className="workspace-loading">Loading…</div>}>
                  <WorkspacePage page={activeDestination as WorkspacePageKey} />
                </Suspense>
              )}

              {/* Scheduled Page */}
              {isScheduled && (
                <Suspense fallback={<div className="workspace-loading">Loading…</div>}>
                  <ScheduledPage />
                </Suspense>
              )}

              {/* Admin Console */}
              {isAdmin && (
                <Suspense fallback={<div className="admin-loading">Loading…</div>}>
                  <AdminPage />
                </Suspense>
              )}
            </div>

            {/* Exam View */}
            {isExam && (
              <Suspense fallback={null}>
                <div className="exam-view" id="examView">
                  <div className="exam-view-root" id="examViewReactRoot">
                    <ExamView />
                  </div>
                </div>
              </Suspense>
            )}

            {/* Conversation Chat View */}
            <div className={`chat-page${!hasMessages || activeDestination ? ' hidden' : ''}`} id="chatPage">
              <div className="msg-list" id="msgList">
                <MessageList />
              </div>
              <div className="chat-view chat-view-lifted" id="chatView">
                <Suspense fallback={null}>
                  <div className="find-bar hidden" id="findBar" role="search">
                    <FindInSession />
                  </div>
                </Suspense>
                <div className="chat-input-bar" id="chatInputBar">
                  <div className="learning-mode-bar tutor-only" id="learningModeBar">
                    <SessionLearningModes />
                  </div>
                  <div className="new-reply-pill" id="newReplyPill" role="button" tabIndex={0} aria-label="Jump to new reply">
                    <NewReplyPill />
                  </div>
                  <div className="chat-composer-slot composer-slot" id="chatComposerSlot">
                    {hasMessages && !activeDestination && (
                      <div className="composer-input-wrap composer-shell" id="composerInputWrap">
                        <ComposerShell
                          placeholder={i18n('topic.inputPlaceholder', 'What would you like to explore?')}
                          onSubmit={() => submitComposer(legacyComposer)}
                          onPrimarySubmit={() => submitPrimaryComposer(legacyComposer)}
                          onStop={() => legacyComposer.stopChatResponse()}
                          onEscape={() => handleComposerEscape(legacyComposer)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="sources-panel hidden" id="sourcesPanel" aria-label="Sources" role="complementary" />
          <div className="sources-backdrop hidden" id="sourcesBackdrop" aria-hidden="true" />
        </main>
      </div>

      {/* Global Overlays & Modals */}
      <Suspense fallback={null}>
        <div id="cmdKReactRoot">
          <CommandPalette />
        </div>
        <div id="cookieConsentReactRoot">
          <CookieConsent />
        </div>
        <div id="workflowLayerReactRoot">
          <WorkflowLayer />
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
