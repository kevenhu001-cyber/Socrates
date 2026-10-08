import 'react-native-reanimated';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Linking, Platform, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import type { AccountUsage, Assistant, ExamData, Message, Project, ProviderKey, Session, TutorData } from '@socrates/contracts';
import { buildBranchSession, createMessageOutbox, findRegenerateTarget, isLocalSessionId, runChatTurn, useChatStore, visibleSessions as getVisibleSessions } from '@socrates/chat';
import { persistUser } from '@socrates/auth';
import { useAuthStore } from '@socrates/auth';
import { useSettingsStore } from '@socrates/settings';
import { fontStyle, getThemePaletteHex } from '@socrates/theme';
import { AssistantPicker, ChatMessageList, Composer, DiagView, ExamView, Icon, IconRendererProvider, ModelPicker, Sidebar, activeProviderOf, applyDiagnosticResults, assistantConfigOf, buildColdStartNodes, assignMistakeQuizSlot, buildEmbeddedDocument, buildTeachingPlanFromKB, bumpMistakeRedo, findMessageMatches, messageQuizSlotId, mistakeRedoPlan, normalizeMistakes, paletteForDocument, parseExamQuestions, practiceMistakeFor, prependMistake, quizMistakeFor, removeMistakesForQuizSlot, storedFileIdFromRawUrl, syncCurrentNodeFromTeachingPlan, tutorProgressForTurn, uiStrings, type ArtifactDescriptor, type BookMistake, type BoundarySnapshot, type DiagQuestion, type KnowledgeBoundaryNode, type MistakeRedoItem, type PracticeSubmission, type MistakeFilter, type QuizPick, type SidebarNavItem, type SidebarView, type TeachingPlan, type TutorProgressNode } from '@socrates/ui';
import { api, appWebOrigin, streamConversation } from './src/runtime';
import { storage } from './src/storage';
import { copyText } from './src/clipboard';
import { capturePhoto, extractPickedDocument, pickDocument, pickImages, supportsCamera } from './src/attachments';
import { persistStagedAttachment } from './src/attachmentUpload';
import { stagedToMessageAttachment, type PickedFile, type StagedAttachment } from './src/attachmentModels';
import { listenOnce, listenSupported, speakText, stopSpeaking } from './src/speech';
import { FONTS } from './src/fonts';
import { AuthGate } from './src/AuthGate';
import { ArtifactViewer } from './src/ArtifactViewer';
import { FilePreview } from './src/FilePreview';
import { FilesScreen } from './src/FilesScreen';
import { ExamSetupScreen, type ExamRunState, type ExamSetupInput } from './src/ExamSetupScreen';
import { TutorSetupScreen, type TutorRunState, type TutorSetupInput } from './src/TutorSetupScreen';
import { buildExamData, generateExamQuestions } from './src/examGeneration';
import { generateDiagQuestions } from './src/tutorGeneration';
import { useFileImages } from './src/useFileImages';
import type { FileAccessTarget, FileImageSource, StoredFileRef } from './src/fileAccess';
import { SettingsScreen } from './src/SettingsScreen';
import { ProjectsScreen } from './src/ProjectsScreen';
import { SearchScreen } from './src/SearchScreen';
import { installWebTextDefaults } from './src/webTextDefaults';
import { FindBar } from './src/FindBar';
import { ShareDialog, type ShareDialogVisibility } from './src/ShareDialog';
import { ModelCaret } from './src/ModelCaret';
import { ModelSwitcherBrand } from './src/ModelSwitcherBrand';
import { SidebarLogoText, SidebarNavLabelBadge } from './src/SidebarText';
import { webIconRenderer } from './src/iconRenderer';
import { ProvidersScreen } from './src/ProvidersScreen';
import { AssistantsScreen, type AssistantDraft } from './src/AssistantsScreen';
import { appStrings, appStringsNow } from './src/strings';

const initialSessions: Session[] = [{ id: 'welcome', title: 'Welcome to Socrates', topic: 'Universal app', mode: 'chat', phase: 'chat', messages: [{ clientId: 'welcome-assistant', role: 'assistant', rawText: 'How can I help you learn today?' }] }];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server-owned ids only: the messages API scopes ops by session, and a
 * drain can run while another session is active — never send a local
 * `session-*` id as the scope. */
function uuidScope(id: string | null | undefined): string | null {
  return id && UUID_RE.test(id) ? id : null;
}
/** Baseline recordMistake context: session topic + current KB node. */
function mistakeContextOf(session: Session): { topic: string; node: string; nodeIdx: number | null } {
  const nodeIdx = typeof session.currentNode === 'number' ? session.currentNode : null;
  const node = nodeIdx !== null ? (session.kbNodes as Array<{ name?: string }> | undefined)?.[nodeIdx]?.name : undefined;
  return { topic: session.topic || '', node: node || '', nodeIdx };
}
/** Baseline persistMistake: best-effort mirror to POST /api/mistakes for a
 * signed-in account (the session array stays the source of truth). */
function mirrorMistake(sessionId: string, mistake: BookMistake): void {
  const owner = useAuthStore.getState().user;
  if (!owner || owner.isGuest) return;
  void api.mistakes.create({
    sessionId: uuidScope(sessionId),
    nodeName: mistake.node || null,
    questionContent: mistake.q || '',
    userAnswer: mistake.userAnswer,
    correctAnswer: mistake.correct,
    source: mistake.type === 'practice' ? 'practice' : 'quiz',
  }).catch(() => { /* Mirror only; the session save carries the book. */ });
}
function messageKey(message: { clientId?: string | null; id?: string }): string | null {
  return message.clientId || message.id || null;
}
/** Assistant config → the `source` JSON string the artifacts API stores. */
function assistantSource(entry: AssistantDraft): string {
  return JSON.stringify({ description: entry.description, instructions: entry.instructions, starter: entry.starter });
}
/** Rebuild restored Tutor ordering the same way the SPA session loader does.
 * The saved plan can lag behind node status changes; the knowledge plan is
 * blank-first and its first unfinished node owns the resumed Tutor position. */
