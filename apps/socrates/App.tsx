import 'react-native-reanimated';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, StatusBar, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import type { Session } from '@socrates/contracts';
import { createMessageOutbox, useChatStore, visibleSessions as getVisibleSessions } from '@socrates/chat';
import { useAuthStore } from '@socrates/auth';
import { useSettingsStore } from '@socrates/settings';
import { fontStyle, getThemePaletteHex } from '@socrates/theme';
import { IconRendererProvider, activeProviderOf, uiStrings, type ArtifactDescriptor, type BoundarySnapshot, type KnowledgeBoundaryNode, type SidebarView, type TeachingPlan } from '@socrates/ui';
import { api } from './src/runtime';
import { storage } from './src/storage';
import { copyText } from './src/clipboard';
import { supportsCamera } from './src/attachments';
import { FONTS } from './src/fonts';
import { AuthGate } from './src/AuthGate';
import { installWebTextDefaults } from './src/webTextDefaults';
import { SidebarLogoText, SidebarNavLabelBadge } from './src/SidebarText';
import { webIconRenderer } from './src/iconRenderer';
import { appStrings } from './src/strings';
import { useAuthentication } from './src/useAuthentication';
import { useLearningSetup } from './src/useLearningSetup';
import { useSessionActions } from './src/useSessionActions';
import { useStagedAttachments } from './src/useStagedAttachments';
import { useChatTurn } from './src/useChatTurn';
import { useTutorProgress } from './src/useTutorProgress';
import { useCatalogManagement } from './src/useCatalogManagement';
import { useProjectLibrary } from './src/useProjectLibrary';
import { useSessionSharing } from './src/useSessionSharing';
import { useVoiceInput } from './src/useVoiceInput';
import { useAccountUsage } from './src/useAccountUsage';
import { useMessageActions } from './src/useMessageActions';
import { useConversationFind } from './src/useConversationFind';
import { useHardwareBackNavigation, useSidebarNavigation, type AppScreen } from './src/appNavigation';
import { styles } from './src/appStyles';
import { ChatTopBar } from './src/ChatTopBar';
import { ChatWorkspace } from './src/ChatWorkspace';
import { AppScreenRoutes } from './src/AppScreenRoutes';
import { AppOverlays } from './src/AppOverlays';
import { AppSidebarLayer } from './src/AppSidebarLayer';
import { useFileAccess } from './src/useFileAccess';
import { useAppLifecycle } from './src/useAppLifecycle';
import { useProjectRouteActions } from './src/useProjectRouteActions';
import { useCatalogActions } from './src/useCatalogActions';

const initialSessions: Session[] = [{ id: 'welcome', title: 'Welcome to Socrates', topic: 'Universal app', mode: 'chat', phase: 'chat', messages: [{ clientId: 'welcome-assistant', role: 'assistant', rawText: 'How can I help you learn today?' }] }];

function messageKey(message: { clientId?: string | null; id?: string }): string | null {
  return message.clientId || message.id || null;
}

