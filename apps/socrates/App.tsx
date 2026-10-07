import 'react-native-reanimated';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { AccountUsage, ExamData, Project, ProviderKey, Session } from '@socrates/contracts';
import { isLocalSessionId, runChatTurn, useChatStore, visibleSessions as getVisibleSessions } from '@socrates/chat';
import { persistUser } from '@socrates/auth';
import { useAuthStore } from '@socrates/auth';
import { useSettingsStore } from '@socrates/settings';
import { getThemePaletteHex } from '@socrates/theme';
import { ChatMessageList, Composer, ExamView, Sidebar, buildEmbeddedDocument, paletteForDocument, parseExamQuestions, storedFileIdFromRawUrl, type ArtifactDescriptor } from '@socrates/ui';
import { api, streamConversation } from './src/runtime';
import { storage } from './src/storage';
import { copyText } from './src/clipboard';
import { capturePhoto, extractPickedDocument, pickDocument, pickImages, supportsCamera } from './src/attachments';
import { persistStagedAttachment } from './src/attachmentUpload';
import { stagedToMessageAttachment, type PickedFile, type StagedAttachment } from './src/attachmentModels';
import { listenOnce, listenSupported, speakText, stopSpeaking } from './src/speech';
import { AuthGate } from './src/AuthGate';
import { ArtifactViewer } from './src/ArtifactViewer';
import { FilePreview } from './src/FilePreview';
import { FilesScreen } from './src/FilesScreen';
import { ExamSetupScreen, type ExamRunState, type ExamSetupInput } from './src/ExamSetupScreen';
import { buildExamData, generateExamQuestions } from './src/examGeneration';
import { useFileImages } from './src/useFileImages';
import type { FileAccessTarget, FileImageSource, StoredFileRef } from './src/fileAccess';
import { SettingsScreen } from './src/SettingsScreen';
import { ProjectsScreen } from './src/ProjectsScreen';
import { SearchScreen } from './src/SearchScreen';
import { ProvidersScreen } from './src/ProvidersScreen';
import { appStrings, appStringsNow } from './src/strings';

const initialSessions: Session[] = [{ id: 'welcome', title: 'Welcome to Socrates', topic: 'Universal app', mode: 'chat', phase: 'chat', messages: [{ clientId: 'welcome-assistant', role: 'assistant', rawText: 'How can I help you learn today?' }] }];

