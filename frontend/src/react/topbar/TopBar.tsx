import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
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
import { useConversationActive } from './useConversationActive.ts';

/**
 * TopBar — the React-owned header chrome.
 *
 * index.html keeps `<div class="top-bar" id="topBar">` as the host; every
 * control inside it is rendered here. The ids are part of the shell contract
 * (`#topModelSwitcher`, `#findBtn`, `#shareBtn`, `#topModeSwitch`, …): the
 * legacy runtime still toggles a few shell visibility classes. The visible
 * model name and its accessible copy are derived from provider and preference
 * snapshots; React owns those values with the button itself.
 *
 * Shell layout and custom model/action geometry stay in parity/topbar.css;
 * the mode option buttons own their 36px control geometry through shadcn
 * variants and token classes (docs/adr/0024-shadcn-shell-geometry-ownership.md).
 */

/** Controls keep the shell's own rules as their surface marker. */
const CHROME_BUTTON = 'active:not-aria-[haspopup]:translate-y-0';
const MODE_OPTION = [
  'top-mode-switch-option min-w-[104px] rounded-full border-0 bg-transparent px-[var(--ui-space-md)]',
  'text-muted-foreground leading-[var(--ui-text-ui-line)] cursor-pointer transition-colors',
  'duration-(--ui-duration-hover) hover:bg-transparent hover:text-foreground aria-selected:text-foreground',
].join(' ');

function t(key: string, fallback: string): string {
  return i18n(key, fallback);
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
      <svg className="glyph-panel" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M9 4.5v15" /></svg>
      {/* The phone drawer shows the reference's three-line hamburger. */}
      <svg className="glyph-hamburger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M5 7h14" /><path d="M5 12h14" /><path d="M5 17h14" /></svg>
      <span className="mobile-sidebar-status" aria-hidden="true" />
    </Button>
  );
}

/**
 * The top-left model switcher opens the shared chat-configuration popover
 * (model · reasoning effort · speed). React includes the visible model name
 * in the accessible name to satisfy WCAG 2.5.3 (label in name).
 */
function ModelSwitcher() {
  const snapshot = useChatConfigurationSnapshot();
  const modelLabel = useActiveModelLabel();
  const effort = useStoredReasoningEffort();
  const purpose = t('topbar.modelSwitcher', 'Model and reasoning');
  const visibleLabel = ['Socrates', modelLabel].filter(Boolean).join(' ');
  const title = modelLabel ? `${modelLabel} · ${effortLabel(effort)}` : effortLabel(effort);
  return (
    <Button
      variant="ghost"
      className={`top-model-switcher ${CHROME_BUTTON}`}
      id="topModelSwitcher"
      data-chat-config-trigger=""
      aria-haspopup="dialog"
      aria-expanded={snapshot.open && snapshot.triggerId === 'topModelSwitcher'}
      aria-label={`${visibleLabel} — ${purpose}`}
      title={title}
      onClick={(event) => openChatConfiguration(event.currentTarget)}
    >
      <svg className="top-model-switcher-settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h7m4 0h5M4 17h3m4 0h9" /><circle cx="13" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>
      <span className="top-model-switcher-name">Socrates</span>
      <span className="top-model-switcher-model" id="topModelSwitcherModel">{modelLabel}</span>
      <svg className="top-model-switcher-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4.5 6.5 3.5 3.5 3.5-3.5" /></svg>
    </Button>
  );
}