function normalizeRestoredTutorSession(session: Session): Session {
  if (session.mode !== 'tutor' || !Array.isArray(session.kbNodes) || session.kbNodes.length === 0) return session;
  const nodes = session.kbNodes as unknown as TutorProgressNode[];
  const plan = buildTeachingPlanFromKB(nodes);
  const synced = plan ? syncCurrentNodeFromTeachingPlan(plan, nodes) : null;
  return {
    ...session,
    teachingPlan: (synced?.teachingPlan ?? plan ?? session.teachingPlan) as Session['teachingPlan'],
    currentNode: synced?.currentNode ?? session.currentNode ?? 0,
    substantiveCount: 0,
    practicePhase: session.practicePhase || 'foundation',
    practiceAttempts: session.practiceAttempts || 0,
  };
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
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [screen, setScreen] = useState<'chat' | 'settings' | 'projects' | 'search' | 'providers' | 'files' | 'assistants' | 'exam-setup' | 'tutor-setup'>('chat');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  /** Session id awaiting a move target; opens the projects screen in pick mode. */
  const [movePickSession, setMovePickSession] = useState<string | null>(null);
  const [archived, setArchived] = useState<Session[]>([]);
  const [accountUsage, setAccountUsage] = useState<AccountUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderKey[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [assistantsLoading, setAssistantsLoading] = useState(false);
  const [assistantsError, setAssistantsError] = useState<string | null>(null);
  const [assistantMenuOpen, setAssistantMenuOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [activeFindIndex, setActiveFindIndex] = useState(-1);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSessionId, setShareSessionId] = useState<string | null>(null);
  const [shareVisibility, setShareVisibility] = useState<ShareDialogVisibility>('public');
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [shareError, setShareError] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  /** Where the providers screen returns to (settings entry vs chat menu). */
  const [providersReturn, setProvidersReturn] = useState<'settings' | 'chat'>('settings');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [staged, setStaged] = useState<StagedAttachment[]>([]);
  const [artifact, setArtifact] = useState<ArtifactDescriptor | null>(null);
  const [previewFile, setPreviewFile] = useState<StoredFileRef | null>(null);
  const [examRun, setExamRun] = useState<ExamRunState>({ running: false, progress: null, error: null });
  const [tutorRun, setTutorRun] = useState<TutorRunState>({ running: false, progress: null, error: null });
  /** User turn being edited: the composer draft holds the new text and
   * Send commits the edit instead of starting a fresh turn. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const draftBackup = useRef<string | null>(null);
  /** Set when an edit/regenerate could not reach the server and its ops
   * are waiting in the outbox; cleared once the queue drains. */
  const [offlineNotice, setOfflineNotice] = useState(false);
  const [listening, setListening] = useState(false);
  const listenStop = useRef<(() => void) | null>(null);
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
  // Mistake book: rows read in the baseline record shape; redo cards and
  // in-place quiz remounts are transcript-local (baseline appends DOM that a
  // session switch discards), so they follow the active session only.
  const activeMistakes = useMemo(() => active?.mode === 'tutor' ? normalizeMistakes(active.mistakes) : [], [active]);
  /* Baseline: `kb.mistakeFilter` is restored per session on load and saved
   * with the session (persistence.js), defaulting to `all`. */
  const activeMistakeFilter: MistakeFilter = active?.mistakeFilter === 'unresolved' || active?.mistakeFilter === 'resolved' ? active.mistakeFilter : 'all';
  const setActiveMistakeFilter = useCallback((filter: MistakeFilter) => {
    const store = useChatStore.getState();
    if (store.activeSessionId) store.patchSession(store.activeSessionId, { mistakeFilter: filter });
  }, []);
  const [redo, setRedo] = useState<{ sessionId: string | null; items: MistakeRedoItem[]; resets: Record<string, number> }>({ sessionId: null, items: [], resets: {} });
  useEffect(() => {
    setRedo((prev) => {
      if (prev.sessionId === activeId) return prev;
      // A local id adopted to its server UUID is the same transcript; any
      // other switch drops the local redo cards.
      const adopted = !!prev.sessionId && !useChatStore.getState().sessions.some((session) => session.id === prev.sessionId);
      return adopted ? { ...prev, sessionId: activeId } : { sessionId: activeId, items: [], resets: {} };
    });
  }, [activeId]);
  const findMatches = useMemo(() => findMessageMatches(active?.messages || [], findQuery), [active?.messages, findQuery]);
  const visibleSessions = useMemo(
    () => {
      return getVisibleSessions(sessions, projectFilter);
    },
    [sessions, projectFilter],
  );
  const activeProject = useMemo(() => projects.find((p) => p.id === projectFilter) || null, [projects, projectFilter]);
  const activeModel = useMemo(() => activeProviderOf(providers), [providers]);
  const activeModelLabel = activeModel ? (activeModel.label || activeModel.model || 'Model') : s.openModelMenu;
  const streamAbort = useRef<AbortController | null>(null);
  const accountEpoch = useRef(0);
  const syncEpoch = useRef(0);
  const loadingDetails = useRef(new Set<string>());
  const tutorSaveQueues = useRef(new Map<string, Promise<void>>());
  const tutorSaveAliases = useRef(new Map<string, string>());
  const chatError = useChatStore((state) => state.error);
  // Stored files: resolve transcript raw-URLs into platform image sources and
  // preview/download through the authenticated file library.
  const fileTarget = useMemo<FileAccessTarget>(() => ({
    rawUrl: (id) => api.files.rawUrl(id),
    fetch: api.fetchWithAuth,
    readToken: async () => (await api.readTokens()).accessToken,
  }), []);
  const fileImages = useFileImages(active?.messages, fileTarget);
  const resolveImage = useCallback((src: string): FileImageSource | null => {
    const id = storedFileIdFromRawUrl(src);
    return id ? fileImages[id] ?? null : null;
  }, [fileImages]);
  const openAttachment = useCallback((attachment: { fileId?: string; name: string; mime: string; size: number; kind: string }) => {
    if (attachment.fileId) setPreviewFile({ id: attachment.fileId, name: attachment.name, mimeType: attachment.mime, size: attachment.size, kind: attachment.kind });
  }, []);
  // HTML tool artifacts render in the island; the bytes are fetched with the
  // same authenticated raw endpoint and wrapped in the sandbox shell.
  const openStoredArtifact = useCallback((file: { id: string; mimeType?: string | null; name?: string | null }) => {
    const title = file.name || 'Artifact';
    const artifactId = `artifact-file-${file.id}`;
    setArtifact({
      id: artifactId,
      kind: 'html',
      title,
      summary: '',
      document: () => '',
      loadDocument: async () => {
        const response = await api.files.fetchRaw(file.id);
        if (!response.ok) throw new Error(`File request failed (${response.status})`);
        return buildEmbeddedDocument({ artifactId, kind: 'html', title, source: await response.text(), palette: paletteForDocument(theme) });
      },
    });
  }, [theme]);
  const listFiles = useCallback(() => api.files.list(), []);
  const removeFile = useCallback((id: string) => api.files.remove(id), []);
  const loadFilePreview = useCallback((id: string) => api.files.preview(id), []);
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
  // Exam sessions carry client-generated questions + answers in examData;
  // answering and grading stay local, persistence is debounced and the store
  // is patched immediately so a session switch never loses answers.
  const examData = active?.kind === 'exam' ? (active.examData as ExamData | null | undefined) ?? null : null;
  const examQuestions = useMemo(() => parseExamQuestions(examData), [examData]);
  const isExam = examQuestions.length > 0;
  // Tutor sessions carry the local diagnostic Q&A in tutorData until the
  // learner submits; afterwards the transcript teaches from the KB plan.
  const tutorData = active?.kind === 'tutor' ? (active.tutorData as TutorData | null | undefined) ?? null : null;
  const tutorQuestions = useMemo(
    () => (Array.isArray(tutorData?.questions) ? (tutorData.questions as unknown as DiagQuestion[]) : []),
    [tutorData],
  );
  const tutorAnswers = useMemo(() => {
    const raw = tutorData?.answers as Record<string, unknown> | undefined;
    const out: Record<number, number> = {};
    if (raw) {
      for (const [key, value] of Object.entries(raw)) {
        const question = Number(key);
        if (Number.isInteger(question) && typeof value === 'number') out[question] = value;
      }
    }
    return out;
  }, [tutorData]);
  const showDiagnostic = !!active && tutorQuestions.length > 0 && tutorData?.submitted !== true;
  const persistDiagnosticAnswers = useCallback((sessionId: string, answers: Record<number, number>) => {
    const current = useChatStore.getState().sessions.find((s) => s.id === sessionId);
    if (!current || current.kind !== 'tutor') return;
    useChatStore.getState().patchSession(sessionId, {
      tutorData: { questions: current.tutorData?.questions, answers: answers as unknown as TutorData['answers'], submitted: false },
    });
  }, []);
  const examSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistExam = useCallback((sessionId: string, data: ExamData, immediate: boolean) => {
    useChatStore.getState().patchSession(sessionId, { kind: 'exam', examData: data });
    if (examSaveTimer.current) clearTimeout(examSaveTimer.current);
    const save = () => {
      examSaveTimer.current = null;
      void api.sessions.patch(sessionId, { kind: 'exam', examData: data }).catch(() => undefined);
    };
    if (immediate) save();
    else examSaveTimer.current = setTimeout(save, 700);
  }, []);
  // New-exam flow: generate one question per streaming call, then persist the
  // resulting exam session (kind='exam' + examData) like the web baseline.
  const examAbort = useRef<AbortController | null>(null);
  const startExamGeneration = useCallback(async (input: ExamSetupInput) => {
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { setExamRun({ running: false, progress: null, error: appStringsNow().guestSendBlocked }); return; }
    examAbort.current?.abort();
    const controller = new AbortController();
    examAbort.current = controller;
    const epoch = accountEpoch.current;
    setExamRun({ running: true, progress: { done: 0, total: input.count, phase: 'generating' }, error: null });
    try {
      const { questions, lang } = await generateExamQuestions(input, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (epoch === accountEpoch.current) setExamRun((prev) => ({ ...prev, progress: { done: progress.done, total: progress.total, phase: progress.phase } }));
        },
      });
      if (epoch !== accountEpoch.current) return;
      const examData = buildExamData(input, questions, lang);
      const id = `session-${Date.now()}`;
      const draft: Session = { id, title: input.topic, topic: input.topic, mode: 'chat', phase: 'chat', kind: 'exam', examData, messages: [] };
      const store = useChatStore.getState();
      store.setSessions([draft, ...store.sessions]);
      store.selectSession(id);
      examAbort.current = null;
      setExamRun({ running: false, progress: null, error: null });
      setScreen('chat');
      try {
        const saved = await api.sessions.save(draft);
        if (epoch === accountEpoch.current) useChatStore.getState().adoptSessionId(id, saved);
      } catch { /* the exam stays local until the next library sync */ }
    } catch {
      if (controller.signal.aborted) {
        if (epoch === accountEpoch.current) setExamRun({ running: false, progress: null, error: null });
        return;
      }
      if (epoch === accountEpoch.current) setExamRun({ running: false, progress: null, error: appStringsNow().examGenerateFailed });
    }
  }, []);
  const cancelExamGeneration = useCallback(() => {
    examAbort.current?.abort();
    examAbort.current = null;
    setExamRun({ running: false, progress: null, error: null });
  }, []);
  const closeExamSetup = useCallback(() => {
    examAbort.current?.abort();
    examAbort.current = null;
    setExamRun({ running: false, progress: null, error: null });
    setScreen('chat');
  }, []);
  // Tutor flow: generate one diagnostic question per streaming call, then
  // persist a tutor session (cold-start KB + local diag Q&A) like the web
  // baseline's cold start. Teaching starts after the learner submits.
  const tutorAbort = useRef<AbortController | null>(null);
  const startTutorGeneration = useCallback(async (input: TutorSetupInput) => {
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { setTutorRun({ running: false, progress: null, error: appStringsNow().guestSendBlocked }); return; }
    tutorAbort.current?.abort();
    const controller = new AbortController();
    tutorAbort.current = controller;
    const epoch = accountEpoch.current;
    setTutorRun({ running: true, progress: { done: 0, total: input.count, phase: 'generating' }, error: null });
    try {
      const { questions } = await generateDiagQuestions(
        { topic: input.topic, count: input.count, language: useSettingsStore.getState().language },
        {
          signal: controller.signal,
          onProgress: (progress) => {
            if (epoch === accountEpoch.current) setTutorRun((prev) => ({ ...prev, progress: { done: progress.done, total: progress.total, phase: progress.phase } }));
          },
        },
      );
      if (epoch !== accountEpoch.current) return;
      const id = `session-${Date.now()}`;
      const tutorData: TutorData = {
        questions: questions as unknown as TutorData['questions'],
        answers: {},
        submitted: false,
      };
      const draft: Session = {
        id, title: input.topic, topic: input.topic, mode: 'tutor', phase: 'chat', kind: 'tutor',
        tutorData, kbNodes: buildColdStartNodes(input.topic) as unknown as Session['kbNodes'],
        teachingStage: 'motivate', currentNode: 0, substantiveCount: 0, messages: [],
      };
      const store = useChatStore.getState();
      store.setSessions([draft, ...store.sessions]);
      store.selectSession(id);
      tutorAbort.current = null;
      setTutorRun({ running: false, progress: null, error: null });
      setScreen('chat');
      try {
        const saved = await api.sessions.save(draft);
        if (epoch === accountEpoch.current) useChatStore.getState().adoptSessionId(id, saved);
      } catch { /* the tutor session stays local until the next library sync */ }
    } catch {
      if (controller.signal.aborted) {
        if (epoch === accountEpoch.current) setTutorRun({ running: false, progress: null, error: null });
        return;
      }
      if (epoch === accountEpoch.current) setTutorRun({ running: false, progress: null, error: appStringsNow().tutorGenerateFailed });
    }
  }, []);
  const cancelTutorGeneration = useCallback(() => {
    tutorAbort.current?.abort();
    tutorAbort.current = null;
    setTutorRun({ running: false, progress: null, error: null });
  }, []);
  const closeTutorSetup = useCallback(() => {
    tutorAbort.current?.abort();
    tutorAbort.current = null;
    setTutorRun({ running: false, progress: null, error: null });
    setScreen('chat');
  }, []);
  // Diagnostic submit: fold answers into the KB baseline, build the
  // teaching plan, and persist the full session (kbNodes/plan/stage are
  // server-supported; the Q&A itself stays local, like the baseline).
  const submitDiagnostic = useCallback(async (sessionId: string, answers: Record<number, number>) => {
    const store = useChatStore.getState();
    const session = store.sessions.find((s) => s.id === sessionId);
    const questions = ((session?.tutorData?.questions as unknown as DiagQuestion[]) || []);
    if (!session || !questions.length) return;
    const kbNodes = applyDiagnosticResults({
      kbNodes: ((session.kbNodes as unknown as Parameters<typeof applyDiagnosticResults>[0]['kbNodes']) || []),
      diagQuestions: questions,
      diagAnswers: questions.map((_, i) => answers[i]),
    });
    const teachingPlan = buildTeachingPlanFromKB(kbNodes);
    const synced = teachingPlan ? syncCurrentNodeFromTeachingPlan(teachingPlan, kbNodes) : null;
    store.patchSession(sessionId, {
      kbNodes: kbNodes as unknown as Session['kbNodes'],
      teachingPlan: (synced ? synced.teachingPlan : teachingPlan) as unknown as Session['teachingPlan'],
      currentNode: synced ? synced.currentNode : 0,
      teachingStage: 'motivate',
      substantiveCount: 0,
      tutorData: { questions: session.tutorData?.questions, answers: answers as unknown as TutorData['answers'], submitted: true },
    });
    try {
      const updated = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      if (updated) await api.sessions.save(updated);
    } catch { /* the plan stays local until the next turn save */ }
  }, []);

  const persistTutorPatch = useCallback((sessionId: string, patch: Partial<Session>) => {
    const store = useChatStore.getState();
    store.patchSession(sessionId, patch);
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) return;
    const epoch = accountEpoch.current;
    const previous = tutorSaveQueues.current.get(sessionId) || Promise.resolve();
    const save = previous.catch(() => undefined).then(async () => {
      if (epoch !== accountEpoch.current) return;
      const resolvedId = tutorSaveAliases.current.get(sessionId) || sessionId;
      const latestStore = useChatStore.getState();
      const latest = latestStore.sessions.find((session) => session.id === resolvedId)
        || latestStore.sessions.find((session) => session.id === sessionId);
      if (!latest) return;
      const saved = await api.sessions.save(latest);
      if (epoch !== accountEpoch.current) return;
      const current = useChatStore.getState().sessions.find((session) => session.id === latest.id);
      if (current) useChatStore.getState().adoptSessionId(latest.id, { ...saved, ...current, id: saved.id });
      tutorSaveAliases.current.set(sessionId, saved.id);
    }).catch(() => { /* Keep the local Tutor edit; the next turn retries its session save. */ });
    tutorSaveQueues.current.set(sessionId, save);
    void save.then(() => {
      if (tutorSaveQueues.current.get(sessionId) === save) tutorSaveQueues.current.delete(sessionId);
    });
  }, []);

  const updateKnowledgeNode = useCallback((index: number, patch: Partial<KnowledgeBoundaryNode>) => {
    const session = active;
    if (!session || session.mode !== 'tutor') return;
    const nodes = ((session.kbNodes || []) as unknown as KnowledgeBoundaryNode[]).map((node, nodeIndex) => (
      nodeIndex === index ? { ...node, ...patch } : node
    ));
    persistTutorPatch(session.id, { kbNodes: nodes as unknown as Session['kbNodes'] });
  }, [active, persistTutorPatch]);

  const saveKnowledgeSnapshot = useCallback(() => {
    const session = active;
    if (!session || session.mode !== 'tutor') return;
    const nodes = (session.kbNodes || []) as unknown as KnowledgeBoundaryNode[];
    const counts = { internalized: 0, fuzzy: 0, blank: 0 };
    for (const node of nodes) {
      if (node.status === 'internalized') counts.internalized += 1;
      else if (node.status === 'fuzzy') counts.fuzzy += 1;
      else counts.blank += 1;
    }
    const snapshot: BoundarySnapshot & { counts: typeof counts } = {
      date: new Date().toISOString().slice(0, 10),
      at: Date.now(),
      summary: `I ${counts.internalized} · F ${counts.fuzzy} · B ${counts.blank}`,
      counts,
    };
    const history = [...(session.boundariesHistory || []), snapshot as unknown as NonNullable<Session['boundariesHistory']>[number]].slice(-30);
    persistTutorPatch(session.id, { boundariesHistory: history });
  }, [active, persistTutorPatch]);

  // Personas are loaded with the library so the header chip can name the
  // bound assistant right after a reload; failures stay off the main sync
  // path (the picker screen surfaces them with a retry).
  const loadAssistants = useCallback(async () => {
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { setAssistants([]); return; }
    const epoch = accountEpoch.current;
    setAssistantsLoading(true); setAssistantsError(null);
    try {
      const rows = await api.assistants.list();
      if (epoch === accountEpoch.current) setAssistants(rows);
    } catch (error) {
      if (epoch === accountEpoch.current) setAssistantsError(error instanceof Error ? error.message : appStringsNow().assistantsLoadFailed);
    } finally {
      if (epoch === accountEpoch.current) setAssistantsLoading(false);
    }
  }, []);
  const syncLibrary = useCallback(async () => {
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) return;
    const epoch = accountEpoch.current;
    const sync = ++syncEpoch.current;
    const current = () => epoch === accountEpoch.current && sync === syncEpoch.current;
    setProjectsLoading(true); setProjectsError(null);
    void loadAssistants();
    try {
      const [fetchedProjects, fetchedSessions, fetchedArchived] = await Promise.all([
        api.projects.list(), api.sessions.list(), api.sessions.listArchived(),
      ]);
      if (!current()) return;
      setProjects(fetchedProjects);
      setArchived(fetchedArchived);
      useChatStore.getState().reconcileSessions(fetchedSessions);
    } catch (error) {
      if (current()) setProjectsError(error instanceof Error ? error.message : appStringsNow().syncFailed);
    } finally {
      if (current()) setProjectsLoading(false);
    }
  }, [loadAssistants]);

  useEffect(() => {
    const reset = () => {
      accountEpoch.current++; syncEpoch.current++;
      streamAbort.current?.abort(); streamAbort.current = null;
      listenStop.current?.(); listenStop.current = null; setListening(false);
      stopSpeaking();
      loadingDetails.current.clear();
      setStaged([]);
      setProjects([]); setProjectsLoading(false); setProjectsError(null);
      setArchived([]);
      setAccountUsage(null); setUsageLoading(false); setUsageError(null);
      setProviders([]); setProvidersLoading(false); setProvidersError(null);
      setAssistants([]); setAssistantsLoading(false); setAssistantsError(null);
      setAuthNotice(null);
      setArtifact(null);
      setPreviewFile(null);
      examAbort.current?.abort();
      examAbort.current = null;
      setExamRun({ running: false, progress: null, error: null });
      tutorAbort.current?.abort();
      tutorAbort.current = null;
      setTutorRun({ running: false, progress: null, error: null });
      setProjectFilter(null); setMovePickSession(null); setMenuOpen(false); setConfirmDelete(false); setScreen('chat');
      setModelMenuOpen(false); setProvidersReturn('settings');
      setAssistantMenuOpen(false);
      setFindOpen(false); setFindQuery(''); setActiveFindIndex(-1);
      setShareOpen(false); setShareSessionId(null); setShareToken(null); setShareUrl(''); setShareStatus(''); setShareError(''); setShareBusy(false);
      setEditingId(null); draftBackup.current = null; setOfflineNotice(false);
      useChatStore.getState().reset();
      useChatStore.getState().setSessions(initialSessions);
      useChatStore.getState().selectSession('welcome');
    };
    reset();
    const unsubscribe = useAuthStore.subscribe((next, previous) => {
      if (next.user?.id !== previous.user?.id) reset();
    });
    void useSettingsStore.getState().hydrate(storage);
    void useAuthStore.getState().restore(storage, () => api.auth.me()).then(() => void syncLibrary());
    return () => { unsubscribe(); accountEpoch.current++; streamAbort.current?.abort(); };
  }, [syncLibrary]);
  const select = useCallback((id: string) => {
    const store = useChatStore.getState();
    store.selectSession(id);
    if (compact) setSidebarOpen(false);
    // Lazy detail: list rows carry no messages; fetch once for server ids.
    const session = store.sessions.find((s) => s.id === id);
    const authed = useAuthStore.getState().user;
    if (session && !(session.messages?.length) && !isLocalSessionId(id) && authed && !authed.isGuest) {
      const epoch = accountEpoch.current;
      loadingDetails.current.add(id);
      void api.sessions.get(id).then((detail) => {
        if (epoch !== accountEpoch.current) return;
        const current = useChatStore.getState();
        if (current.turnSessionId === id || current.sessions.find((s) => s.id === id)?.messages?.length) return;
        current.patchSession(id, normalizeRestoredTutorSession({ ...detail, messages: detail.messages ?? [] }));
      }).catch((error) => {
        if (epoch === accountEpoch.current) useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().couldNotLoadConversation);
      }).finally(() => { if (epoch === accountEpoch.current) loadingDetails.current.delete(id); });
    }
  }, [compact]);
  useEffect(() => {
    setFindOpen(false);
    setFindQuery('');
    setActiveFindIndex(-1);
  }, [activeId]);
  const openFind = useCallback(() => {
    setFindQuery('');
    setActiveFindIndex(-1);
    setFindOpen(true);
  }, []);
  const nextFind = useCallback(() => {
    setActiveFindIndex((current) => findMatches.length ? (current < 0 ? 0 : (current + 1) % findMatches.length) : -1);
  }, [findMatches.length]);
  const previousFind = useCallback(() => {
    setActiveFindIndex((current) => findMatches.length ? (current < 0 ? findMatches.length - 1 : (current - 1 + findMatches.length) % findMatches.length) : -1);
  }, [findMatches.length]);
  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery('');
    setActiveFindIndex(-1);
  }, []);
  useEffect(() => {
    if (screen !== 'chat') closeFind();
  }, [screen, closeFind]);
  const openShare = useCallback(() => {
    if (!active) return;
    setShareOpen(true);
    setShareVisibility('public');
    setShareSessionId(null);
    setShareToken(null);
    setShareUrl('');
    setShareStatus(appStringsNow().shareSaving);
    setShareError('');
    setShareBusy(true);
    void (async () => {
      try {
        let sessionId = uuidScope(active.id);
        if (!sessionId) {
          const saved = await api.sessions.save(active);
          useChatStore.getState().adoptSessionId(active.id, saved);
          sessionId = uuidScope(saved.id);
        }
        if (!sessionId) throw new Error(appStringsNow().shareNone);
        setShareSessionId(sessionId);
        setShareStatus('');
      } catch (error) {
        setShareError(error instanceof Error ? error.message : appStringsNow().shareCreateFailed);
        setShareStatus('');
      } finally {
        setShareBusy(false);
      }
    })();
  }, [active]);
  const createShare = useCallback(async () => {
    if (!shareSessionId || shareBusy) return;
    setShareBusy(true); setShareError(''); setShareStatus(appStringsNow().shareCreating);
    try {
      const result = await api.sessions.createShare(shareSessionId, shareVisibility);
      const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : appWebOrigin;
      const url = `${origin}?share=${encodeURIComponent(result.token)}`;
      setShareToken(result.token); setShareUrl(url); setShareStatus(appStringsNow().shareReady);
    } catch (error) {
      setShareError(`${appStringsNow().shareCreateFailed}: ${error instanceof Error ? error.message : 'network error'}`);
      setShareStatus('');
    } finally { setShareBusy(false); }
  }, [shareBusy, shareSessionId, shareVisibility]);
  const copyShare = useCallback(async () => {
    if (!shareUrl || shareBusy) return;
    setShareBusy(true); setShareError(''); setShareStatus(appStringsNow().shareCopying);
    try { await copyText(shareUrl); setShareStatus(appStringsNow().shareCopied); }
    catch (error) { setShareError(`${appStringsNow().shareCopyFailed}: ${error instanceof Error ? error.message : 'clipboard unavailable'}`); setShareStatus(''); }
    finally { setShareBusy(false); }
  }, [shareBusy, shareUrl]);
  const revokeShare = useCallback(async () => {
    if (!shareSessionId || !shareToken || shareBusy) return;
    setShareBusy(true); setShareError(''); setShareStatus(appStringsNow().shareRevoking);
    try {
      await api.sessions.revokeShare(shareSessionId);
      setShareToken(null); setShareUrl(''); setShareStatus(appStringsNow().shareNoLink);
    } catch (error) {
      setShareError(`${appStringsNow().shareRevokeFailed}: ${error instanceof Error ? error.message : 'network error'}`);
      setShareStatus('');
    } finally { setShareBusy(false); }
  }, [shareBusy, shareSessionId, shareToken]);
  const createSession = useCallback(() => {
    const id = `session-${Date.now()}`;
    const store = useChatStore.getState();
    const draftSession: Session = { id, title: 'New chat', topic: '', mode: 'chat', phase: 'chat', messages: [] };
    if (projectFilter) draftSession.projectId = projectFilter;
    store.setSessions([draftSession, ...store.sessions]);
    select(id);
  }, [select, projectFilter]);
  const resolveStaged = useCallback(async () => {
    const out = [];
    for (const item of staged) {
      if (item.stagedKind === 'document' && item.text === undefined) {
        const tokens = await api.readTokens();
        const extracted = await extractPickedDocument(
          { name: item.name, mime: item.mime, size: item.size, stagedKind: item.stagedKind, ...(item.nativeUri ? { nativeUri: item.nativeUri } : {}), ...(item.webFile ? { webFile: item.webFile } : {}) },
          { endpoint: api.files.extractUrl(), token: tokens.accessToken, fetch: api.fetchWithAuth },
        );
        out.push(stagedToMessageAttachment({ ...item, text: extracted.text, truncated: extracted.truncated, docKind: extracted.kind }));
      } else {
        out.push(stagedToMessageAttachment(item));
      }
    }
    return out;
  }, [staged]);
  // One streaming turn: shared by fresh sends, edits, regenerates and
  // retries. The caller owns the local rewind; this only streams the
  // re-ask and drains the outbox afterwards.
  const runTurn = useCallback(async (
    sessionId: string,
    text: string,
    messageAttachments: Message['attachments'],
    persistAttachments?: (serverSessionId: string) => Promise<Message['attachments'] | undefined>,
    assistantPrompt?: string,
  ) => {
    const epoch = accountEpoch.current;
    const controller = new AbortController();
    streamAbort.current = controller;
    try {
      await runChatTurn({
        sessionId, turnId: `turn-${Date.now()}`, text, ...(assistantPrompt ? { assistantPrompt } : {}),
        attachments: messageAttachments?.length ? messageAttachments : undefined,
        signal: controller.signal,
        isCurrent: () => epoch === accountEpoch.current,
        save: (session) => api.sessions.save(session),
        ...(persistAttachments ? { persistAttachments } : {}),
        stream: streamConversation,
      });
    } finally {
      if (streamAbort.current === controller) streamAbort.current = null;
    }
    void drainOutbox();
  }, [drainOutbox]);
  const jumpToKnowledgeNode = useCallback((index: number) => {
    if (!active || active.mode !== 'tutor') return;
    const store = useChatStore.getState();
    if (store.turnId) return;
    const nodes = (active.kbNodes || []) as unknown as KnowledgeBoundaryNode[];
    const node = nodes[index];
    if (!node) return;
    store.patchSession(active.id, { currentNode: index, substantiveCount: 0 });
    const hasHistory = (active.messages || []).some((message) => message.role === 'assistant' && !!(message.rawText || message.content));
    const assistantPrompt = hasHistory
      ? 'Continue the lesson from where we left off.'
      : `I'm ready to begin. Please teach me about ${node.name || active.topic}.`;
    void runTurn(active.id, '', undefined, undefined, assistantPrompt);
  }, [active, runTurn]);
  // One composer/synthetic turn. `origin` decides attachment staging, draft
  // handling and the tutor stage machine: composer sends snapshot the
  // staged files and let beginTurn clear the draft; quiz/practice proxies
  // keep the draft and never advance a stage from their own answer text.
  const submitTurn = useCallback((rawText: string, origin: 'composer' | 'quiz' | 'practice') => {
    const store = useChatStore.getState();
    const text = rawText.trim();
    const snapshot = origin === 'composer' ? staged : [];
    if (!text && !snapshot.length) return;
    if (store.turnId) return;
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { store.setStatus('error', appStringsNow().guestSendBlocked); return; }
    if (store.activeSessionId && loadingDetails.current.has(store.activeSessionId)) {
      store.setStatus('error', appStringsNow().conversationLoading); return;
    }
    stopSpeaking();
    listenStop.current?.(); listenStop.current = null; setListening(false);
    const previousDraft = store.draft;
    void (async () => {
      let messageAttachments: Message['attachments'] | undefined;
      if (origin === 'composer') {
        try {
          messageAttachments = await resolveStaged();
        } catch (error) {
          useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().prepareAttachmentsFailed);
          return;
        }
      }
      const live = useChatStore.getState();
      if (live.turnId) return;
      let sessionId = live.activeSessionId;
      const titleSource = text || snapshot[0]?.name || 'Attachment';
      if (!sessionId) {
        sessionId = `session-${Date.now()}`;
        live.setSessions([{ id: sessionId, title: titleSource.slice(0, 80), topic: '', mode: 'chat', phase: 'chat', projectId: projectFilter, messages: [] }, ...live.sessions]);
        live.selectSession(sessionId);
      }
      const epoch = accountEpoch.current;
      if (snapshot.length) setStaged((prev) => prev.filter((s) => !snapshot.some((taken) => taken.localId === s.localId)));
      // Tutor stage machine, mirroring the baseline sendPipeline._dispatchTurn:
      // every tutor turn at exercise bumps the attempt count, and a
      // substantive free-form answer — quiz picks excluded — advances one
      // stage and stops at check. Quiz picks apply their own transition in
      // onQuizPick, so a wrong pick at exercise counts in both places,
      // exactly like the web baseline.
      const turnSession = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      if (turnSession?.mode === 'tutor') {
        const progress = tutorProgressForTurn({
          teachingStage: turnSession.teachingStage,
          substantiveCount: turnSession.substantiveCount,
          practiceAttempts: turnSession.practiceAttempts,
          practicePhase: turnSession.practicePhase,
          currentNode: turnSession.currentNode,
          kbNodes: (turnSession.kbNodes || []) as unknown as TutorProgressNode[],
          teachingPlan: (turnSession.teachingPlan as unknown as TeachingPlan | null) ?? null,
        }, text, origin);
        useChatStore.getState().patchSession(sessionId, progress.patch as Partial<Session>);
      }
      // Upload each staged file with the now-known server session id so it
      // lands in the file library and stays readable by the model.
      const persist = async (serverSessionId: string) => {
        if (!messageAttachments?.length || epoch !== accountEpoch.current) return undefined;
        const tokens = await api.readTokens();
        return Promise.all(messageAttachments.map(async (attachment) => {
          const row = snapshot.find((item) => item.localId === attachment.id);
          if (!row) return attachment;
          try {
            const fileId = await persistStagedAttachment(row, { url: api.files.uploadUrl(), token: tokens.accessToken, fetch: api.fetchWithAuth }, serverSessionId);
            return fileId ? { ...attachment, fileId } : attachment;
          } catch { return attachment; }
        }));
      };
      await runTurn(sessionId, text, messageAttachments?.length ? messageAttachments : undefined, persist);
    })();
    // Synthetic sends run from the transcript; the composer draft stays
    // exactly as the learner typed it (beginTurn cleared it synchronously).
    if (origin !== 'composer') useChatStore.getState().setDraft(previousDraft);
  }, [projectFilter, staged, resolveStaged, runTurn]);
  const send = useCallback(() => { submitTurn(useChatStore.getState().draft, 'composer'); }, [submitTurn]);
  // Quiz proxy (baseline handleQuizPick + mountQuizWidget): a correct or
  // undeclared pick is terminal for the card and spends no model turn; only
  // a wrong pick with a declared answer asks the tutor to diagnose.
  const onQuizPick = useCallback((pick: QuizPick) => {
    const store = useChatStore.getState();
    const sessionId = store.activeSessionId;
    if (!sessionId) return;
    const session = store.sessions.find((s) => s.id === sessionId);
    if (!session || session.mode !== 'tutor' || store.turnId) return;
    const stage = session.teachingStage || 'motivate';
    const attempts = session.practiceAttempts || 0;
    const right = pick.isRight && !!pick.correct;
    if (stage === 'exercise') {
      store.patchSession(sessionId, right ? { teachingStage: 'check', practiceAttempts: 0 } : { practiceAttempts: attempts + 1 });
    } else if (stage === 'check') {
      store.patchSession(sessionId, { practiceAttempts: right ? 0 : attempts + 1 });
    }
    if (right && pick.slotId) {
      // Conquer path (baseline removeMistakeForQuizSlot): a right pick on a
      // slot a mistake was recorded against removes it, then saves.
      const book = normalizeMistakes(session.mistakes);
      const remaining = removeMistakesForQuizSlot(book, pick.slotId);
      if (remaining !== book) persistTutorPatch(sessionId, { mistakes: remaining as unknown as Session['mistakes'] });
    }
    if (!pick.correct || pick.isRight) return;
    const quizMistake = quizMistakeFor(
      { q: pick.q, options: pick.options, picked: pick.picked, correct: pick.correct, slotId: pick.slotId },
      mistakeContextOf(session),
    );
    if (quizMistake) {
      store.patchSession(sessionId, { mistakes: prependMistake(normalizeMistakes(session.mistakes), quizMistake) as unknown as Session['mistakes'] });
      mirrorMistake(sessionId, quizMistake);
    }
    submitTurn(`I chose ${pick.picked}. ${pick.pickedText} (Result: incorrect, correct is ${pick.correct}.)`, 'quiz');
  }, [submitTurn]);
  // Practice proxy (baseline mountPracticeWidget): submit always sends the
  // `[Practice attempt]` turn; a self-check hit also resets the attempts.
  const onPracticeSubmit = useCallback((submission: PracticeSubmission) => {
    const store = useChatStore.getState();
    const sessionId = store.activeSessionId;
    if (!sessionId) return;
    const session = store.sessions.find((s) => s.id === sessionId);
    if (!session || session.mode !== 'tutor' || store.turnId) return;
    if (submission.correct && submission.isRight) store.patchSession(sessionId, { practiceAttempts: 0 });
    const practiceMistake = practiceMistakeFor(submission, mistakeContextOf(session));
    if (practiceMistake) {
      store.patchSession(sessionId, { mistakes: prependMistake(normalizeMistakes(session.mistakes), practiceMistake) as unknown as Session['mistakes'] });
      mirrorMistake(sessionId, practiceMistake);
    }
    submitTurn(`${appStringsNow().practicePrefix}${submission.answer}`, 'practice');
  }, [submitTurn]);
  // Mistake-book Redo (baseline handleMistakeRedo): bump redoCount and save;
  // a quiz whose original card is still in the transcript remounts in place,
  // otherwise a fresh card is appended (practice rows always append) and a
  // quiz row is re-pointed at the new slot so a right pick conquers it.
  const onRedoMistake = useCallback((mistakeId: string) => {
    const store = useChatStore.getState();
    const sessionId = store.activeSessionId;
    if (!sessionId) return;
    const session = store.sessions.find((s) => s.id === sessionId);
    if (!session || session.mode !== 'tutor') return;
    const bumped = bumpMistakeRedo(normalizeMistakes(session.mistakes), mistakeId);
    if (!bumped.mistake) return;
    const plan = mistakeRedoPlan(bumped.mistake);
    if (plan.kind === 'quiz' && plan.slotId && (session.messages || []).some((message) => message.role === 'assistant' && messageQuizSlotId(message) === plan.slotId)) {
      persistTutorPatch(sessionId, { mistakes: bumped.list as unknown as Session['mistakes'] });
      const slot = plan.slotId;
      setRedo((prev) => {
        const resets = prev.sessionId === sessionId ? prev.resets : {};
        return { sessionId, items: prev.sessionId === sessionId ? prev.items : [], resets: { ...resets, [slot]: (resets[slot] || 0) + 1 } };
      });
      return;
    }
    const redoId = `redo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let item: MistakeRedoItem;
    let list = bumped.list;
    if (plan.kind === 'quiz') {
      const slotId = `${redoId}:quiz`;
      list = assignMistakeQuizSlot(list, mistakeId, slotId);
      item = { id: redoId, kind: 'quiz', q: plan.q, options: plan.options, correct: plan.correct, slotId };
    } else {
      item = { id: redoId, kind: 'practice', problem: plan.problem, correct: plan.correct };
    }
    persistTutorPatch(sessionId, { mistakes: list as unknown as Session['mistakes'] });
    setRedo((prev) => prev.sessionId === sessionId
      ? { ...prev, items: [...prev.items, item] }
      : { sessionId, items: [item], resets: {} });
  }, [persistTutorPatch]);
  // Attachments: pickers produce staged rows; documents resolve to text
  // at send time (server extract), images/text ride along directly.
  const stagePicked = useCallback((picked: PickedFile[]) => {
    setStaged((prev) => [
      ...prev,
      ...picked.map((file, index) => ({
        localId: `staged-${Date.now()}-${index}`,
        name: file.name, mime: file.mime, size: file.size, stagedKind: file.stagedKind,
        ...(file.dataUrl ? { dataUrl: file.dataUrl } : {}),
        ...(file.text !== undefined ? { text: file.text } : {}),
        ...(file.nativeUri ? { nativeUri: file.nativeUri } : {}),
        ...(file.webFile ? { webFile: file.webFile } : {}),
      } as StagedAttachment)),
    ]);
  }, []);
  const onPickImages = useCallback(async () => {
    try {
      stagePicked(await pickImages());
    } catch (error) {
      useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().pickImagesFailed);
    }
  }, [stagePicked]);
  const onTakePhoto = useCallback(async () => {
    try {
      const photo = await capturePhoto();
      if (photo) stagePicked([photo]);
    } catch (error) {
      useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().takePhotoFailed);
    }
  }, [stagePicked]);
  const onPickFile = useCallback(async () => {
    try {
      const file = await pickDocument();
      if (file) stagePicked([file]);
    } catch (error) {
      useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().pickFileFailed);
    }
  }, [stagePicked]);
  const removeStaged = useCallback((id: string) => {
    setStaged((prev) => prev.filter((s) => s.localId !== id));
  }, []);
  const stop = useCallback(() => { streamAbort.current?.abort(); }, []);
  // Queue one half of a failed server sync for replay: every dropped row
  // as an explicit delete plus (for edits) the rewritten text as a patch.
  // Never a replayed discardFollowing — it would eat turns made after
  // the reconnect. Shows the offline notice; the re-ask still runs locally.
  const queueSyncFailure = useCallback(async (
    sessionId: string, anchorKey: string, newText: string | null, dropped: Message[],
  ) => {
    const sid = uuidScope(sessionId);
    for (const row of dropped) {
      const key = messageKey(row);
      if (key) await outbox.queueMessageOp(sid, key, 'delete');
    }
    if (newText !== null) await outbox.queueMessageOp(sid, anchorKey, 'patch', newText);
    setOfflineNotice(true);
  }, [outbox]);
  const syncAnchor = useCallback(async (
    sessionId: string, anchorKey: string, content: string, dropped: Message[],
  ): Promise<boolean> => {
    try {
      await api.messages.patch(anchorKey, { content, discardFollowing: true }, uuidScope(sessionId));
      return true;
    } catch (error) {
      // A just-created local message may not have a server row yet: the
      // local rewind stays authoritative and the next save persists it.
      if ((error as { status?: number })?.status === 404) return true;
      await queueSyncFailure(sessionId, anchorKey, content, dropped);
      return false;
    }
  }, [queueSyncFailure]);
  // Edit: rewrite the user turn locally, mirror it server-side, then
  // re-ask. Starts only after the PATCH settles: discardFollowing drops
  // server rows created at/after this turn, so a delete landing after the
  // fresh reply was saved would wipe the new answer.
  const commitEdit = useCallback(async (anchorId: string, revised: string) => {
    const store = useChatStore.getState();
    const sessionId = store.activeSessionId;
    const session = store.sessions.find((s) => s.id === sessionId);
    const anchor = session?.messages?.find((m) => messageKey(m) === anchorId);
    const next = revised.trim();
    if (!sessionId || !anchor || !next || (anchor.rawText || '').trim() === next) return;
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { store.setStatus('error', appStringsNow().guestSendBlocked); return; }
    if (store.turnId) return;
    setEditingId(null);
    draftBackup.current = null;
    // Abort any in-flight stream so the new turn isn't racing the old one.
    streamAbort.current?.abort();
    const dropped = store.rewindSession(sessionId, anchorId, next);
    if (!dropped) return;
    const anchorKey = messageKey(anchor) || anchorId;
    try {
      await syncAnchor(sessionId, anchorKey, next, dropped);
      await runTurn(sessionId, next, anchor.attachments?.length ? anchor.attachments : undefined);
    } catch (error) {
      store.setStatus('error', error instanceof Error ? error.message : appStringsNow().editFailed);
    }
  }, [runTurn, syncAnchor]);
  const startEdit = useCallback((anchorId: string, text: string) => {
    const store = useChatStore.getState();
    if (store.turnId) return;
    if (draftBackup.current === null) draftBackup.current = store.draft;
    setEditingId(anchorId);
    store.setDraft(text);
  }, []);
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    if (draftBackup.current !== null) {
      useChatStore.getState().setDraft(draftBackup.current);
      draftBackup.current = null;
    }
  }, []);
  // Regenerate: same rewind, text unchanged — only the stale tail needs
  // server cleanup, so a failure queues deletes only, never a text patch.
  const regenerate = useCallback(async (assistantId: string) => {
    const store = useChatStore.getState();
    const sessionId = store.activeSessionId;
    const session = store.sessions.find((s) => s.id === sessionId);
    if (!sessionId || !session || store.turnId) return;
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { store.setStatus('error', appStringsNow().guestSendBlocked); return; }
    const target = findRegenerateTarget(session.messages || [], assistantId);
    const userText = (target?.rawText || '').trim();
    const userKey = target ? messageKey(target) : null;
    if (!target || !userText || !userKey) return;
    streamAbort.current?.abort();
    const dropped = store.rewindSession(sessionId, userKey);
    if (!dropped) return;
    try {
      try {
        await api.messages.patch(userKey, { content: userText, discardFollowing: true }, uuidScope(sessionId));
      } catch (error) {
        if ((error as { status?: number })?.status !== 404) {
          await queueSyncFailure(sessionId, userKey, null, dropped);
        }
      }
      await runTurn(sessionId, userText, target.attachments?.length ? target.attachments : undefined);
    } catch (error) {
      store.setStatus('error', error instanceof Error ? error.message : appStringsNow().regenerateFailed);
    }
  }, [queueSyncFailure, runTurn]);
  // Retry: the last turn failed (or was stopped) — drop its partial tail
  // and replay the last user turn. No server cleanup: the failed reply was
  // never confirmed saved, and the final save upserts the replay.
  const retryTurn = useCallback(async () => {
    const store = useChatStore.getState();
    if (store.turnId || store.status !== 'error') return;
    const sessionId = store.activeSessionId;
    const session = store.sessions.find((s) => s.id === sessionId);
    if (!sessionId || !session) return;
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { store.setStatus('error', appStringsNow().guestSendBlocked); return; }
    const messages = session.messages || [];
    let target: Message | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && (messages[i].rawText || '').trim()) { target = messages[i]; break; }
    }
    const text = (target?.rawText || '').trim();
    const key = target ? messageKey(target) : null;
    if (!target || !text || !key) return;
    streamAbort.current?.abort();
    if (!store.rewindSession(sessionId, key)) return;
    try {
      await runTurn(sessionId, text, target.attachments?.length ? target.attachments : undefined);
    } catch (error) {
      store.setStatus('error', error instanceof Error ? error.message : appStringsNow().regenerateFailed);
    }
  }, [runTurn]);
  // Branch: fork the transcript at the anchor into a fresh local session
  // (kept as a `session-*` id so library sync preserves it until saved).
  const branchFrom = useCallback(async (anchorId: string) => {
    const store = useChatStore.getState();
    const session = store.sessions.find((s) => s.id === store.activeSessionId);
    if (!session || store.turnId) return;
    const forked = buildBranchSession(session, anchorId, { id: `session-${Date.now()}` });
    if (!forked) return;
    const epoch = accountEpoch.current;
    store.setSessions([forked, ...store.sessions]);
    store.selectSession(forked.id);
    setScreen('chat');
    try {
      const saved = await api.sessions.save(forked);
      if (epoch === accountEpoch.current) store.adoptSessionId(forked.id, saved);
    } catch { /* the branch stays local until the next library sync */ }
    void drainOutbox();
  }, [drainOutbox]);
  // Edit mode Send: the composer draft holds the revised turn — committing
  // rewinds and re-asks instead of starting a fresh turn.
  const commitEditSend = useCallback(() => {
    if (!editingId) return;
    void commitEdit(editingId, useChatStore.getState().draft);
  }, [editingId, commitEdit]);
  const speak = useCallback((text: string) => {
    void speakText(text).catch((error) => {
      useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().speechFailed);
    });
  }, []);
  const toggleListen = useCallback(() => {
    if (listening) {
      listenStop.current?.(); listenStop.current = null; setListening(false);
      return;
    }
    void listenOnce({
      onResult: (text, final) => {
        if (final) {
          if (text) useChatStore.getState().setDraft(text);
          listenStop.current = null; setListening(false);
        }
      },
      onError: (message) => {
        listenStop.current = null; setListening(false);
        useChatStore.getState().setStatus('error', message);
      },
    }).then((stop) => {
      listenStop.current = stop; setListening(true);
    }).catch((error) => {
      useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().voiceInputFailed);
    });
  }, [listening]);
  const login = useCallback(async (email: string, password: string) => {
    setAuthPending(true);
    setAuthError(null); setAuthNotice(null);
    try {
      const loggedIn = await api.auth.login(email, password);
      await persistUser(storage, loggedIn);
      useAuthStore.getState().setUser(loggedIn);
      void syncLibrary();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : appStringsNow().signInFailed);
    } finally {
      setAuthPending(false);
    }
  }, [syncLibrary]);
  const loginWithCode = useCallback(async (email: string, code: string) => {
    setAuthPending(true);
    setAuthError(null); setAuthNotice(null);
    try {
      const loggedIn = await api.auth.loginWithCode(email, code);
      await persistUser(storage, loggedIn);
      useAuthStore.getState().setUser(loggedIn);
      void syncLibrary();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : appStringsNow().codeSignInFailed);
    } finally {
      setAuthPending(false);
    }
  }, [syncLibrary]);
  const sendCode = useCallback(async (email: string) => {
    setAuthPending(true);
    setAuthError(null); setAuthNotice(null);
    try {
      await api.auth.sendCode(email);
      setAuthNotice(appStringsNow().codeSent);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : appStringsNow().codeSendFailed);
    } finally {
      setAuthPending(false);
    }
  }, []);
  const register = useCallback(async (email: string, password: string) => {
    setAuthPending(true);
    setAuthError(null); setAuthNotice(null);
    try {
      await api.auth.register(email, password);
      setAuthNotice(appStringsNow().registered);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : appStringsNow().registerFailed);
    } finally {
      setAuthPending(false);
    }
  }, []);
  const resendVerification = useCallback(async (email: string) => {
    setAuthPending(true);
    setAuthError(null); setAuthNotice(null);
    try {
      await api.auth.resendVerification(email);
      setAuthNotice(appStringsNow().resent);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : appStringsNow().resendFailed);
    } finally {
      setAuthPending(false);
    }
  }, []);
  const forgotPassword = useCallback(async (email: string) => {
    setAuthPending(true);
    setAuthError(null); setAuthNotice(null);
    try {
      await api.auth.forgotPassword(email);
      setAuthNotice(appStringsNow().resetSent);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : appStringsNow().resetSendFailed);
    } finally {
      setAuthPending(false);
    }
  }, []);
  const continueAsGuest = useCallback(() => {
    useAuthStore.getState().setUser({ id: 'guest', email: '', displayName: 'Guest', isGuest: true });
  }, []);
  const signOut = useCallback(() => {
    void useAuthStore.getState().signOut(storage, () => api.auth.logout());

  }, []);
  const createProject = useCallback(async (name: string) => {
    const epoch = accountEpoch.current;
    const project = await api.projects.create({ name });
    if (epoch !== accountEpoch.current) return;
    setProjects((prev) => [project, ...prev]); setProjectFilter(project.id);
    useChatStore.getState().selectProject(project.id);
  }, []);
  const renameProject = useCallback(async (id: string, name: string) => {
    const epoch = accountEpoch.current;
    const updated = await api.projects.update(id, { name });
    if (epoch === accountEpoch.current) setProjects((prev) => prev.map((p) => p.id === id ? updated : p));
  }, []);
  const deleteProject = useCallback(async (id: string) => {
    if (useChatStore.getState().sessions.some((s) => s.id === useChatStore.getState().turnSessionId && s.projectId === id)) throw new Error(appStringsNow().stopBeforeDeleteProject);
    const epoch = accountEpoch.current;
    await api.projects.remove(id);
    if (epoch !== accountEpoch.current) return;
    setProjects((prev) => prev.filter((p) => p.id !== id));
    useChatStore.getState().removeProject(id);
    if (projectFilter === id) setProjectFilter(null);
    else useChatStore.getState().selectProject(projectFilter);
  }, [projectFilter]);
  const archiveSession = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    const owner = useAuthStore.getState().user;
    try {
      if (useChatStore.getState().turnSessionId === id) throw new Error(appStringsNow().stopBeforeArchive);
      if (!isLocalSessionId(id) && owner && !owner.isGuest) await api.sessions.archive(id);
      if (epoch !== accountEpoch.current) return;
      const row = useChatStore.getState().sessions.find((s) => s.id === id);
      useChatStore.getState().archiveSession(id, projectFilter);
      if (row) setArchived((prev) => prev.some((s) => s.id === id) ? prev : [{ ...row, archivedAt: new Date().toISOString() }, ...prev]);
    } catch (error) {
      if (epoch === accountEpoch.current) useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().archiveFailed);
    }
  }, [projectFilter]);
  // Restore opens the conversation again: server unarchive for server ids,
  // local reinsert for rows the store never held (fresh login), then select
  // so the transcript lazy-loads its detail.
  const unarchiveSession = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    const owner = useAuthStore.getState().user;
    try {
      const row = archived.find((s) => s.id === id) || useChatStore.getState().sessions.find((s) => s.id === id) || null;
      if (!isLocalSessionId(id) && owner && !owner.isGuest) await api.sessions.unarchive(id);
      if (epoch !== accountEpoch.current) return;
      useChatStore.getState().unarchiveSession(id, row || undefined);
      setArchived((prev) => prev.filter((s) => s.id !== id));
      select(id);
    } catch (error) {
      if (epoch === accountEpoch.current) useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().restoreFailed);
    }
  }, [archived, select]);
  // Delete purges the session everywhere (mirrors DELETE /sessions/:id which
  // wipes messages/files/artifacts/runs). Local-only ids never hit the
  // network; the welcome row is just hidden like an archive.
  const deleteSession = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    const owner = useAuthStore.getState().user;
    try {
      if (useChatStore.getState().turnSessionId === id) throw new Error(appStringsNow().stopBeforeDelete);
      if (!isLocalSessionId(id) && owner && !owner.isGuest) await api.sessions.remove(id);
      if (epoch !== accountEpoch.current) return;
      useChatStore.getState().deleteSession(id, projectFilter);
      setArchived((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      if (epoch === accountEpoch.current) useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().deleteFailed);
    } finally {
      if (epoch === accountEpoch.current) setConfirmDelete(false);
    }
  }, [projectFilter]);
  const moveSessionToProject = useCallback(async (sessionId: string, targetId: string | null) => {
    const epoch = accountEpoch.current;
    const owner = useAuthStore.getState().user;
    if (!isLocalSessionId(sessionId) && owner && !owner.isGuest) await api.sessions.patch(sessionId, { projectId: targetId });
    if (epoch !== accountEpoch.current) return;
    useChatStore.getState().patchSession(sessionId, { projectId: targetId });
    const next = useChatStore.getState().selectProject(projectFilter);
    if (next) select(next);
  }, [projectFilter, select]);
  const selectProject = useCallback((id: string | null) => {
    setProjectFilter(id);
    const next = useChatStore.getState().selectProject(id);
    if (next) select(next);
  }, [select]);
  // Settings profile + usage snapshot, loaded on entering the screen.
  // Guest stays local-only; stale responses are dropped by account epoch.
  const loadUsage = useCallback(async () => {
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { setAccountUsage(null); setUsageError(null); return; }
    const epoch = accountEpoch.current;
    setUsageLoading(true); setUsageError(null);
    try {
      const result = await api.account.usage();
      if (epoch === accountEpoch.current) setAccountUsage(result);
    } catch (error) {
      if (epoch === accountEpoch.current) setUsageError(error instanceof Error ? error.message : appStringsNow().couldNotLoadUsage);
    } finally {
      if (epoch === accountEpoch.current) setUsageLoading(false);
    }
  }, []);
  // Providers mirror the server truth: activation deactivates the rest
  // server-side, creation arrives active, deletion is local + server.
  const loadProviders = useCallback(async () => {
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { setProviders([]); return; }
    const epoch = accountEpoch.current;
    setProvidersLoading(true); setProvidersError(null);
    try {
      const rows = await api.providers.list();
      if (epoch === accountEpoch.current) setProviders(rows);
    } catch (error) {
      if (epoch === accountEpoch.current) setProvidersError(error instanceof Error ? error.message : appStringsNow().syncFailed);
    } finally {
      if (epoch === accountEpoch.current) setProvidersLoading(false);
    }
  }, []);
  // The baseline hydrates its active provider before the first conversation
  // render. Load it as soon as account restoration completes so the header
  // does not sit on "Choose model" until the user opens the model picker.
  useEffect(() => {
    if (!user || user.isGuest) {
      setProviders([]);
      setProvidersError(null);
      return;
    }
    void loadProviders();
  }, [user, loadProviders]);
  const openProviders = useCallback(() => { setProvidersReturn('settings'); setScreen('providers'); void loadProviders(); }, [loadProviders]);
  // Chat-header quick switch: same server activation as the providers
  // screen, without leaving the transcript.
  const openModelMenu = useCallback(() => { setModelMenuOpen(true); void loadProviders(); }, [loadProviders]);
  const openSettings = useCallback(() => { setScreen('settings'); void loadUsage(); void loadProviders(); }, [loadUsage, loadProviders]);
  const activateProvider = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    await api.providers.patch(id, { isActive: true });
    if (epoch === accountEpoch.current) setProviders((prev) => prev.map((row) => ({ ...row, isActive: row.id === id })));
  }, []);
  const createProvider = useCallback(async (entry: { label: string; url: string; model: string; key: string; isMultimodal: boolean }) => {
    const epoch = accountEpoch.current;
    const created = await api.providers.create(entry);
    if (epoch !== accountEpoch.current) return;
    setProviders((prev) => [{ ...created, isActive: true }, ...prev.map((row) => ({ ...row, isActive: false }))]);
  }, []);
  const deleteProvider = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    await api.providers.remove(id);
    if (epoch === accountEpoch.current) setProviders((prev) => prev.filter((row) => row.id !== id));
  }, []);
  // The mirror update inside activateProvider only lands after the PATCH
  // succeeds, so a failure keeps the previous active row; surface it.
  const pickModel = useCallback(async (id: string) => {
    setModelMenuOpen(false);
    try {
      await activateProvider(id);
    } catch (error) {
      useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().modelActivateFailed);
    }
  }, [activateProvider]);
  // Assistants mirror the server rows. Binding writes the session (PATCH
  // first, then the epoch-guarded mirror; local ids stay local until the
  // next save). Deleting unbinds store sessions so a later save never
  // posts a dangling assistantId.
  const openAssistantMenu = useCallback(() => { setAssistantMenuOpen(true); void loadAssistants(); }, [loadAssistants]);
  const bindAssistant = useCallback(async (id: string | null) => {
    setAssistantMenuOpen(false);
    const store = useChatStore.getState();
    const sessionId = store.activeSessionId;
    if (!sessionId) return;
    const epoch = accountEpoch.current;
    try {
      if (!isLocalSessionId(sessionId)) await api.sessions.patch(sessionId, { assistantId: id });
      if (epoch !== accountEpoch.current) return;
      useChatStore.getState().patchSession(sessionId, { assistantId: id });
    } catch (error) {
      useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().assistantBoundFailed);
    }
  }, []);
  const createAssistant = useCallback(async (entry: AssistantDraft) => {
    const epoch = accountEpoch.current;
    const created = await api.assistants.create({ title: entry.title, source: assistantSource(entry) });
    if (epoch === accountEpoch.current) setAssistants((prev) => [created, ...prev]);
  }, []);
  const updateAssistant = useCallback(async (id: string, entry: AssistantDraft) => {
    const epoch = accountEpoch.current;
    const updated = await api.assistants.update(id, { title: entry.title, source: assistantSource(entry) });
    if (epoch === accountEpoch.current) setAssistants((prev) => prev.map((row) => row.id === id ? updated : row));
  }, []);
  const deleteAssistant = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    await api.assistants.remove(id);
    if (epoch !== accountEpoch.current) return;
    setAssistants((prev) => prev.filter((row) => row.id !== id));
    const store = useChatStore.getState();
    for (const session of store.sessions) {
      if (session.assistantId !== id) continue;
      store.patchSession(session.id, { assistantId: null });
      if (!isLocalSessionId(session.id)) void api.sessions.patch(session.id, { assistantId: null }).catch(() => undefined);
    }
  }, []);
  // "Start chat" mirrors the baseline Assistants surface: a fresh chat
  // bound to the persona with its starter text waiting in the composer.
  const useAssistant = useCallback((assistant: Assistant) => {
    const config = assistantConfigOf(assistant);
    const id = `session-${Date.now()}`;
    const store = useChatStore.getState();
    const draftSession: Session = { id, title: assistant.title || 'New chat', topic: '', mode: 'chat', phase: 'chat', assistantId: assistant.id, messages: [] };
    if (projectFilter) draftSession.projectId = projectFilter;
    store.setSessions([draftSession, ...store.sessions]);
    store.setDraft(config.starter || '');
    store.selectSession(id);
    setScreen('chat');
    if (compact) setSidebarOpen(false);
  }, [projectFilter, compact]);
  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    await api.auth.changePassword(oldPassword, newPassword);
  }, []);
  // Search hits may point at sessions the store never held (archived rows
  // are excluded from the default list). Fetch-then-insert keeps the open
  // path identical to sidebar select, including lazy detail on next select.
  const openSearchSession = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    try {
      const store = useChatStore.getState();
      if (!store.sessions.some((s) => s.id === id)) {
        const owner = useAuthStore.getState().user;
        if (!owner || owner.isGuest) throw new Error(appStringsNow().signInToOpen);
        const detail = await api.sessions.get(id);
        if (epoch !== accountEpoch.current) return;
        const current = useChatStore.getState();
        if (!current.sessions.some((s) => s.id === id)) current.setSessions([normalizeRestoredTutorSession(detail), ...current.sessions]);
      }
      if (epoch !== accountEpoch.current) return;
      setScreen('chat');
      select(id);
    } catch (error) {
      if (epoch === accountEpoch.current) useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().couldNotOpenConversation);
    }
  }, [select]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (modelMenuOpen) { setModelMenuOpen(false); return true; }
      if (assistantMenuOpen) { setAssistantMenuOpen(false); return true; }
      if (menuOpen) { setMenuOpen(false); setConfirmDelete(false); return true; }
      if (screen === 'providers') { setScreen(providersReturn); return true; }
      if (screen !== 'chat') { setMovePickSession(null); setScreen('chat'); return true; }
      if (compact && sidebarOpen) { setSidebarOpen(false); return true; }
      return false;
    });
    return () => listener.remove();
  }, [assistantMenuOpen, compact, menuOpen, modelMenuOpen, providersReturn, screen, sidebarOpen]);
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

  if (screen === 'settings') {
    const activeProvider = providers.find((row) => row.isActive) || null;
    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} /><SettingsScreen
      mode={theme}
      profile={user && !user.isGuest ? { displayName: user.displayName, email: user.email, tier: user.tier } : null}
      usage={accountUsage}
      usageLoading={usageLoading}
      usageError={usageError}
      onRetryUsage={() => void loadUsage()}
      onChangePassword={(oldPassword, newPassword) => changePassword(oldPassword, newPassword)}
      activeProvider={user && !user.isGuest ? activeProvider?.model || activeProvider?.label || '' : null}
      onOpenProviders={openProviders}
      onClose={() => setScreen('chat')}
      onSignOut={() => { signOut(); setScreen('chat'); }}
    /></SafeAreaView>;
  }

  if (screen === 'projects') {
    const pickSession = movePickSession
      ? useChatStore.getState().sessions.find((s) => s.id === movePickSession) || null
      : null;
    const closeProjects = () => { setMovePickSession(null); setScreen('chat'); };
    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} /><ProjectsScreen
      mode={theme}
      projects={projects}
      activeProjectId={projectFilter}
      loading={projectsLoading}
      error={projectsError}
      pickMode={pickSession ? { sessionTitle: pickSession.title || pickSession.topic || 'session' } : null}
      onClose={closeProjects}
      onSelectProject={(targetId) => {
        if (movePickSession) {
          const moving = movePickSession;
          void moveSessionToProject(moving, targetId).then(() => {
            setMovePickSession(null);
            setScreen('chat');
          }).catch((error) => {
            setProjectsError(error instanceof Error ? error.message : appStringsNow().moveFailed);
          });
        } else {
          selectProject(targetId);
        }
      }}
      onCreateProject={createProject}
      onRenameProject={renameProject}
      onDeleteProject={deleteProject}
      onRetry={() => void syncLibrary()}
    /></SafeAreaView>;
  }

  if (screen === 'providers') {
    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} /><ProvidersScreen
      mode={theme}
      providers={providers}
      loading={providersLoading}
      error={providersError}
      onClose={() => setScreen(providersReturn)}
      onActivate={(id) => activateProvider(id)}
      onCreate={(entry) => createProvider(entry)}
      onDelete={(id) => deleteProvider(id)}
      onRetry={() => void loadProviders()}
    /></SafeAreaView>;
  }
  if (screen === 'assistants') {
    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} /><AssistantsScreen
      mode={theme}
      assistants={assistants}
      boundId={active?.assistantId ?? null}
      loading={assistantsLoading}
      error={assistantsError}
      onClose={() => setScreen('chat')}
      onRetry={() => void loadAssistants()}
      onCreate={(entry) => createAssistant(entry)}
      onUpdate={(id, entry) => updateAssistant(id, entry)}
      onDelete={(id) => deleteAssistant(id)}
      onUse={(assistant) => useAssistant(assistant)}
    /></SafeAreaView>;
  }
  if (screen === 'search') {
    const canServerSearch = !!user && !user.isGuest;
    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} /><SearchScreen
      mode={theme}
      sessions={sessions}
      serverSearch={canServerSearch ? (q) => api.search.content({ q }).then((result) => result.hits) : null}
      onOpenSession={(id) => void openSearchSession(id)}
      onClose={() => setScreen('chat')}
    /></SafeAreaView>;
  }
  if (screen === 'exam-setup') {
    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} /><ExamSetupScreen
      mode={theme}
      running={examRun.running}
      progress={examRun.progress}
      error={examRun.error}
      onStart={(input) => void startExamGeneration(input)}
      onCancel={cancelExamGeneration}
      onClose={closeExamSetup}
    /></SafeAreaView>;
  }
  if (screen === 'tutor-setup') {
    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} /><TutorSetupScreen
      mode={theme}
      running={tutorRun.running}
      progress={tutorRun.progress}
      error={tutorRun.error}
      onStart={(input) => void startTutorGeneration(input)}
      onCancel={cancelTutorGeneration}
      onClose={closeTutorSetup}
    /></SafeAreaView>;
  }
  if (screen === 'files') {
    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />
      <FilesScreen
        mode={theme}
        list={listFiles}
        remove={removeFile}
        onOpen={(file) => setPreviewFile(file)}
        onClose={() => setScreen('chat')}
      />
      {previewFile ? <FilePreview file={previewFile} mode={theme} language={language} target={fileTarget} loadPreview={loadFilePreview} onClose={() => setPreviewFile(null)} /> : null}
    </SafeAreaView>;
  }

  /* Keep every desktop destination visible in the baseline nav order. */
  const navItems: SidebarNavItem[] = [
    { key: 'new', label: t.newChat, icon: 'new-chat', onPress: createSession },
    { key: 'library', label: t.navLibrary, icon: 'library', active: (screen as string) === 'files', onPress: () => { if (compact) setSidebarOpen(false); setScreen('files'); } },
    { key: 'projects', label: t.navProjects, accessibilityLabel: t.openProjects, icon: 'projects', active: (screen as string) === 'projects', onPress: () => { if (compact) setSidebarOpen(false); setScreen('projects'); } },
    { key: 'scheduled', label: t.navScheduled, icon: 'scheduled', onPress: () => undefined },
    { key: 'plugins', label: t.navPlugins, icon: 'plugins', onPress: () => undefined },
    { key: 'sites', label: t.navSites, icon: 'sites', badge: t.newBadge, onPress: () => undefined },
    {
      key: 'more',
      label: t.navMore,
      icon: 'more',
      onPress: () => undefined,
      menu: [
        ...(user && !user.isGuest ? [{ label: s.openAssistantMenu, onPress: () => { if (compact) setSidebarOpen(false); openAssistantMenu(); } }] : []),
        { label: s.assistantTitle, onPress: () => { if (compact) setSidebarOpen(false); setScreen('assistants'); } },
        { label: s.openProviders, onPress: () => { if (compact) setSidebarOpen(false); setProvidersReturn('chat'); setScreen('providers'); void loadProviders(); } },
        { label: t.newExam, onPress: () => { if (compact) setSidebarOpen(false); setScreen('exam-setup'); } },
        { label: t.newTutor, onPress: () => { if (compact) setSidebarOpen(false); setScreen('tutor-setup'); } },
      ],
    },
  ];
  const sidebarUser = user ? {
    initials: (user.displayName || user.email || '?').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    name: user.displayName || user.email || t.brand,
    plan: user.tier ? user.tier[0].toUpperCase() + user.tier.slice(1) : accountUsage?.plan?.name || '',
  } : null;

  return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />
    <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS !== 'web'}>
      {sidebarOpen ? <Sidebar
        sessions={visibleSessions}
        activeId={activeId}
        onSelect={select}
        onNewChat={createSession}
        nav={navItems}
        onOpenSearch={() => { if (compact) setSidebarOpen(false); setScreen('search'); }}
        user={sidebarUser}
        themeIcon={theme === 'dark' ? 'moon' : 'sun'}
        onToggleTheme={() => { if (compact) setSidebarOpen(false); toggleTheme(); }}
        onOpenDisplaySettings={() => { if (compact) setSidebarOpen(false); openSettings(); }}
        onOpenSettings={() => { if (compact) setSidebarOpen(false); openSettings(); }}
        /* Account menu (baseline SidebarFooter): Upgrade plan is the same
           pricing link; Profile opens Settings, where the Universal profile
           lives; Sign out only for a signed-in (non-guest) account. Help is
           the SPA keyboard cheatsheet, which Universal does not have. */
        onUpgradePlan={() => { void Linking.openURL(PRICING_URL); }}
        onOpenProfile={() => { if (compact) setSidebarOpen(false); openSettings(); }}
        onSignOut={user && !user.isGuest ? () => { if (compact) setSidebarOpen(false); signOut(); } : undefined}
        onToggleSidebar={() => { if (compact) setSidebarOpen(false); else setSidebarOpen((open) => !open); }}
        logoSource={require('./assets/logo.png')}
        logoTextRenderer={SidebarLogoText}
        navLabelBadgeRenderer={SidebarNavLabelBadge}
        sessionActions={{
          archive: (id) => void archiveSession(id),
          unarchive: (id) => void unarchiveSession(id),
          remove: (id) => void deleteSession(id),
          move: (id) => { setMovePickSession(id); setScreen('projects'); },
        }}
        mode={theme}
        language={language}
        compact={compact}
        archived={archived}
        onSelectArchived={(id) => void unarchiveSession(id)}
        tutorActive={active?.mode === 'tutor'}
        teachingPlan={active?.mode === 'tutor' ? (active.teachingPlan as unknown as TeachingPlan | null) ?? null : null}
        teachingStage={active?.mode === 'tutor' ? active.teachingStage ?? null : null}
        substantiveCount={active?.mode === 'tutor' ? active.substantiveCount ?? 0 : 0}
        knowledgeNodes={active?.mode === 'tutor' ? (active.kbNodes || []) as unknown as KnowledgeBoundaryNode[] : []}
        currentNode={active?.mode === 'tutor' ? active.currentNode ?? -1 : -1}
        boundariesHistory={active?.mode === 'tutor' ? (active.boundariesHistory || []) as unknown as BoundarySnapshot[] : []}
        onUpdateKnowledgeNode={updateKnowledgeNode}
        onSaveKnowledgeSnapshot={saveKnowledgeSnapshot}
        onJumpToKnowledgeNode={jumpToKnowledgeNode}
        mistakes={activeMistakes}
        onRedoMistake={onRedoMistake}
        view={sidebarView}
        onViewChange={setSidebarView}
        mistakeFilter={activeMistakeFilter}
        onMistakeFilterChange={setActiveMistakeFilter}
        compactSearchOpen={sidebarSearchOpen}
        onCompactSearchOpenChange={setSidebarSearchOpen}
      /> : null}
      {compact && sidebarOpen ? (
        <Pressable
          nativeID="socrates-sidebar-backdrop"
          accessibilityRole="button"
          accessibilityLabel={s.toggleSidebar}
          onPress={() => setSidebarOpen(false)}
          style={[styles.sidebarBackdrop, { backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.4)' }]}
        />
      ) : null}
      <View nativeID="socrates-main" style={[styles.main, compact ? styles.mainCompact : Platform.OS === 'web' && styles.mainDesktopWebLayer, { backgroundColor: palette.bg.page }]}>
        {/* Baseline topbar: fixed brand/model switcher and conversation actions. */}
        <View style={[styles.topbar, compact && styles.topbarCompact]}>
          <View style={[styles.topbarLeft, compact && styles.topbarLeftCompact]}>
            {!sidebarOpen ? (
              <Pressable accessibilityRole="button" accessibilityLabel={s.toggleSidebar} onPress={() => setSidebarOpen(true)} style={[styles.topbarBtn, compact && styles.topbarCircleCompact]}>
                <Icon name={compact ? 'sidebar-toggle' : 'panel'} size={compact ? 24 : 20} color={compact ? palette.text.tertiary : palette.text.primary} />
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel={s.openModelMenu} onPress={openModelMenu} style={[styles.modelSwitcher, compact && styles.modelSwitcherCompact]}>
              <ModelSwitcherBrand label={t.brand} color={palette.text.primary} compact={compact} language={language} />
              <Text nativeID="socrates-model-subtitle" testID="socrates-model-subtitle" numberOfLines={1} style={[styles.modelSub, compact && styles.modelSubCompact, { color: palette.text.tertiary }, fam()]}>{activeModelLabel}</Text>
              <ModelCaret size={compact ? 14 : 16} color={palette.text.tertiary} />
            </Pressable>
          </View>
          <View style={[styles.topbarRight, compact && styles.topbarRightCompact]}>
            {/* The baseline keeps the phone's new-chat action in the right
                header group while a conversation is open and on the landing. */}
            {compact && screen === 'chat' && !sidebarOpen ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t.newChat} onPress={() => void createSession()} style={[styles.topbarBtn, styles.topbarCircleCompact]}>
                <Icon name="compose" size={24} color={palette.text.primary} />
              </Pressable>
            ) : null}
            {projectFilter ? (
              <Pressable accessibilityRole="button" accessibilityLabel={s.clearProjectFilter(activeProject?.name || '')} onPress={() => setProjectFilter(null)} style={[styles.filterChip, compact && styles.filterChipCompact]}>
                <Text numberOfLines={1} style={[styles.filterText, { color: palette.text.primary }, fam('medium')]}>📁 {activeProject?.name || 'Project'} ✕</Text>
              </Pressable>
            ) : null}
            {active ? (
              <>
                {!(compact && projectFilter) ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t.artifactSummary} onPress={() => undefined} style={[styles.summaryBtn, compact && styles.summaryBtnCompact]}>
                  <Icon name="summary" size={compact ? 16 : 18} color={compact ? palette.text.secondary : palette.text.primary} />
                  <Text nativeID="socrates-topbar-summary-label" testID="socrates-topbar-summary-label" style={[styles.summaryText, compact && styles.summaryTextCompact, { color: compact ? palette.text.secondary : palette.text.primary }, fam(compact ? 'regular' : 'medium')]}>{t.artifactSummary}</Text>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" accessibilityLabel={t.findInConversation} onPress={openFind} style={[styles.topbarBtn, compact && styles.topbarBtnCompact]}>
                  <Icon name="search" size={compact ? 24 : 18} color={compact ? palette.text.tertiary : palette.text.primary} />
                </Pressable>
                {user && !user.isGuest ? <Pressable accessibilityRole="button" accessibilityLabel={t.shareConversation} onPress={openShare} style={[styles.topbarBtn, compact && styles.topbarBtnCompact]}>
                  <Icon name="share" size={compact ? 24 : 18} color={compact ? palette.text.tertiary : palette.text.primary} />
                </Pressable> : null}
              </>
            ) : null}
          </View>
        </View>
        {chatError ? <View style={styles.errorRow}>
          <Text accessibilityRole="alert" style={[styles.errorText, { color: palette.danger }]}>{chatError}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={s.retry} onPress={() => void retryTurn()} style={[styles.retryChip, { borderColor: palette.border.default }]}>
            <Text style={{ color: palette.text.primary }}>↻ {s.retry}</Text>
          </Pressable>
        </View> : null}
        {offlineNotice ? <Text style={[styles.noticeText, { color: palette.text.muted }]}>{s.savedOffline}</Text> : null}
        {showDiagnostic && active ? (
          <DiagView
            key={active.id}
            questions={tutorQuestions}
            answers={tutorAnswers}
            mode={theme}
            language={language}
            onChange={(answers) => persistDiagnosticAnswers(active.id, answers)}
            onSubmit={(answers) => void submitDiagnostic(active.id, answers)}
          />
        ) : isExam && examData && active ? (
          <ExamView
            key={active.id}
            examData={examData}
            mode={theme}
            language={language}
            onChange={(data, immediate) => persistExam(active.id, data, immediate)}
            onSubmit={(data) => persistExam(active.id, data, true)}
          />
        ) : (
          <>
            <ChatMessageList style={styles.list} compact={compact} messages={active?.messages || []} mode={theme} language={language} findQuery={findOpen ? findQuery : ''} activeFindIndex={activeFindIndex} onCopyText={copyText} onSpeakText={speak} onShareMessage={() => openShare()} onEditMessage={user && !user.isGuest ? (message) => startEdit(messageKey(message) || '', message.rawText || '') : undefined} onRegenerateMessage={user && !user.isGuest ? (message) => void regenerate(messageKey(message) || '') : undefined} onBranchMessage={(message) => void branchFrom(messageKey(message) || '')} onOpenArtifact={setArtifact} onOpenStoredArtifact={openStoredArtifact} resolveImage={resolveImage} onOpenFile={openAttachment} onQuizPick={onQuizPick} onPracticeSubmit={onPracticeSubmit} redoItems={redo.sessionId === activeId ? redo.items : undefined} quizSlotResets={redo.sessionId === activeId ? redo.resets : undefined} />
            {editingId ? <View style={[styles.editBanner, { borderColor: palette.border.default }]}>
              <Text style={[styles.editBannerText, { color: palette.text.secondary }]}>{s.editingMessage}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={s.cancelEdit} onPress={cancelEdit} style={styles.editCancel}>
                <Text style={{ color: palette.text.primary }}>{s.cancel}</Text>
              </Pressable>
            </View> : null}
            <Composer
              compact={compact}
              value={draft}
              streaming={status === 'sending' || status === 'streaming'}
              onChangeText={useChatStore.getState().setDraft}
              onSend={editingId ? commitEditSend : send}
              onStop={stop}
              mode={theme}
              language={language}
              attachments={staged.map((s) => ({ id: s.localId, name: s.name }))}
              canCapturePhoto={supportsCamera}
              voiceInputSupported={listenSupported()}
              listening={listening}
              onPickImages={() => void onPickImages()}
              onTakePhoto={() => void onTakePhoto()}
              onPickFile={() => void onPickFile()}
              onRemoveAttachment={removeStaged}
              onToggleListen={toggleListen}
            />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
    <ArtifactViewer artifact={artifact} mode={theme} language={language} onClose={() => setArtifact(null)} />
    <ModelPicker
      providers={providers}
      activeId={activeModel?.id ?? null}
      open={modelMenuOpen}
      mode={theme}
      language={language}
      onPick={(id) => void pickModel(id)}
      onManage={() => { setModelMenuOpen(false); setProvidersReturn('chat'); setScreen('providers'); void loadProviders(); }}
      onClose={() => setModelMenuOpen(false)}
    />
    <AssistantPicker
      assistants={assistants}
      activeId={active?.assistantId ?? null}
      open={assistantMenuOpen}
      mode={theme}
      language={language}
      onPick={(id) => void bindAssistant(id)}
      onManage={() => { setAssistantMenuOpen(false); setScreen('assistants'); void loadAssistants(); }}
      onClose={() => setAssistantMenuOpen(false)}
    />
    {previewFile ? <FilePreview file={previewFile} mode={theme} language={language} target={fileTarget} loadPreview={loadFilePreview} onClose={() => setPreviewFile(null)} /> : null}
    <FindBar
      open={findOpen}
      query={findQuery}
      count={findMatches.length}
      activeIndex={activeFindIndex}
      compact={compact}
      mode={theme}
      language={language}
      onChange={(value) => { setFindQuery(value); setActiveFindIndex(value.trim() ? 0 : -1); }}
      onPrevious={previousFind}
      onNext={nextFind}
      onClose={closeFind}
    />
    <ShareDialog
      open={shareOpen}
      visibility={shareVisibility}
      url={shareUrl}
      busy={shareBusy}
      status={shareStatus}
      error={shareError}
      mode={theme}
      language={language}
      onSelectVisibility={setShareVisibility}
      onCopy={() => void copyShare()}
      onCreate={() => void createShare()}
      onRevoke={() => void revokeShare()}
      onClose={() => setShareOpen(false)}
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

const styles = StyleSheet.create({
  safe: { flex: 1 },
  shell: { flex: 1, flexDirection: 'row', position: 'relative' },
  /* parity (web): the SPA's `.main-bg` carries `will-change: transform`, so
     Chrome promotes `#mainContent` to its own composited layer (reason:
     Overlap) whose origin is the column's left edge. Rasterising the
     composer's rounded border in a layer at that origin is what produces
     the baseline's anti-aliased edge (probe: (1233,842) RGB 32 vs 33 when
     painted into the root layer). `translateZ(0)` gives the Universal
     column the same layer origin. Desktop web only: the phone shell
     measures 0 without it and 62 with it. */
  main: { flex: 1, paddingBottom: 20 },
  mainDesktopWebLayer: { transform: 'translateZ(0)' },
  /* parity: the phone chat column gives `.chat-input-bar` a 16px bottom
     pad, and the composer slot adds its own 6px — 22px under the shell,
     which is what the SPA measures at 390x844. */
  mainCompact: { paddingBottom: 16, zIndex: 0 },
  sidebarBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 80 },
  list: { flex: 1 },
  /* Baseline topbar (parity/topbar.css): borderless 52px bar on the page
     color, model switcher at the left, ghost icon actions at the right. */
  topbar: { height: 52, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 8 },
  topbarCompact: { height: 56, minHeight: 56 },
  topbarLeft: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0, flexShrink: 1 },
  topbarLeftCompact: { flex: 1, gap: 8 },
  topbarRight: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  topbarRightCompact: { gap: 8 },
  topbarBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  /* polish/mobile-shell.css: the phone header's toggle and new-chat circles
     are 40px (layout/app-shell.css) while find/share and the summary pill
     take --ui-control-touch (44px). Glyphs step to 24px on the phone and
     the groups gap 8px (parity/topbar.css keeps 4px only at ≥769px). */
  topbarBtnCompact: { width: 44, minWidth: 44, height: 44, minHeight: 44, borderRadius: 22 },
  topbarCircleCompact: { width: 40, minWidth: 40, height: 40, minHeight: 40, borderRadius: 20 },
  summaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, minWidth: 48, paddingHorizontal: 10, borderRadius: 18 },
  summaryBtnCompact: { height: 44, minWidth: 44, minHeight: 44, paddingHorizontal: 8, borderRadius: 22, gap: 0, alignItems: 'stretch', justifyContent: 'flex-start' },
  summaryText: { fontSize: 14, lineHeight: 20 },
  summaryTextCompact: { fontSize: 12, lineHeight: 20 },
  modelSwitcher: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 360, height: 36, paddingLeft: 10, paddingRight: 8, borderRadius: 10, minWidth: 0 },
  modelName: { fontSize: 18, lineHeight: 28, fontWeight: '600', flexShrink: 1 },
  modelSub: { fontSize: 18, lineHeight: 28, flexShrink: 1 },
  /* parity/topbar.css phone block: flex 1 1 0, height 36, padding 0 4px,
     gap 4px, name 600/15/24, model 13 tertiary, caret 14. */
  modelSwitcherCompact: { flex: 1, height: 36, maxWidth: '100%', gap: 4, paddingLeft: 4, paddingRight: 4, overflow: 'hidden' },
  modelNameCompact: { fontSize: 15, lineHeight: 24, fontWeight: '600', flexShrink: 0 },
  modelSubCompact: { fontSize: 13, lineHeight: 24, flexShrink: 1 },
  filterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, maxWidth: '40%' },
  filterChipCompact: { maxWidth: 88, flexShrink: 1 },
  filterText: { fontSize: 13, lineHeight: 18 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
  errorText: { flex: 1 },
  retryChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  noticeText: { paddingHorizontal: 12, paddingBottom: 4, fontSize: 13 },
  editBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 12 },
  editBannerText: { flex: 1, fontSize: 13 },
  editCancel: { paddingHorizontal: 8, paddingVertical: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
