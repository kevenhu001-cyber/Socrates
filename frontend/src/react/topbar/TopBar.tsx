import { useEffect, useState } from 'react';
import { Button } from '../ui/shadcn/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '../ui/shadcn/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '../ui/shadcn/tabs';
import { i18n } from '../legacy/gateway.ts';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';

/**
 * TopBar — the React-owned header chrome.
 *
 * index.html keeps `<div class="top-bar" id="topBar">` as the host; every
 * control inside it is rendered here. The ids are part of the shell contract
 * (`#topModelSwitcher`, `#findBtn`, `#shareBtn`, `#topModeSwitch`, …): the
 * legacy runtime still toggles their classes, writes the model label into
 * `#topModelSwitcherModel` and fills `#chatModelMenu`. Those nodes are
 * rendered childless on purpose so an imperative write is never clobbered by
 * a re-render.
 *
 * Shell layout and custom model/action geometry stay in parity/topbar.css;
 * the mode option buttons own their 36px control geometry through shadcn
 * variants and token classes (docs/adr/0024-shadcn-shell-geometry-ownership.md).
 */

function t(key: string, fallback: string): string {
  return i18n(key, fallback);
}

type AppMode = 'chat' | 'tutor';

function readAppMode(): AppMode {
  return document.body.getAttribute('data-app-mode') === 'tutor' ? 'tutor' : 'chat';
}

function requestAppMode(mode: string): void {
  if (mode === 'chat' || mode === 'tutor') {
    document.dispatchEvent(new CustomEvent('socrates:mode-switch-select', { detail: mode }));
  }
}

function useAppMode(): AppMode {
  const [mode, setMode] = useState<AppMode>(readAppMode);
  useEffect(() => {
    const sync = (event: Event) => {
      const next = (event as CustomEvent<AppMode>).detail;
      if (next === 'chat' || next === 'tutor') setMode(next);
    };
    document.addEventListener('socrates:mobile-mode-sync', sync);
    return () => document.removeEventListener('socrates:mobile-mode-sync', sync);
  }, []);
  return mode;
}