function PracticeProgress() {
  const phase = useSessionStore((snapshot) => snapshot.practicePhase);
  const attempts = useSessionStore((snapshot) => snapshot.practiceAttempts);
  if (!phase) return null;
  const phaseLabel = phase === 'foundation'
    ? i18n('tutor.practiceFoundation', '基础')
    : i18n('tutor.practiceTransfer', '变式');
  return (
    <span className="practice-progress-chip tutor-only" id="practiceProgressChip" role="status">
      <span className="practice-progress-chip-phase">{phaseLabel}</span>
      <span className="practice-progress-chip-attempts">·{attempts || 0}</span>
    </span>
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

function TopBarLeft() {
  return (
    <div className="top-bar-left">
      <SidebarToggle />
      <ModelSwitcher />
      <PracticeProgress />
      {/* Tutor-mode progress indicator; visibility is a `tutor-only` class
          toggle owned by app/lifecycle/mode.ts. */}
      <div className="tutor-mastery-pill tutor-only hidden" id="tutorMasteryPill" role="status" aria-label="Socratic learning stage" data-i18n-aria="tutor.mastery.title" data-i18n-title="tutor.mastery.title" title="Socratic Stage">
        <span className="tutor-mastery-stage-dot" aria-hidden="true" />
        <span className="tutor-mastery-stage-label" id="tutorMasteryStageLabel" data-i18n-key="tutor.mastery.step1">{t('tutor.mastery.step1', '探索提问')}</span>
        <span className="tutor-mastery-stage-steps" aria-hidden="true">
          <span className="step-dot active" data-step="1" />
          <span className="step-dot" data-step="2" />
          <span className="step-dot" data-step="3" />
          <span className="step-dot" data-step="4" />
        </span>
      </div>
      <ExamTitle />
    </div>
  );
}

/* ── Center: the 聊天 / 辅导 segmented control ─────────────────────────── */

/**
 * A two-position pill centered in the header track. The thumb is one element
 * that slides between the positions (`data-active` on the track), so the
 * options are plain buttons rather than a ToggleGroup: Base UI's Toggle would
 * pull its runtime into the entry chunk, and the product thumb is what paints
 * the selection here, not a per-option background.
 *
 * Selecting a mode mid-conversation asks for confirmation first
 * (app/lifecycle/mode.ts), which is why each option stays a button.
 */
function ModeSwitch() {
  const mode = useAppMode();
  const conversationActive = useConversationActive();
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const current = (event.target as HTMLElement).closest<HTMLButtonElement>('.top-mode-switch-option');
    if (!current || !event.currentTarget.contains(current)) return;
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.top-mode-switch-option'));
    const index = options.indexOf(current);
    if (index < 0 || options.length === 0) return;
    event.preventDefault();
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length;
    const next = options[nextIndex];
    next?.focus();
    const targetMode = next?.dataset.mode;
    if (targetMode) void toggleAppMode(targetMode);
  };
  return (
    <div className="top-mode-switch" id="topModeSwitch" role="tablist" data-active={mode} data-i18n-aria="chrome.sessionMode" aria-label="Session mode" aria-hidden={conversationActive} hidden={conversationActive} style={conversationActive ? { display: 'none' } : undefined} onKeyDown={onKeyDown}>
      <span className="top-mode-switch-thumb" id="topModeSwitchThumb" aria-hidden="true" />
      <Button variant="ghost" className={`${MODE_OPTION}${mode === 'chat' ? ' is-active' : ''} ${CHROME_BUTTON}`} id="topModeChat" role="tab" aria-selected={mode === 'chat'} tabIndex={mode === 'chat' ? 0 : -1} data-mode="chat" data-i18n-key="tutor.modeChat" onClick={() => { void toggleAppMode('chat'); }}>{t('tutor.modeChat', '聊天')}</Button>
      <Button variant="ghost" className={`${MODE_OPTION}${mode === 'tutor' ? ' is-active' : ''} ${CHROME_BUTTON}`} id="topModeTutor" role="tab" aria-selected={mode === 'tutor'} tabIndex={mode === 'tutor' ? 0 : -1} data-mode="tutor" data-i18n-key="tutor.modeTutor" onClick={() => { void toggleAppMode('tutor'); }}>{t('tutor.modeTutor', '辅导')}</Button>
    </div>
  );
}

/* ── Right: mobile actions · model picker · find · share ───────────────── */

function MobileActions() {
  const incognito = useIncognito();
  const incognitoLabel = incognito ? "Incognito on — this chat won't be saved" : 'Incognito chat';
  return (
    <>
      <Button variant="ghost" className={`mobile-newchat-btn ${CHROME_BUTTON}`} id="mobileNewChatBtn"
        data-i18n-title="sidebar.nav.new" data-i18n-aria="sidebar.nav.new" title={t('sidebar.nav.new', 'New chat')} aria-label={t('sidebar.nav.new', 'New chat')}
        onClick={() => { void startNewChat(); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M11 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4" /><path d="m14.5 5.5 4 4M5 19l3.6-.9L19.2 7.5a2.8 2.8 0 0 0-4-4L4.6 14.1 3.7 18a.8.8 0 0 0 1 1Z" /></svg>
      </Button>
      <Button variant="ghost" className={`mobile-incognito-btn ${CHROME_BUTTON}`} id="mobileIncognitoBtn" aria-pressed={incognito}
        aria-label={incognitoLabel} title={incognitoLabel}
        data-i18n-aria="sidebar.nav.incognito" data-i18n-title="sidebar.nav.incognito"
        onClick={() => { void toggleIncognito(); }}>
        <svg className="incognito-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6.5 10.5 8.3 6c.2-.6.9-.9 1.5-.7l2.2.7 2.2-.7c.6-.2 1.3.1 1.5.7l1.8 4.5" />
          <path d="M4 10.5h16" />
          <circle cx="8.5" cy="15.5" r="2.7" />
          <circle cx="15.5" cy="15.5" r="2.7" />
          <path d="M11.2 15.5h1.6" />
        </svg>
      </Button>
    </>
  );
}

function ConversationActions() {
  return (
    <>
      <Button variant="ghost" className={`find-btn hidden ${CHROME_BUTTON}`} id="findBtn"
        data-i18n-title="find.title" data-i18n-aria="find.title"
        title={t('find.title', 'Find in conversation')} aria-label={t('find.title', 'Find in conversation')}
        onClick={openFindInSession}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="10.75" cy="10.75" r="6.75" /><path d="m16 16 4.5 4.5" /></svg>
      </Button>
      <Button variant="ghost" className={`share-btn hidden ${CHROME_BUTTON}`} id="shareBtn"
        title={t('chrome.shareConversation', 'Share this conversation')} aria-label={t('chrome.shareConversation', 'Share this conversation')}
        data-i18n-title="chrome.shareConversation" data-i18n-aria="chrome.shareConversation"
        onClick={() => openShareModal()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4.5 13v4.5a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3V13M12 15V3.5m-4 4 4-4 4 4" /></svg>
        <span className="share-btn-label" data-i18n-key="sidebar.share">{t('sidebar.share', 'Share')}</span>
      </Button>
    </>
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
  return (
    <>
      <PluginWorkspaceTabs />
      <TopBarLeft />
      <ModeSwitch />
      <div className="top-bar-right">
        <MobileActions />
        <ConversationActions />
      </div>
    </>
  );
}

export function mountTopBar(): boolean {
  const host = document.getElementById('topBar');
  if (!host) return false;
  mountOwnedRoot(host, 'top-bar', <TopBar />);
  return true;
}