function SocratesApp() {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [sidebarOpen, setSidebarOpen] = useState(!compact);
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [screen, setScreen] = useState<'chat' | 'settings' | 'projects' | 'search' | 'providers' | 'files' | 'exam-setup'>('chat');
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [staged, setStaged] = useState<StagedAttachment[]>([]);
  const [artifact, setArtifact] = useState<ArtifactDescriptor | null>(null);
  const [previewFile, setPreviewFile] = useState<StoredFileRef | null>(null);
  const [examRun, setExamRun] = useState<ExamRunState>({ running: false, progress: null, error: null });
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
  const palette = useMemo(() => getThemePaletteHex(theme), [theme]);
  const active = useMemo(() => sessions.find((session) => session.id === activeId) || null, [activeId, sessions]);
  const visibleSessions = useMemo(
    () => {
      return getVisibleSessions(sessions, projectFilter);
    },
    [sessions, projectFilter],
  );
  const activeProject = useMemo(() => projects.find((p) => p.id === projectFilter) || null, [projects, projectFilter]);
  const streamAbort = useRef<AbortController | null>(null);
  const accountEpoch = useRef(0);
  const syncEpoch = useRef(0);
  const loadingDetails = useRef(new Set<string>());
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
  // Exam sessions carry client-generated questions + answers in examData;
  // answering and grading stay local, persistence is debounced and the store
  // is patched immediately so a session switch never loses answers.
  const examData = active?.kind === 'exam' ? (active.examData as ExamData | null | undefined) ?? null : null;
  const examQuestions = useMemo(() => parseExamQuestions(examData), [examData]);
  const isExam = examQuestions.length > 0;
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

  const syncLibrary = useCallback(async () => {
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) return;
    const epoch = accountEpoch.current;
    const sync = ++syncEpoch.current;
    const current = () => epoch === accountEpoch.current && sync === syncEpoch.current;
    setProjectsLoading(true); setProjectsError(null);
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
  }, []);

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
      setAuthNotice(null);
      setArtifact(null);
      setPreviewFile(null);
      examAbort.current?.abort();
      examAbort.current = null;
      setExamRun({ running: false, progress: null, error: null });
      setProjectFilter(null); setMovePickSession(null); setMenuOpen(false); setConfirmDelete(false); setScreen('chat');
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
        current.patchSession(id, { ...detail, messages: detail.messages ?? [] });
      }).catch((error) => {
        if (epoch === accountEpoch.current) useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().couldNotLoadConversation);
      }).finally(() => { if (epoch === accountEpoch.current) loadingDetails.current.delete(id); });
    }
  }, [compact]);
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
  const send = useCallback(() => {
    const store = useChatStore.getState();
    const text = store.draft.trim();
    const snapshot = staged;
    if ((!text && !snapshot.length) || store.turnId) return;
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { store.setStatus('error', appStringsNow().guestSendBlocked); return; }
    if (store.activeSessionId && loadingDetails.current.has(store.activeSessionId)) {
      store.setStatus('error', appStringsNow().conversationLoading); return;
    }
    stopSpeaking();
    listenStop.current?.(); listenStop.current = null; setListening(false);
    void (async () => {
      let messageAttachments;
      try {
        messageAttachments = await resolveStaged();
      } catch (error) {
        useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().prepareAttachmentsFailed);
        return;
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
      const controller = new AbortController();
      streamAbort.current = controller;
      setStaged((prev) => prev.filter((s) => !snapshot.some((taken) => taken.localId === s.localId)));
      try {
        await runChatTurn({
          sessionId, turnId: `turn-${Date.now()}`, text, attachments: messageAttachments.length ? messageAttachments : undefined, signal: controller.signal,
          isCurrent: () => epoch === accountEpoch.current,
          save: (session) => api.sessions.save(session),
          // Upload each staged file with the now-known server session id so it
          // lands in the file library and stays readable by the model.
          persistAttachments: async (serverSessionId) => {
            if (!messageAttachments.length || epoch !== accountEpoch.current) return undefined;
            const tokens = await api.readTokens();
            return Promise.all(messageAttachments.map(async (attachment) => {
              const row = snapshot.find((item) => item.localId === attachment.id);
              if (!row) return attachment;
              try {
                const fileId = await persistStagedAttachment(row, { url: api.files.uploadUrl(), token: tokens.accessToken, fetch: api.fetchWithAuth }, serverSessionId);
                return fileId ? { ...attachment, fileId } : attachment;
              } catch { return attachment; }
            }));
          },
          stream: streamConversation,
        });
      } finally {
        if (streamAbort.current === controller) streamAbort.current = null;
      }
    })();
  }, [projectFilter, staged, resolveStaged]);
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
  const openProviders = useCallback(() => { setScreen('providers'); void loadProviders(); }, [loadProviders]);
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
        if (!current.sessions.some((s) => s.id === id)) current.setSessions([detail, ...current.sessions]);
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
      if (menuOpen) { setMenuOpen(false); setConfirmDelete(false); return true; }
      if (screen === 'providers') { setScreen('settings'); return true; }
      if (screen !== 'chat') { setMovePickSession(null); setScreen('chat'); return true; }
      if (compact && sidebarOpen) { setSidebarOpen(false); return true; }
      return false;
    });
    return () => listener.remove();
  }, [compact, menuOpen, screen, sidebarOpen]);
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
      onClose={() => setScreen('settings')}
      onActivate={(id) => activateProvider(id)}
      onCreate={(entry) => createProvider(entry)}
      onDelete={(id) => deleteProvider(id)}
      onRetry={() => void loadProviders()}
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

  return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />
    <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS !== 'web'}>
      {sidebarOpen ? <Sidebar
        sessions={visibleSessions}
        activeId={activeId}
        onSelect={select}
        onNewChat={createSession}
        onNewExam={user && !user.isGuest ? () => setScreen('exam-setup') : undefined}
        mode={theme}
        language={language}
        archived={archived}
        onSelectArchived={(id) => void unarchiveSession(id)}
      /> : null}
      <View style={[styles.main, { backgroundColor: palette.bg.page }]}>
        <View style={[styles.header, { borderBottomColor: palette.border.default }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={s.toggleSidebar} onPress={() => setSidebarOpen((open) => !open)} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>☰</Text></Pressable>
          {projectFilter ? (
            <Pressable accessibilityRole="button" accessibilityLabel={s.clearProjectFilter(activeProject?.name || '')} onPress={() => setProjectFilter(null)} style={[styles.filterChip, { borderColor: palette.border.default, backgroundColor: palette.bg.hover }]}>
              <Text numberOfLines={1} style={[styles.filterText, { color: palette.text.primary }]}>📁 {activeProject?.name || 'Project'} ✕</Text>
            </Pressable>
          ) : (
            <Text numberOfLines={1} style={[styles.title, { color: palette.text.primary }]}>{s.appTitle(active?.title || '')}</Text>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={s.openSearch} onPress={() => setScreen('search')} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>🔍</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={s.openProjects} onPress={() => setScreen('projects')} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>📁</Text></Pressable>
          {user && !user.isGuest ? <Pressable accessibilityRole="button" accessibilityLabel={s.openFiles} onPress={() => { setMenuOpen(false); setScreen('files'); }} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>📎</Text></Pressable> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={s.toggleTheme} onPress={toggleTheme} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>{theme === 'dark' ? '☾' : '☀'}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={s.openSettings} onPress={openSettings} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>⚙</Text></Pressable>
          {active ? (
            <Pressable accessibilityRole="button" accessibilityLabel={s.sessionActions} onPress={() => { setConfirmDelete(false); setMenuOpen((open) => !open); }} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>⋯</Text></Pressable>
          ) : null}
        </View>
        {menuOpen && active ? (
          <View style={[styles.menuSheet, { backgroundColor: palette.bg.raised, borderColor: palette.border.default }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={s.moveSessionTo(active.title || 'session')}
              onPress={() => { setMenuOpen(false); setConfirmDelete(false); setMovePickSession(active.id); setScreen('projects'); }}
              style={styles.menuItem}
            >
              <Text style={[styles.menuItemText, { color: palette.text.primary }]}>{s.moveToProject}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={s.archiveSessionOf(active.title || 'session')}
              onPress={() => { setMenuOpen(false); setConfirmDelete(false); void archiveSession(active.id); }}
              style={styles.menuItem}
            >
              <Text style={[styles.menuItemText, { color: palette.text.primary }]}>{s.archiveSession}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmDelete ? s.confirmDeleteSessionOf(active.title || 'session') : s.deleteSessionOf(active.title || 'session')}
              onPress={() => {
                if (confirmDelete) { setMenuOpen(false); void deleteSession(active.id); }
                else setConfirmDelete(true);
              }}
              style={styles.menuItem}
            >
              <Text style={[styles.menuItemText, { color: palette.danger }]}>
                {confirmDelete ? s.confirmDeleteSession : s.deleteSession}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={s.closeSessionMenu} onPress={() => { setMenuOpen(false); setConfirmDelete(false); }} style={styles.menuItem}>
              <Text style={[styles.menuItemText, { color: palette.text.muted }]}>{s.cancel}</Text>
            </Pressable>
          </View>
        ) : null}
        {chatError ? <Text accessibilityRole="alert" style={{ color: palette.danger, padding: 12 }}>{chatError}</Text> : null}
        {isExam && examData && active ? (
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
            <ChatMessageList messages={active?.messages || []} mode={theme} language={language} onCopyText={copyText} onSpeakText={speak} onOpenArtifact={setArtifact} onOpenStoredArtifact={openStoredArtifact} resolveImage={resolveImage} onOpenFile={openAttachment} />
            <Composer
              value={draft}
              streaming={status === 'sending' || status === 'streaming'}
              onChangeText={useChatStore.getState().setDraft}
              onSend={send}
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
    {previewFile ? <FilePreview file={previewFile} mode={theme} language={language} target={fileTarget} loadPreview={loadFilePreview} onClose={() => setPreviewFile(null)} /> : null}
  </SafeAreaView>;
}
export default function App() {
  return <SafeAreaProvider><SocratesApp /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  shell: { flex: 1, flexDirection: 'row' },
  main: { flex: 1 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  menu: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  menuText: { fontSize: 20 },
  title: { flex: 1, textAlign: 'center', marginRight: 8, fontWeight: '600' },
  filterChip: { flex: 1, marginRight: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  filterText: { fontSize: 14, fontWeight: '600' },
  menuSheet: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  menuItem: { paddingHorizontal: 20, paddingVertical: 12 },
  menuItemText: { fontSize: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
