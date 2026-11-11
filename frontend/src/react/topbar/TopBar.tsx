import { useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import '../rn/rnwGlobal';
import { Button } from '../ui/shadcn/button';
import { i18n } from '../legacy/gateway.ts';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import { useExamStore, useSessionStore, useUiStore } from '../../store/index.ts';
import { openChatConfiguration, useChatConfigurationSnapshot } from '../chat-configuration/chatConfiguration.bridge';
import { useActiveModelLabel, useStoredReasoningEffort } from '../chat-configuration/useChatConfigurationLabels';
import { effortLabel } from '../chat-configuration/ChatConfigurationPanels';
import { toggleSidebar } from '../../sidebar/sidebar.service.ts';
import { startNewChat, toggleIncognito } from '../../app/lifecycle.ts';
import { toggleAppMode } from '../../app/lifecycle/mode.ts';
import { openFindInSession } from '../find-in-session/findInSession.actions.ts';
import { openShareModal } from '../../ui/share.ts';
import { useAppMode } from '../app-mode/useAppMode.ts';
import { useIncognito } from '../app-mode/useIncognito.ts';
import { useSidebarStore } from '../../sidebar/sidebar.store.ts';
import { useMobileViewport } from '../sidebar-chrome/useMobileViewport.ts';
import { WebUiTheme } from '../rn/WebUiTheme';
import { TopBarAction, TopBarModelSwitcher, TopBarModeSwitch, TopBarPracticeProgress, TopBarStageProgress } from '@socrates/ui/shell';
import { getActiveSocraticStage, stageName, SOCRATIC_STAGES } from '../../tutor/socraticStages.ts';
import { useConversationActive } from './useConversationActive.ts';
import { useTopbarState } from './topbarStore.ts';

/**
 * TopBar — the header chrome. RN-7: the controls are the shared React
 * Native shell parts (packages/ui/src/shell), drawn in the marketing site's
 * chrome language; this host keeps the web layout groups (`.top-bar-left`,
 * `.top-mode-switch`, `.top-bar-right`) that the shell's page-level CSS
 * places and hides per surface, and renders everything from stores:
 *
 *   share / find      topbarStore (published by ui/share.impl.ts)
 *   tutor stage       app mode + the session's user-turn count
 *   practice          session store
 *   mode switch       app mode, hidden while a conversation runs
 *
 * Ids are the shell contract (`#topModelSwitcher`, `#findBtn`, `#shareBtn`,
 * `#topModeChat`, `#topModeTutor`, …) and stay on the interactive elements.
 * The sidebar toggle, the exam title and the plugin tabs stay web nodes:
 * the sidebar and workspace surfaces own them.
 */

const CHROME_BUTTON = 'active:not-aria-[haspopup]:translate-y-0';

function t(key: string, fallback: string): string {
  return i18n(key, fallback);
}

function subscribeReducedMotion(listener: () => void): () => void {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
function readReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
}

function subscribeNarrow(listener: () => void): () => void {
  const query = window.matchMedia('(max-width: 359px)');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
/** Phones under 360px leave only ~76px beside the centred mode track. */
function useNarrowPhone(): boolean {
  return useSyncExternalStore(subscribeNarrow, () => window.matchMedia('(max-width: 359px)').matches, () => false);
}

function anchor(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/* ── Left: sidebar toggle · model switcher · tutor pill · exam title ───── */

function SidebarToggle() {
  const isOpen = useSidebarStore((snapshot) => snapshot.isOpen);
  const isMobile = useMobileViewport();
  const labelKey = isMobile
    ? (isOpen ? 'chrome.collapseSidebar' : 'chrome.expandSidebar')
    : (isOpen ? 'chrome.closeSidebar' : 'chrome.openSidebar');
  const titleKey = isMobile
    ? (isOpen ? 'chrome.collapseSidebarKbd' : 'chrome.expandSidebarKbd')
    : (isOpen ? 'chrome.closeSidebarKbd' : 'chrome.openSidebarKbd');
  const label = t(labelKey, isMobile ? (isOpen ? 'Collapse sidebar' : 'Expand sidebar') : (isOpen ? 'Close sidebar' : 'Open sidebar'));
  const title = t(titleKey, `${label}${isMobile ? '' : ' (⌘B)'}`);
  return (
    <Button
      variant="ghost"
      className={`toggle-sidebar cg-circle-btn ${CHROME_BUTTON}`}
      id="sidebarOpenBtn"
      title={title}
      aria-label={label}
      data-i18n-title={titleKey}
      data-i18n-aria={labelKey}
      aria-controls="sidebar"
      aria-expanded={isOpen}
      style={{ display: isMobile ? (isOpen ? 'none' : undefined) : 'none' }}
      onClick={() => toggleSidebar()}
    >
      {/* Reference phone glyph: a soft frame with a short rail stroke, drawn at 20px. */}
      <svg className="glyph-panel" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="2.75" y="4.25" width="18.5" height="15.5" rx="4.5" /><path d="M8 9v6" /></svg>
      {/* Phone navigation uses the reference's quiet, two-line menu glyph. */}
      <svg className="glyph-hamburger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M4 8h16" /><path d="M4 15h11" /></svg>
      <span className="mobile-sidebar-status" aria-hidden="true" />
    </Button>
  );
}

/**
 * The top-left model switcher opens the shared chat-configuration popover
 * (model · reasoning effort · speed). The visible model name is part of the
 * accessible name (WCAG 2.5.3). Phones show the compact model chip on the
 * new-chat screen. During a conversation the header has no room beside the
 * centred mode switch and session actions, so the composer effort pill stays
 * the model-settings path.
 */
function ModelSwitcher({ phone, conversationActive }: { phone: boolean; conversationActive: boolean }) {
  const snapshot = useChatConfigurationSnapshot();
  const modelLabel = useActiveModelLabel();
  const effort = useStoredReasoningEffort();
  const purpose = t('topbar.modelSwitcher', 'Model and reasoning');
  const visibleLabel = ['Socrates', modelLabel].filter(Boolean).join(' ');
  const narrow = useNarrowPhone();
  return (
    <TopBarModelSwitcher
      narrow={phone && narrow}
      brand="Socrates"
      model={modelLabel}
      accessibilityLabel={`${visibleLabel} — ${purpose}${modelLabel ? '' : ` · ${effortLabel(effort)}`}`}
      expanded={snapshot.open && snapshot.triggerId === 'topModelSwitcher'}
      compact={phone}
      visible={!phone || !conversationActive}
      onPress={() => {
        const trigger = anchor('topModelSwitcher');
        if (trigger) openChatConfiguration(trigger);
      }}
    />
  );
}

/** Practice progress belongs to a tutor conversation (it was a `tutor-only` chip). */
function PracticeProgress({ phone, conversationActive }: { phone: boolean; conversationActive: boolean }) {
  const mode = useAppMode();
  const phase = useSessionStore((snapshot) => snapshot.practicePhase);
  const attempts = useSessionStore((snapshot) => snapshot.practiceAttempts);
  if (!phase || mode !== 'tutor' || phone || !conversationActive) return null;
  const phaseLabel = phase === 'foundation'
    ? i18n('tutor.practiceFoundation', '基础')
    : i18n('tutor.practiceTransfer', '变式');
  return (
    <TopBarPracticeProgress
      phase={phaseLabel}
      attempts={i18n('tutor.practiceAttempts', '{n} attempt(s)').replace('{n}', String(attempts || 0))}
    />
  );
}

/** Tutor stage, derived from the session (no DOM writes). Phones leave it to the conversation. */
function StageProgress({ phone, conversationActive }: { phone: boolean; conversationActive: boolean }) {
  const mode = useAppMode();
  const teachingStage = useSessionStore((snapshot) => snapshot.teachingStage);
  if (mode !== 'tutor' || phone || !conversationActive) return null;
  const stage = getActiveSocraticStage(teachingStage);
  const total = SOCRATIC_STAGES.length;
  return (
    <TopBarStageProgress
      stage={stageName(t(stage.labelKey, stage.defaultLabel))}
      step={stage.step}
      total={total}
      progressLabel={t('tutor.mastery.progress', 'Step {n} of {total}').replace('{n}', String(stage.step)).replace('{total}', String(total))}
      title={t('tutor.mastery.title', 'Socratic Stage')}
    />
  );
}

function ExamTitle() {
  const isInView = useUiStore((snapshot) => snapshot._examInView);
  const topic = useExamStore((snapshot) => snapshot.examTopic);
  const submitted = useExamStore((snapshot) => snapshot.examSubmitted);
  const mode = useExamStore((snapshot) => snapshot.examViewMode);
  const localeRevision = useExamStore((snapshot) => snapshot.examLocaleRevision);
  const label = submitted
    ? `${i18n('exam.results', 'Exam Results: {topic}').replace('{topic}', '')}${topic}`
    : mode === 'cancelled'
      ? i18n('exam.cancelledTitle', 'Cancelled')
      : mode === 'form' || mode === 'provider-required'
        ? i18n('exam.generate', 'Generate Exam')
        : topic || i18n('exam.generate', 'Generate Exam');
  return <span className={`exam-title-bar${isInView ? '' : ' hidden'}`} id="examTitleBar" data-exam-only="true" data-locale-revision={localeRevision}>{label}</span>;
}

/**
 * Phone conversation header, after the reference: drawer · new chat ·
 * title. The title is the session's own (its saved title, else its topic);
 * desktop keeps the model lockup in this slot instead.
 */
function ConversationTitle({ phone, conversationActive }: { phone: boolean; conversationActive: boolean }) {
  const title = useSessionStore((snapshot) => snapshot.sessionTitle || snapshot.topic);
  if (!phone || !conversationActive || !title) return null;
  return <span className="top-conversation-title" id="topConversationTitle" title={title}>{title}</span>;
}

function TopBarLeft({ phone, conversationActive }: { phone: boolean; conversationActive: boolean }) {
  return (
    <div className="top-bar-left">
      <SidebarToggle />
      <WebUiTheme>
        <span className="mobile-newchat-btn" data-topbar-slot="new-chat">
          <TopBarAction
            id="mobileNewChatBtn"
            icon="compose"
            label={t('sidebar.nav.new', 'New chat')}
            touch
            /* Reference: the compose glyph is a size smaller than the drawer glyph. */
            iconSize={18}
            visible={phone && conversationActive}
            onPress={() => { void startNewChat(); }}
          />
        </span>
        {/* 新聊天页显示模型 chip；手机对话中隐藏它以给标题和会话操作留空间。
            样式槽位按 body[data-conversation-active] 同步隐藏，不必等待
            store 推导后的下一次 React 渲染。 */}
        <span className="top-model-slot" data-topbar-slot="model">
          <ModelSwitcher phone={phone} conversationActive={conversationActive} />
        </span>
        <PracticeProgress phone={phone} conversationActive={conversationActive} />
        <StageProgress phone={phone} conversationActive={conversationActive} />
      </WebUiTheme>
      <ConversationTitle phone={phone} conversationActive={conversationActive} />
      <ExamTitle />
    </div>
  );
}

/* ── Center: the 聊天 / 辅导 segmented control ─────────────────────────── */

/**
 * The 聊天 / 辅导 segmented control, centred in the header by its web
 * wrapper (`.top-mode-switch`). Selecting a mode mid-conversation asks for
 * confirmation first (app/lifecycle/mode.ts); the control is hidden while a
 * conversation runs. Arrow keys move between the two tabs.
 */
function ModeSwitch({ phone, conversationActive }: { phone: boolean; conversationActive: boolean }) {
  const mode = useAppMode();
  const reducedMotion = useReducedMotion();
  const narrow = useNarrowPhone();
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
    const index = options.findIndex((option) => option.contains(event.target as Node));
    if (index < 0) return;
    event.preventDefault();
    const next = options[(index + (event.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
    next?.focus();
    const targetMode = next?.dataset.mode;
    if (targetMode) void toggleAppMode(targetMode);
  };
  return (
    <div className="top-mode-switch" data-active={mode} hidden={conversationActive} style={conversationActive ? { display: 'none' } : undefined} onKeyDown={onKeyDown}>
      <WebUiTheme>
        <TopBarModeSwitch
          value={mode}
          options={[
            { id: 'topModeChat', mode: 'chat', label: t('tutor.modeChat', '聊天') },
            { id: 'topModeTutor', mode: 'tutor', label: t('tutor.modeTutor', '辅导') },
          ]}
          accessibilityLabel={t('chrome.sessionMode', 'Session mode')}
          visible={!conversationActive}
          compact={phone}
          narrow={phone && narrow}
          reducedMotion={reducedMotion}
          thumbShadow={phone ? 'var(--ui-segment-thumb-shadow)' : 'var(--ui-elevation-raised)'}
          onSelect={(next) => { void toggleAppMode(next); }}
        />
      </WebUiTheme>
    </div>
  );
}

/* ── Right: find · share ──────────────────────────────────────────────── */

/** Incognito is opened from More; this hidden state mirror stays in sync with that action. */
function IncognitoAction() {
  const on = useIncognito();
  return (
    <TopBarAction
      id="mobileIncognitoBtn"
      icon="incognito"
      label={t('sidebar.nav.incognito', 'Incognito chat')}
      pressed={on}
      touch
      visible={false}
      onPress={() => { void toggleIncognito(); }}
    />
  );
}

function TopBarRight({ phone }: { phone: boolean }) {
  const { conversationActions, sharedView } = useTopbarState();
  return (
    <div className="top-bar-right">
      <WebUiTheme>
        <IncognitoAction />
        <TopBarAction
          id="findBtn"
          icon="search"
          label={t('find.title', 'Find in conversation')}
          touch={phone}
          visible={conversationActions}
          onPress={openFindInSession}
        />
        <TopBarAction
          id="shareBtn"
          icon="share"
          label={t('chrome.shareConversation', 'Share this conversation')}
          touch={phone}
          visible={conversationActions && !sharedView}
          onPress={() => openShareModal()}
        />
      </WebUiTheme>
    </div>
  );
}

/* ── Workspace tabs ────────────────────────────────────────────────────── */

function PluginWorkspaceTabs() {
  return (
    <div className="top-mode-tabs plugin-workspace-tabs" id="pluginWorkspaceTabs" role="tablist" aria-label="Plugin workspace" data-i18n-aria="chrome.pluginWorkspace" hidden>
      <Button variant="ghost" className={`plugin-workspace-tab active ${CHROME_BUTTON}`} id="pluginWorkspacePluginsTab" role="tab" aria-selected="true" data-i18n-key="plugins.pluginsTab">{t('plugins.pluginsTab', '插件')}</Button>
      <Button variant="ghost" className={`plugin-workspace-tab ${CHROME_BUTTON}`} id="pluginWorkspaceSkillsTab" role="tab" aria-selected="false" data-i18n-key="plugins.skillsTab">{t('plugins.skillsTab', '技能')}</Button>
    </div>
  );
}

/* The host `<div class="top-bar" id="topBar">` already carries the bar
   layout, so the tree renders its children into it rather than nesting a
   second `.top-bar` (which would become one opaque flex item and collapse
   the left/right groups to zero width). */
export function TopBar() {
  const phone = useMobileViewport();
  const conversationActive = useConversationActive();
  return (
    <>
      <PluginWorkspaceTabs />
      <TopBarLeft phone={phone} conversationActive={conversationActive} />
      <ModeSwitch phone={phone} conversationActive={conversationActive} />
      <TopBarRight phone={phone} />
    </>
  );
}

export function mountTopBar(): boolean {
  const host = document.getElementById('topBar');
  if (!host) return false;
  mountOwnedRoot(host, 'top-bar', <TopBar />);
  return true;
}