function SocratesApp() {
  const { width } = useWindowDimensions();
  const compact = width <= 768;
  const [sidebarOpen, setSidebarOpen] = useState(!compact);
  /* The baseline sidebar DOM never unmounts, so its Recents/Knowledge/Mistakes
   * view survives drawer close/reopen and session switches. The drawer here
   * unmounts on close, so the view lives above it. */
  const [sidebarView, setSidebarView] = useState<SidebarView>('recents');
  const [sidebarSearchOpen, setSidebarSearchOpen] = useState(false);
  const [screen, setScreen] = useState<AppScreen>('chat');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  /** Session id awaiting a move target; opens the projects screen in pick mode. */
  const [movePickSession, setMovePickSession] = useState<string | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [assistantMenuOpen, setAssistantMenuOpen] = useState(false);
  /** Where the providers screen returns to (settings entry vs chat menu). */
  const [providersReturn, setProvidersReturn] = useState<'settings' | 'chat'>('settings');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const {
    staged,
    onPickImages,
    onTakePhoto,
    onPickFile,
    removeStaged,
    consumeStaged,
    clearStaged,
    resolveStaged,
  } = useStagedAttachments();
  const [artifact, setArtifact] = useState<ArtifactDescriptor | null>(null);
  /** Set when an edit/regenerate could not reach the server and its ops
   * are waiting in the outbox; cleared once the queue drains. */
  const [offlineNotice, setOfflineNotice] = useState(false);
  const { listening, voiceInputSupported, stopComposerAudio, speak, toggleListen, reset: resetVoiceInput } = useVoiceInput();
  const sessions = useChatStore((state) => state.sessions);
  const activeId = useChatStore((state) => state.activeSessionId);
  const draft = useChatStore((state) => state.draft);
  const status = useChatStore((state) => state.status);
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const theme = useSettingsStore((state) => state.theme);
  const language = useSettingsStore((state) => state.language);
  const s = appStrings(language);
  useEffect(() => { installWebTextDefaults(theme); }, [language, theme]);
  // Shared UI strings + the baseline font stacks, so the shell chrome uses
  // the same copy and typography as the baseline SPA.
  const t = uiStrings(language);
  const fam = (weight: 'regular' | 'medium' | 'semibold' | 'bold' = 'regular') => fontStyle(weight, language, Platform.OS === 'web');
  const palette = useMemo(() => getThemePaletteHex(theme), [theme]);
  const active = useMemo(() => sessions.find((session) => session.id === activeId) || null, [activeId, sessions]);
  const {
    target: fileTarget,
    previewFile,
    openPreview,
    closePreview,
    reset: resetFileAccess,
    resolveImage,
    openAttachment,
    openStoredArtifact,
    listFiles,
    removeFile,
    loadPreview: loadFilePreview,
  } = useFileAccess({ messages: active?.messages, mode: theme, onOpenArtifact: setArtifact });
  const {
    open: findOpen,
    query: findQuery,
    activeIndex: activeFindIndex,
    matches: findMatches,
    openFind,
    next: nextFind,
    previous: previousFind,
    close: closeFind,
    updateQuery: updateFindQuery,
  } = useConversationFind({ messages: active?.messages || [], activeId, isChatScreen: screen === 'chat' });
  const {
    shareOpen,
    shareVisibility,
    shareUrl,
    shareBusy,
    shareStatus,
    shareError,
    setShareVisibility,
    reset: resetShare,
    openShare,
    createShare,
    copyShare,
    revokeShare,
    closeShare,
  } = useSessionSharing(active);
  const visibleSessions = useMemo(
    () => {
      return getVisibleSessions(sessions, projectFilter);
    },
    [sessions, projectFilter],
  );
  const streamAbort = useRef<AbortController | null>(null);
  const accountEpoch = useRef(0);
  const {
    usage: accountUsage,
    loading: usageLoading,
    error: usageError,
    loadUsage,
    changePassword,
    reset: resetAccountUsage,
  } = useAccountUsage(accountEpoch);
  const loadingDetails = useRef(new Set<string>());
  const {
    providers,
    providersLoading,
    providersError,
    assistants,
    assistantsLoading,
    assistantsError,
    reset: resetCatalog,
    resetProviders,
    loadAssistants,
    loadProviders,
    activateProvider,
    createProvider,
    deleteProvider,
    bindAssistant: bindAssistantSession,
    createAssistant,
    updateAssistant,
    deleteAssistant,
  } = useCatalogManagement({ accountEpoch });
  const {
    projects,
    projectsLoading,
    projectsError,
    archived,
    setArchived,
    reset: resetProjectLibrary,
    syncLibrary,
    createProject,
    renameProject,
    deleteProject,
    reportError: reportProjectError,
  } = useProjectLibrary({ accountEpoch, loadAssistants, projectFilter, setProjectFilter });
  const activeProject = useMemo(() => projects.find((project) => project.id === projectFilter) || null, [projects, projectFilter]);
  const activeModel = useMemo(() => activeProviderOf(providers), [providers]);
  const activeModelLabel = activeModel ? (activeModel.label || activeModel.model || 'Model') : s.openModelMenu;
  const chatError = useChatStore((state) => state.error);
  // Failed edit/regenerate mutations wait here (durable, storage-backed)
  // and replay as explicit per-row ops — never as a replayed
  // discardFollowing, which would eat turns made after the reconnect.
  const outbox = useMemo(() => createMessageOutbox({
    storage,
    // Outbox replay rewrites the text only; the stale rows are queued as
    // explicit deletes alongside, so discardFollowing stays false here.
    patchMessage: (sessionId, id, content) => api.messages.patch(id, { content, discardFollowing: false }, sessionId),
    deleteMessage: (sessionId, id) => api.messages.remove(id, sessionId),
    isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  }), []);
  const drainOutbox = useCallback(async () => {
    try {
      await outbox.drainMessageOutbox();
      setOfflineNotice((await outbox.pendingOpCount()) > 0);
    } catch { /* the queue survives; never surface drain noise */ }
  }, [outbox]);
  const { runTurn, submitTurn, send } = useChatTurn({
    accountEpoch,
    streamAbort,
    loadingDetails,
    drainOutbox,
    projectFilter,
    staged,
    consumeStaged,
    resolveStaged,
    stopComposerAudio,
  });
  const {
    activeMistakes,
    activeMistakeFilter,
    setActiveMistakeFilter,
    redo,
    updateKnowledgeNode,
    saveKnowledgeSnapshot,
    jumpToKnowledgeNode,
    onQuizPick,
    onPracticeSubmit,
    onRedoMistake,
  } = useTutorProgress({ active, activeId, accountEpoch, runTurn, submitTurn });
  // Drain on boot and whenever the platform reports it is back online.
  // (Native has no window: the drain after every turn + send covers it.)
  useEffect(() => {
    void drainOutbox();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const onOnline = () => { void drainOutbox(); };
      window.addEventListener('online', onOnline);
      return () => window.removeEventListener('online', onOnline);
    }
    return undefined;
  }, [drainOutbox]);
  const onReturnToChat = useCallback(() => setScreen('chat'), []);
  const {
    examRun,
    tutorRun,
    examData,
    examQuestions,
    isExam,
    tutorData,
    tutorQuestions,
    tutorAnswers,
    showDiagnostic,
    persistDiagnosticAnswers,
    persistExam,
    startExamGeneration,
    cancelExamGeneration,
    closeExamSetup,
    startTutorGeneration,
    cancelTutorGeneration,
    closeTutorSetup,
    submitDiagnostic,
    reset: resetLearningSetup,
  } = useLearningSetup({ active, accountEpoch, onReturnToChat });
  const {
    select,
    createSession,
    archiveSession,
    unarchiveSession,
    deleteSession,
    moveSessionToProject,
    selectProject,
    openSearchSession,
  } = useSessionActions({
    accountEpoch,
    archived,
    compact,
    loadingDetails,
    projectFilter,
    onReturnToChat,
    setArchived,
    setConfirmDelete,
    setProjectFilter,
    setSidebarOpen,
  });
  const { pickSession, closeProjects, selectProjectTarget } = useProjectRouteActions({
    sessions,
    movePickSession,
    moveSessionToProject,
    selectProject,
    setMovePickSession,
    setScreen,
    reportError: reportProjectError,
  });
  const {
    openProviders,
    openModelMenu,
    openSettings,
    pickModel,
    openAssistantMenu,
    bindAssistant,
    useAssistant,
  } = useCatalogActions({
    projectFilter,
    compact,
    setScreen,
    setSidebarOpen,
    setAssistantMenuOpen,
    setModelMenuOpen,
    setProvidersReturn,
    loadAssistants,
    bindAssistantSession,
    loadProviders,
    loadUsage,
    activateProvider,
  });

  const {
    editingId,
    reset: resetMessageActions,
    startEdit,
    cancelEdit,
    regenerate,
    retryTurn,
    branchFrom,
    commitEditSend,
  } = useMessageActions({
    accountEpoch,
    streamAbort,
    outbox,
    drainOutbox,
    runTurn,
    onReturnToChat,
    setOfflineNotice,
  });

  const {
    pending: authPending,
    error: authError,
    notice: authNotice,
    clearNotice: clearAuthNotice,
    login,
    loginWithCode,
    sendCode,
    register,
    resendVerification,
    forgotPassword,
    continueAsGuest,
    signOut,
  } = useAuthentication(syncLibrary);

  const resetAccountState = useCallback(() => {
    accountEpoch.current++;
    streamAbort.current?.abort(); streamAbort.current = null;
    resetVoiceInput();
    loadingDetails.current.clear();
    clearStaged();
    resetProjectLibrary();
    resetAccountUsage();
    resetCatalog();
    clearAuthNotice();
    setArtifact(null);
    resetFileAccess();
    resetLearningSetup();
    setProjectFilter(null); setMovePickSession(null); setMenuOpen(false); setConfirmDelete(false); setScreen('chat');
    setModelMenuOpen(false); setProvidersReturn('settings');
    setAssistantMenuOpen(false);
    closeFind();
    resetShare();
    resetMessageActions(); setOfflineNotice(false);
    useChatStore.getState().reset();
    useChatStore.getState().setSessions(initialSessions);
    useChatStore.getState().selectSession('welcome');
  }, [clearAuthNotice, clearStaged, closeFind, resetAccountUsage, resetCatalog, resetFileAccess, resetLearningSetup, resetMessageActions, resetProjectLibrary, resetShare, resetVoiceInput]);
  useAppLifecycle({ accountEpoch, streamAbort, user, resetAccountState, syncLibrary, loadProviders, resetProviders });
  const stop = useCallback(() => { streamAbort.current?.abort(); }, []);
  const { navItems, sidebarUser } = useSidebarNavigation({
    screen,
    compact,
    user,
    accountPlan: accountUsage?.plan?.name || '',
    appCopy: s,
    uiCopy: t,
    setScreen,
    setProvidersReturn,
    setSidebarOpen,
    createSession,
    openAssistantMenu,
    loadProviders,
  });
  useHardwareBackNavigation({
    modelMenuOpen,
    assistantMenuOpen,
    menuOpen,
    providersReturn,
    screen,
    compact,
    sidebarOpen,
    setModelMenuOpen,
    setAssistantMenuOpen,
    setMenuOpen,
    setConfirmDelete,
    setMovePickSession,
    setScreen,
    setSidebarOpen,
  });
  const toggleTheme = useCallback(() => {
    const next = useSettingsStore.getState().theme === 'dark' ? 'light' : 'dark';
    void useSettingsStore.getState().update({ theme: next }, storage);
  }, []);

  if (authStatus === 'restoring') {
    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><View style={styles.center}><Text style={{ color: palette.text.muted }}>{s.restoring}</Text></View></SafeAreaView>;
  }
  if (!user) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} /><AuthGate
      mode={theme}
      pending={authPending}
      error={authError}
      notice={authNotice}
      onLogin={(email, password) => void login(email, password)}
      onSendCode={(email) => void sendCode(email)}
      onLoginWithCode={(email, code) => void loginWithCode(email, code)}
      onRegister={(email, password) => void register(email, password)}
      onResendVerification={(email) => void resendVerification(email)}
      onForgotPassword={(email) => void forgotPassword(email)}
      onGuest={continueAsGuest}
    /></SafeAreaView>;
  }

  if (screen !== 'chat') {
    const activeProvider = providers.find((row) => row.isActive) || null;
    return <AppScreenRoutes
      screen={screen}
      mode={theme}
      pageBackground={palette.bg.page}
      settings={{
        mode: theme,
        profile: !user.isGuest ? { displayName: user.displayName, email: user.email, tier: user.tier } : null,
        usage: accountUsage,
        usageLoading,
        usageError,
        onRetryUsage: () => void loadUsage(),
        onChangePassword: changePassword,
        activeProvider: !user.isGuest ? activeProvider?.model || activeProvider?.label || '' : null,
        onOpenProviders: openProviders,
        onClose: () => setScreen('chat'),
        onSignOut: () => { signOut(); setScreen('chat'); },
      }}
      projects={{
        mode: theme,
        projects,
        activeProjectId: projectFilter,
        loading: projectsLoading,
        error: projectsError,
        pickMode: pickSession ? { sessionTitle: pickSession.title || pickSession.topic || 'session' } : null,
        onClose: closeProjects,
        onSelectProject: selectProjectTarget,
        onCreateProject: createProject,
        onRenameProject: renameProject,
        onDeleteProject: deleteProject,
        onRetry: () => void syncLibrary(),
      }}
      providers={{
        mode: theme,
        providers,
        loading: providersLoading,
        error: providersError,
        onClose: () => setScreen(providersReturn),
        onActivate: activateProvider,
        onCreate: createProvider,
        onDelete: deleteProvider,
        onRetry: () => void loadProviders(),
      }}
      assistants={{
        mode: theme,
        assistants,
        boundId: active?.assistantId ?? null,
        loading: assistantsLoading,
        error: assistantsError,
        onClose: () => setScreen('chat'),
        onRetry: () => void loadAssistants(),
        onCreate: createAssistant,
        onUpdate: updateAssistant,
        onDelete: deleteAssistant,
        onUse: useAssistant,
      }}
      search={{
        mode: theme,
        sessions,
        serverSearch: !user.isGuest ? (query) => api.search.content({ q: query }).then((result) => result.hits) : null,
        onOpenSession: (id) => void openSearchSession(id),
        onClose: () => setScreen('chat'),
      }}
      examSetup={{
        mode: theme,
        running: examRun.running,
        progress: examRun.progress,
        error: examRun.error,
        onStart: (input) => void startExamGeneration(input),
        onCancel: cancelExamGeneration,
        onClose: closeExamSetup,
      }}
      tutorSetup={{
        mode: theme,
        running: tutorRun.running,
        progress: tutorRun.progress,
        error: tutorRun.error,
        onStart: (input) => void startTutorGeneration(input),
        onCancel: cancelTutorGeneration,
        onClose: closeTutorSetup,
      }}
      files={{
        mode: theme,
        list: listFiles,
        remove: removeFile,
        onOpen: openPreview,
        onClose: () => setScreen('chat'),
      }}
      filePreview={previewFile ? {
        file: previewFile,
        mode: theme,
        language,
        target: fileTarget,
        loadPreview: loadFilePreview,
        onClose: closePreview,
      } : null}
    />;
  }

  return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />
    <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS !== 'web'}>
      <AppSidebarLayer
        open={sidebarOpen}
        compact={compact}
        mode={theme}
        backdropLabel={s.toggleSidebar}
        onClose={() => setSidebarOpen(false)}
        sidebar={{
          sessions: visibleSessions,
          activeId,
          onSelect: select,
          onNewChat: createSession,
          nav: navItems,
          onOpenSearch: () => { if (compact) setSidebarOpen(false); setScreen('search'); },
          user: sidebarUser,
          themeIcon: theme === 'dark' ? 'moon' : 'sun',
          onToggleTheme: () => { if (compact) setSidebarOpen(false); toggleTheme(); },
          onOpenDisplaySettings: () => { if (compact) setSidebarOpen(false); openSettings(); },
          onOpenSettings: () => { if (compact) setSidebarOpen(false); openSettings(); },
          /* Account menu (baseline SidebarFooter): Upgrade plan is the same
             pricing link; Profile opens Settings, where the Universal profile
             lives; Sign out only for a signed-in (non-guest) account. Help is
             the SPA keyboard cheatsheet, which Universal does not have. */
          onUpgradePlan: () => { void Linking.openURL(PRICING_URL); },
          onOpenProfile: () => { if (compact) setSidebarOpen(false); openSettings(); },
          onSignOut: user && !user.isGuest ? () => { if (compact) setSidebarOpen(false); signOut(); } : undefined,
          onToggleSidebar: () => { if (compact) setSidebarOpen(false); else setSidebarOpen((open) => !open); },
          logoSource: require('./assets/logo.png'),
          logoTextRenderer: SidebarLogoText,
          navLabelBadgeRenderer: SidebarNavLabelBadge,
          sessionActions: {
            archive: (id) => void archiveSession(id),
            unarchive: (id) => void unarchiveSession(id),
            remove: (id) => void deleteSession(id),
            move: (id) => { setMovePickSession(id); setScreen('projects'); },
          },
          mode: theme,
          language,
          compact,
          archived,
          onSelectArchived: (id) => void unarchiveSession(id),
          tutorActive: active?.mode === 'tutor',
          teachingPlan: active?.mode === 'tutor' ? (active.teachingPlan as unknown as TeachingPlan | null) ?? null : null,
          teachingStage: active?.mode === 'tutor' ? active.teachingStage ?? null : null,
          substantiveCount: active?.mode === 'tutor' ? active.substantiveCount ?? 0 : 0,
          knowledgeNodes: active?.mode === 'tutor' ? (active.kbNodes || []) as unknown as KnowledgeBoundaryNode[] : [],
          currentNode: active?.mode === 'tutor' ? active.currentNode ?? -1 : -1,
          boundariesHistory: active?.mode === 'tutor' ? (active.boundariesHistory || []) as unknown as BoundarySnapshot[] : [],
          onUpdateKnowledgeNode: updateKnowledgeNode,
          onSaveKnowledgeSnapshot: saveKnowledgeSnapshot,
          onJumpToKnowledgeNode: jumpToKnowledgeNode,
          mistakes: activeMistakes,
          onRedoMistake,
          view: sidebarView,
          onViewChange: setSidebarView,
          mistakeFilter: activeMistakeFilter,
          onMistakeFilterChange: setActiveMistakeFilter,
          compactSearchOpen: sidebarSearchOpen,
          onCompactSearchOpenChange: setSidebarSearchOpen,
        }}
      />
      <View nativeID="socrates-main" style={[styles.main, compact ? styles.mainCompact : Platform.OS === 'web' && styles.mainDesktopWebLayer, { backgroundColor: palette.bg.page }]}>
        <ChatTopBar
          compact={compact}
          sidebarOpen={sidebarOpen}
          projectFilter={projectFilter}
          projectName={activeProject?.name || ''}
          hasActiveSession={!!active}
          canShare={!!user && !user.isGuest}
          activeModelLabel={activeModelLabel}
          language={language}
          palette={palette}
          appCopy={s}
          uiCopy={t}
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenModelMenu={openModelMenu}
          onCreateSession={createSession}
          onClearProjectFilter={() => setProjectFilter(null)}
          onOpenFind={openFind}
          onOpenShare={openShare}
        />
        <ChatWorkspace
          compact={compact}
          mode={theme}
          language={language}
          palette={palette}
          appCopy={s}
          active={active}
          chatError={chatError}
          offlineNotice={offlineNotice}
          findQuery={findOpen ? findQuery : ''}
          activeFindIndex={activeFindIndex}
          onRetryTurn={() => void retryTurn()}
          diagnostic={showDiagnostic && active ? {
            questions: tutorQuestions,
            answers: tutorAnswers,
            onChange: (answers) => persistDiagnosticAnswers(active.id, answers),
            onSubmit: (answers) => void submitDiagnostic(active.id, answers),
          } : null}
          exam={isExam && examData && active ? {
            examData,
            onChange: (data, immediate) => persistExam(active.id, data, immediate),
            onSubmit: (data) => persistExam(active.id, data, true),
          } : null}
          messageList={{
            onCopyText: copyText,
            onSpeakText: speak,
            onShareMessage: () => openShare(),
            onEditMessage: user && !user.isGuest ? (message) => startEdit(messageKey(message) || '', message.rawText || '') : undefined,
            onRegenerateMessage: user && !user.isGuest ? (message) => void regenerate(messageKey(message) || '') : undefined,
            onBranchMessage: (message) => void branchFrom(messageKey(message) || ''),
            onOpenArtifact: setArtifact,
            onOpenStoredArtifact: openStoredArtifact,
            resolveImage,
            onOpenFile: openAttachment,
            onQuizPick,
            onPracticeSubmit,
            redoItems: redo.sessionId === activeId ? redo.items : undefined,
            quizSlotResets: redo.sessionId === activeId ? redo.resets : undefined,
          }}
          editingId={editingId}
          onCancelEdit={cancelEdit}
          composer={{
            value: draft,
            streaming: status === 'sending' || status === 'streaming',
            onChangeText: useChatStore.getState().setDraft,
            onSend: editingId ? commitEditSend : send,
            onStop: stop,
            attachments: staged.map((item) => ({ id: item.localId, name: item.name })),
            canCapturePhoto: supportsCamera,
            voiceInputSupported,
            listening,
            onPickImages: () => void onPickImages(),
            onTakePhoto: () => void onTakePhoto(),
            onPickFile: () => void onPickFile(),
            onRemoveAttachment: removeStaged,
            onToggleListen: toggleListen,
          }}
        />
      </View>
    </KeyboardAvoidingView>
    <AppOverlays
      artifact={{ artifact, mode: theme, language, onClose: () => setArtifact(null) }}
      modelPicker={{
        providers,
        activeId: activeModel?.id ?? null,
        open: modelMenuOpen,
        mode: theme,
        language,
        onPick: (id) => void pickModel(id),
        onManage: () => { setModelMenuOpen(false); setProvidersReturn('chat'); setScreen('providers'); void loadProviders(); },
        onClose: () => setModelMenuOpen(false),
      }}
      assistantPicker={{
        assistants,
        activeId: active?.assistantId ?? null,
        open: assistantMenuOpen,
        mode: theme,
        language,
        onPick: (id) => void bindAssistant(id),
        onManage: () => { setAssistantMenuOpen(false); setScreen('assistants'); void loadAssistants(); },
        onClose: () => setAssistantMenuOpen(false),
      }}
      filePreview={previewFile ? {
        file: previewFile,
        mode: theme,
        language,
        target: fileTarget,
        loadPreview: loadFilePreview,
        onClose: closePreview,
      } : null}
      findBar={{
        open: findOpen,
        query: findQuery,
        count: findMatches.length,
        activeIndex: activeFindIndex,
        compact,
        mode: theme,
        language,
        onChange: updateFindQuery,
        onPrevious: previousFind,
        onNext: nextFind,
        onClose: closeFind,
      }}
      shareDialog={{
        open: shareOpen,
        visibility: shareVisibility,
        url: shareUrl,
        busy: shareBusy,
        status: shareStatus,
        error: shareError,
        mode: theme,
        language,
        onSelectVisibility: setShareVisibility,
        onCopy: () => void copyShare(),
        onCreate: () => void createShare(),
        onRevoke: () => void revokeShare(),
        onClose: closeShare,
      }}
    />
  </SafeAreaView>;
}
export default function App() {
  // Baseline typography: the SPA ships Inter (+ Noto Sans SC for CJK) from
  // @fontsource; the app loads the same faces before the first paint so
  // every text node measures identically.
  const [fontsLoaded] = useFonts(FONTS);
  return <SafeAreaProvider><IconRendererProvider renderer={webIconRenderer}>{fontsLoaded ? <SocratesApp /> : null}</IconRendererProvider></SafeAreaProvider>;
}

/** Baseline `SidebarFooter.tsx` upgrade link. */
const PRICING_URL = 'https://topodrive.top/pricing';