function useModeSwitchVisible(): boolean {
  const isVisible = () => !['workspace-active', 'exam-active', 'admin-active']
    .some((className) => document.body.classList.contains(className));
  const [visible, setVisible] = useState(isVisible);
  useEffect(() => {
    const sync = () => setVisible(isVisible());
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return visible;
}

/* ── Left: sidebar toggle · model switcher · tutor pill · exam title ───── */

function SidebarToggle() {
  return (
    <Button
      variant="ghost"
      className="toggle-sidebar cg-circle-btn"
      id="sidebarOpenBtn"
      title="Toggle sidebar (⌘B)"
      aria-controls="sidebar"
      aria-expanded="true"
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
 * (model · reasoning effort · speed). Its accessible name is owned by
 * ui/effortPicker.js (WCAG 2.5.3: the name must contain the visible text), so
 * the label nodes stay childless here.
 */
function ModelSwitcher() {
  return (
    <Button
      variant="outline"
      className="top-model-switcher min-w-0 shrink"
      id="topModelSwitcher"
      data-chat-config-trigger=""
      aria-haspopup="dialog"
      aria-expanded="false"
      data-i18n-title="topbar.modelSwitcher"
      title="Model and reasoning"
    >
      <svg className="top-model-switcher-settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h7m4 0h5M4 17h3m4 0h9" /><circle cx="13" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>
      <span className="top-model-switcher-name">Socrates</span>
      <span className="top-model-switcher-model" id="topModelSwitcherModel" />
      <svg className="top-model-switcher-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4.5 6.5 3.5 3.5 3.5-3.5" /></svg>
    </Button>
  );
}

function TopBarLeft() {
  return (
    <div className="top-bar-left">
      <SidebarToggle />
      <ModelSwitcher />
      {/* Tutor-mode progress indicator; visibility is a `tutor-only` class
          toggle owned by app/lifecycle/mode.js. */}
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
      <span className="exam-title-bar hidden" id="examTitleBar" data-exam-only="true" />
    </div>
  );
}

/* ── Center: the 聊天 / 辅导 segmented control ─────────────────────────── */

/**
 * A shadcn-style segmented tab list centered in the header track. The mode
 * synchronizer updates aria-selected, which paints the selected state without
 * a product-owned sliding thumb.
 *
 * The Tabs component owns selection and keyboard behavior; a mode request
 * still goes through the legacy confirmation flow before this control changes.
 */
function ModeSwitch({ mode, visible }: { mode: AppMode; visible: boolean }) {
  return (
    <Tabs value={mode} onValueChange={requestAppMode} className={`top-mode-switch inline-flex items-center gap-0 ${visible ? '' : 'hidden'}`} id="topModeSwitch">
      <TabsList className="w-full" aria-label="Session mode" data-i18n-aria="chrome.sessionMode" activateOnFocus>
        <TabsTrigger className="top-mode-switch-option min-w-[104px] max-[768px]:min-w-0" id="topModeChat" value="chat" data-mode="chat" data-i18n-key="tutor.modeChat">{t('tutor.modeChat', '聊天')}</TabsTrigger>
        <TabsTrigger className="top-mode-switch-option min-w-[104px] max-[768px]:min-w-0" id="topModeTutor" value="tutor" data-mode="tutor" data-i18n-key="tutor.modeTutor">{t('tutor.modeTutor', '辅导')}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/* ── Right: mobile actions · model picker · find · share ───────────────── */

function MobileActions() {
  return (
    <>
      <Button variant="ghost" className="mobile-newchat-btn" id="mobileNewChatBtn"
        data-i18n-title="sidebar.nav.new" data-i18n-aria="sidebar.nav.new" title={t('sidebar.nav.new', 'New chat')} aria-label={t('sidebar.nav.new', 'New chat')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M11 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4" /><path d="m14.5 5.5 4 4M5 19l3.6-.9L19.2 7.5a2.8 2.8 0 0 0-4-4L4.6 14.1 3.7 18a.8.8 0 0 0 1 1Z" /></svg>
      </Button>
      <Button variant="ghost" className="mobile-incognito-btn" id="mobileIncognitoBtn" aria-pressed="false"
        aria-label="Incognito chat" title={t('sidebar.nav.incognito', 'Incognito chat')}
        data-i18n-aria="sidebar.nav.incognito" data-i18n-title="sidebar.nav.incognito">
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

/**
 * The in-conversation model picker. `#chatModelMenu` is filled by
 * ui/pickers.js and must stay childless; `#chatModelLabel` is the screen-reader
 * label while the glyph carries the visible identity.
 */
function ChatModelPicker() {
  return (
    <div className="chat-model-wrap hidden" id="chatModelWrap">
      <Button variant="ghost" className="chat-model-trigger" id="chatModel" aria-haspopup="listbox" aria-expanded="false"
        aria-label={t('chrome.pickModel', 'Pick or configure the model for this conversation')}
        title={t('chrome.pickModel', 'Pick or configure the model for this conversation')}
        data-i18n-aria="chrome.pickModel" data-i18n-title="chrome.pickModel">
        <svg className="chat-model-glyph" viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true" />
        <span className="chat-model-label sr-only" id="chatModelLabel">Model</span>
        <svg className="chat-model-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 10l6 5 6-5" /></svg>
      </Button>
      <div className="chat-model-menu model-picker-menu hidden" id="chatModelMenu" role="listbox" aria-label="Available models" data-i18n-aria="chrome.availableModels" />
    </div>
  );
}

function ConversationActions() {
  return (
    <>
      <Button variant="ghost" className="find-btn hidden" id="findBtn"
        data-i18n-title="find.title" data-i18n-aria="find.title"
        title={t('find.title', 'Find in conversation')} aria-label={t('find.title', 'Find in conversation')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="10.75" cy="10.75" r="6.75" /><path d="m16 16 4.5 4.5" /></svg>
      </Button>
      <Button variant="ghost" className="share-btn hidden" id="shareBtn"
        title={t('chrome.shareConversation', 'Share this conversation')} aria-label={t('chrome.shareConversation', 'Share this conversation')}
        data-i18n-title="chrome.shareConversation" data-i18n-aria="chrome.shareConversation">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4.5 13v4.5a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3V13M12 15V3.5m-4 4 4-4 4 4" /></svg>
        <span className="share-btn-label" data-i18n-key="sidebar.share">{t('sidebar.share', 'Share')}</span>
      </Button>
    </>
  );
}

/* ── Directory tabs · phone mode menu ──────────────────────────────────── */

function PluginWorkspaceTabs() {
  const [value, setValue] = useState('plugins');
  const [visible, setVisible] = useState(() => document.body.classList.contains('plugins-active'));
  useEffect(() => {
    const sync = () => {
      setValue(document.getElementById('promptTemplatesOverlay') ? 'skills' : 'plugins');
      setVisible(document.body.classList.contains('plugins-active'));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return (
    <Tabs value={value} onValueChange={setValue} className={`top-mode-tabs plugin-workspace-tabs gap-0 ${visible ? '' : 'hidden'} max-[768px]:hidden`} id="pluginWorkspaceTabs">
      <TabsList className="plugin-workspace-tablist w-full" aria-label="Plugin workspace" data-i18n-aria="chrome.pluginWorkspace">
        <TabsTrigger className="plugin-workspace-tab" id="pluginWorkspacePluginsTab" value="plugins" data-i18n-key="plugins.pluginsTab">{t('plugins.pluginsTab', '插件')}</TabsTrigger>
        <TabsTrigger className="plugin-workspace-tab" id="pluginWorkspaceSkillsTab" value="skills" data-i18n-key="plugins.skillsTab">{t('plugins.skillsTab', '技能')}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function MobileMode({ mode }: { mode: AppMode }) {
  return (
    <div className="mobile-mode" id="mobileMode">
      <DropdownMenu modal={false} onOpenChange={(open) => document.getElementById('mobileMode')?.setAttribute('data-open', String(open))}>
        <DropdownMenuTrigger render={<Button variant="ghost" className="mobile-mode-trigger gap-1.5" id="mobileModeTrigger" aria-haspopup="menu" aria-expanded="false">
          <span className="mobile-mode-label" id="mobileModeLabel">{mode === 'tutor' ? t('tutor.modeTutor', 'Tutor') : 'Socrates'}</span>
          <svg className="mobile-mode-caret size-4 text-muted-foreground transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </Button>} />
        <DropdownMenuContent id="mobileModeMenu" align="center" side="bottom" sideOffset={6} className="mobile-mode-menu w-60 max-w-[calc(100vw-2rem)]" aria-label="Session mode" data-i18n-aria="chrome.sessionMode">
          <DropdownMenuRadioGroup value={mode} onValueChange={requestAppMode}>
            <DropdownMenuRadioItem value="chat" data-mode="chat" nativeButton className="mobile-mode-item h-auto min-h-9 w-full flex-col items-start gap-0.5 whitespace-normal" render={<Button variant="ghost" className="mobile-mode-item h-auto min-h-9 w-full flex-col items-start justify-center gap-0.5 whitespace-normal text-left" />}>
              <span className="mobile-mode-item-title text-sm leading-tight font-medium text-foreground" data-i18n-key="tutor.modeChat">{t('tutor.modeChat', 'Chat')}</span>
              <span className="mobile-mode-item-desc text-xs leading-snug text-muted-foreground" data-i18n-key="tutor.modeChatDesc">{t('tutor.modeChatDesc', 'Plain conversation, no scaffolding')}</span>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="tutor" data-mode="tutor" nativeButton className="mobile-mode-item h-auto min-h-9 w-full flex-col items-start gap-0.5 whitespace-normal" render={<Button variant="ghost" className="mobile-mode-item h-auto min-h-9 w-full flex-col items-start justify-center gap-0.5 whitespace-normal text-left" />}>
              <span className="mobile-mode-item-title text-sm leading-tight font-medium text-foreground" data-i18n-key="tutor.modeTutor">{t('tutor.modeTutor', 'Tutor')}</span>
              <span className="mobile-mode-item-desc text-xs leading-snug text-muted-foreground" data-i18n-key="tutor.modeTutorDesc">{t('tutor.modeTutorDesc', 'AI asks, follows up, and tracks what you know')}</span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuItem nativeButton id="mobileConfigBtn" className="mobile-mode-item w-full" render={<Button variant="ghost" className="mobile-mode-item w-full justify-start text-left" />}>
            <span className="mobile-mode-item-title text-sm leading-tight font-medium text-foreground" data-i18n-key="topbar.modelSwitcher">{t('topbar.modelSwitcher', 'Model and reasoning')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* The host `<div class="top-bar" id="topBar">` already carries the bar
   layout, so the tree renders its children into it rather than nesting a
   second `.top-bar` (which would become one opaque flex item and collapse
   the left/right groups to zero width). */
export function TopBar() {
  const mode = useAppMode();
  const modeSwitchVisible = useModeSwitchVisible();
  return (
    <>
      <PluginWorkspaceTabs />
      <MobileMode mode={mode} />
      <TopBarLeft />
      <ModeSwitch mode={mode} visible={modeSwitchVisible} />
      <div className="top-bar-right">
        <MobileActions />
        <ChatModelPicker />
        <ConversationActions />
      </div>
    </>
  );
}

export function mountTopBar(): boolean {
  const host = document.getElementById('topBar');
  if (!host) return false;
  mountOwnedRoot(host, 'top-bar', <TopBar />);
  /* The legacy runtime writes the model label and glyph before the deferred
     registry pass (`effortPicker.js` self-syncs at load, `pickers.js` on every
     provider-config push). Replay those two syncs once so the first React
     render does not paint an empty switcher. */
  queueMicrotask(() => {
    const win = window as Window & {
      syncChatModel?: () => void;
      syncEffortUI?: () => void;
      syncMobileModeSwitch?: () => void;
    };
    try { win.syncChatModel?.(); } catch { /* the picker owns its own logging */ }
    try { win.syncEffortUI?.(); } catch { /* idem */ }
    try { win.syncMobileModeSwitch?.(); } catch { /* the mode switch owns its own logging */ }
  });
  return true;
}
