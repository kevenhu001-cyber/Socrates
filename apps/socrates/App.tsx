import 'react-native-reanimated';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Project, Session } from '@socrates/contracts';
import { isLocalSessionId, runChatTurn, useChatStore, visibleSessions as getVisibleSessions } from '@socrates/chat';
import { persistUser } from '@socrates/auth';
import { useAuthStore } from '@socrates/auth';
import { useSettingsStore } from '@socrates/settings';
import { getThemePaletteHex } from '@socrates/theme';
import { ChatMessageList, Composer, Sidebar } from '@socrates/ui';
import { api, streamConversation } from './src/runtime';
import { storage } from './src/storage';
import { copyText } from './src/clipboard';
import { AuthGate } from './src/AuthGate';
import { SettingsScreen } from './src/SettingsScreen';
import { ProjectsScreen } from './src/ProjectsScreen';
import { SearchScreen } from './src/SearchScreen';

const initialSessions: Session[] = [{ id: 'welcome', title: 'Welcome to Socrates', topic: 'Universal app', mode: 'chat', phase: 'chat', messages: [{ clientId: 'welcome-assistant', role: 'assistant', rawText: 'How can I help you learn today?' }] }];

function SocratesApp() {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [sidebarOpen, setSidebarOpen] = useState(!compact);
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [screen, setScreen] = useState<'chat' | 'settings' | 'projects' | 'search'>('chat');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  /** Session id awaiting a move target; opens the projects screen in pick mode. */
  const [movePickSession, setMovePickSession] = useState<string | null>(null);
  const [archived, setArchived] = useState<Session[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sessions = useChatStore((state) => state.sessions);
  const activeId = useChatStore((state) => state.activeSessionId);
  const draft = useChatStore((state) => state.draft);
  const status = useChatStore((state) => state.status);
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const theme = useSettingsStore((state) => state.theme);
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
      if (current()) setProjectsError(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      if (current()) setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    const reset = () => {
      accountEpoch.current++; syncEpoch.current++;
      streamAbort.current?.abort(); streamAbort.current = null;
      loadingDetails.current.clear();
      setProjects([]); setProjectsLoading(false); setProjectsError(null);
      setArchived([]);
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
        if (epoch === accountEpoch.current) useChatStore.getState().setStatus('error', error instanceof Error ? error.message : 'Could not load conversation');
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
  const send = useCallback(() => {
    const store = useChatStore.getState();
    const text = store.draft.trim();
    if (!text || store.turnId) return;
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) { store.setStatus('error', 'Sign in to send messages. Guest conversations stay on this device.'); return; }
    if (store.activeSessionId && loadingDetails.current.has(store.activeSessionId)) {
      store.setStatus('error', 'Conversation is loading. Please try again in a moment.'); return;
    }
    let sessionId = store.activeSessionId;
    if (!sessionId) {
      sessionId = `session-${Date.now()}`;
      store.setSessions([{ id: sessionId, title: text.slice(0, 80), topic: '', mode: 'chat', phase: 'chat', projectId: projectFilter, messages: [] }, ...store.sessions]);
      store.selectSession(sessionId);
    }
    const epoch = accountEpoch.current;
    const controller = new AbortController();
    streamAbort.current = controller;
    void runChatTurn({
      sessionId, turnId: `turn-${Date.now()}`, text, signal: controller.signal,
      isCurrent: () => epoch === accountEpoch.current,
      save: (session) => api.sessions.save(session), stream: streamConversation,
    }).finally(() => { if (streamAbort.current === controller) streamAbort.current = null; });
  }, [projectFilter]);
  const stop = useCallback(() => { streamAbort.current?.abort(); }, []);
  const login = useCallback(async (email: string, password: string) => {
    setAuthPending(true);
    setAuthError(null);
    try {
      const loggedIn = await api.auth.login(email, password);
      await persistUser(storage, loggedIn);
      useAuthStore.getState().setUser(loggedIn);
      void syncLibrary();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setAuthPending(false);
    }
  }, [syncLibrary]);
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
    if (useChatStore.getState().sessions.some((s) => s.id === useChatStore.getState().turnSessionId && s.projectId === id)) throw new Error('Stop the response before deleting this project.');
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
      if (useChatStore.getState().turnSessionId === id) throw new Error('Stop the response before archiving this conversation.');
      if (!isLocalSessionId(id) && owner && !owner.isGuest) await api.sessions.archive(id);
      if (epoch !== accountEpoch.current) return;
      const row = useChatStore.getState().sessions.find((s) => s.id === id);
      useChatStore.getState().archiveSession(id, projectFilter);
      if (row) setArchived((prev) => prev.some((s) => s.id === id) ? prev : [{ ...row, archivedAt: new Date().toISOString() }, ...prev]);
    } catch (error) {
      if (epoch === accountEpoch.current) useChatStore.getState().setStatus('error', error instanceof Error ? error.message : 'Archive failed');
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
      if (epoch === accountEpoch.current) useChatStore.getState().setStatus('error', error instanceof Error ? error.message : 'Restore failed');
    }
  }, [archived, select]);
  // Delete purges the session everywhere (mirrors DELETE /sessions/:id which
  // wipes messages/files/artifacts/runs). Local-only ids never hit the
  // network; the welcome row is just hidden like an archive.
  const deleteSession = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    const owner = useAuthStore.getState().user;
    try {
      if (useChatStore.getState().turnSessionId === id) throw new Error('Stop the response before deleting this conversation.');
      if (!isLocalSessionId(id) && owner && !owner.isGuest) await api.sessions.remove(id);
      if (epoch !== accountEpoch.current) return;
      useChatStore.getState().deleteSession(id, projectFilter);
      setArchived((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      if (epoch === accountEpoch.current) useChatStore.getState().setStatus('error', error instanceof Error ? error.message : 'Delete failed');
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
  // Search hits may point at sessions the store never held (archived rows
  // are excluded from the default list). Fetch-then-insert keeps the open
  // path identical to sidebar select, including lazy detail on next select.
  const openSearchSession = useCallback(async (id: string) => {
    const epoch = accountEpoch.current;
    try {
      const store = useChatStore.getState();
      if (!store.sessions.some((s) => s.id === id)) {
        const owner = useAuthStore.getState().user;
        if (!owner || owner.isGuest) throw new Error('Sign in to open this conversation.');
        const detail = await api.sessions.get(id);
        if (epoch !== accountEpoch.current) return;
        const current = useChatStore.getState();
        if (!current.sessions.some((s) => s.id === id)) current.setSessions([detail, ...current.sessions]);
      }
      if (epoch !== accountEpoch.current) return;
      setScreen('chat');
      select(id);
    } catch (error) {
      if (epoch === accountEpoch.current) useChatStore.getState().setStatus('error', error instanceof Error ? error.message : 'Could not open conversation');
    }
  }, [select]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuOpen) { setMenuOpen(false); setConfirmDelete(false); return true; }
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
    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><View style={styles.center}><Text style={{ color: palette.text.muted }}>Restoring session…</Text></View></SafeAreaView>;
  }
  if (!user) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} /><AuthGate mode={theme} pending={authPending} error={authError} onLogin={(email, password) => void login(email, password)} onGuest={continueAsGuest} /></SafeAreaView>;
  }

  if (screen === 'settings') {
    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} /><SettingsScreen mode={theme} onClose={() => setScreen('chat')} onSignOut={() => { signOut(); setScreen('chat'); }} /></SafeAreaView>;
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
            setProjectsError(error instanceof Error ? error.message : 'Move failed');
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

  return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />
    <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS !== 'web'}>
      {sidebarOpen ? <Sidebar
        sessions={visibleSessions}
        activeId={activeId}
        onSelect={select}
        onNewChat={createSession}
        mode={theme}
        archived={archived}
        onSelectArchived={(id) => void unarchiveSession(id)}
      /> : null}
      <View style={[styles.main, { backgroundColor: palette.bg.page }]}>
        <View style={[styles.header, { borderBottomColor: palette.border.default }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Toggle sidebar" onPress={() => setSidebarOpen((open) => !open)} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>☰</Text></Pressable>
          {projectFilter ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Clear project filter ${activeProject?.name || ''}`} onPress={() => setProjectFilter(null)} style={[styles.filterChip, { borderColor: palette.border.default, backgroundColor: palette.bg.hover }]}>
              <Text numberOfLines={1} style={[styles.filterText, { color: palette.text.primary }]}>📁 {activeProject?.name || 'Project'} ✕</Text>
            </Pressable>
          ) : (
            <Text numberOfLines={1} style={[styles.title, { color: palette.text.primary }]}>{active?.title || 'Socrates'}</Text>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Open search" onPress={() => setScreen('search')} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>🔍</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open projects" onPress={() => setScreen('projects')} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>📁</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Toggle theme" onPress={toggleTheme} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>{theme === 'dark' ? '☾' : '☀'}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => setScreen('settings')} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>⚙</Text></Pressable>
          {active ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Session actions" onPress={() => { setConfirmDelete(false); setMenuOpen((open) => !open); }} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>⋯</Text></Pressable>
          ) : null}
        </View>
        {menuOpen && active ? (
          <View style={[styles.menuSheet, { backgroundColor: palette.bg.raised, borderColor: palette.border.default }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${active.title || 'session'} to project`}
              onPress={() => { setMenuOpen(false); setConfirmDelete(false); setMovePickSession(active.id); setScreen('projects'); }}
              style={styles.menuItem}
            >
              <Text style={[styles.menuItemText, { color: palette.text.primary }]}>📁 Move to project</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Archive ${active.title || 'session'}`}
              onPress={() => { setMenuOpen(false); setConfirmDelete(false); void archiveSession(active.id); }}
              style={styles.menuItem}
            >
              <Text style={[styles.menuItemText, { color: palette.text.primary }]}>📦 Archive session</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmDelete ? `Confirm delete ${active.title || 'session'}` : `Delete ${active.title || 'session'}`}
              onPress={() => {
                if (confirmDelete) { setMenuOpen(false); void deleteSession(active.id); }
                else setConfirmDelete(true);
              }}
              style={styles.menuItem}
            >
              <Text style={[styles.menuItemText, { color: palette.danger }]}>
                {confirmDelete ? '🗑 Tap again to permanently delete (messages, files, artifacts)' : '🗑 Delete session'}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Close session menu" onPress={() => { setMenuOpen(false); setConfirmDelete(false); }} style={styles.menuItem}>
              <Text style={[styles.menuItemText, { color: palette.text.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
        {chatError ? <Text accessibilityRole="alert" style={{ color: palette.danger, padding: 12 }}>{chatError}</Text> : null}
        <ChatMessageList messages={active?.messages || []} mode={theme} onCopyText={copyText} />
        <Composer value={draft} streaming={status === 'sending' || status === 'streaming'} onChangeText={useChatStore.getState().setDraft} onSend={send} onStop={stop} mode={theme} />
      </View>
    </KeyboardAvoidingView>
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
