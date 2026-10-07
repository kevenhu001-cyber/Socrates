import 'react-native-reanimated';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Message, Project, Session } from '@socrates/contracts';
import { useChatStore } from '@socrates/chat';
import { useAuthStore } from '@socrates/auth';
import { useSettingsStore } from '@socrates/settings';
import { getThemePaletteHex } from '@socrates/theme';
import { ChatMessageList, Composer, Sidebar } from '@socrates/ui';
import { api, streamConversation } from './src/runtime';
import { storage } from './src/storage';
import { AuthGate } from './src/AuthGate';
import { SettingsScreen } from './src/SettingsScreen';
import { ProjectsScreen } from './src/ProjectsScreen';

const initialSessions: Session[] = [{ id: 'welcome', title: 'Welcome to Socrates', topic: 'Universal app', mode: 'chat', phase: 'chat', messages: [{ clientId: 'welcome-assistant', role: 'assistant', rawText: 'How can I help you learn today?' }] }];

/** Local-only ids never hit the network for detail fetch. */
function isLocalId(id: string) {
  return id === 'welcome' || id.startsWith('session-');
}

export default function App() {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [sidebarOpen, setSidebarOpen] = useState(!compact);
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [screen, setScreen] = useState<'chat' | 'settings' | 'projects'>('chat');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  /** Session id awaiting a move target; opens the projects screen in pick mode. */
  const [movePickSession, setMovePickSession] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
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
      const list = sessions.filter((s) => !s.archivedAt);
      return projectFilter ? list.filter((s) => s.projectId === projectFilter) : list;
    },
    [sessions, projectFilter],
  );
  const activeProject = useMemo(() => projects.find((p) => p.id === projectFilter) || null, [projects, projectFilter]);
  const streamAbort = useRef<AbortController | null>(null);

  // Library sync: projects + session index. Server list rows are
  // lightweight (no messages); detail is fetched lazily on select.
  // Never clobbers local sessions that already carry messages.
  const syncLibrary = useCallback(async () => {
    const user = useAuthStore.getState().user;
    if (!user || user.isGuest) return;
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const [fetchedProjects, fetchedSessions] = await Promise.all([
        api.projects.list().catch(() => null),
        api.sessions.list().catch(() => null),
      ]);
      if (fetchedProjects) setProjects(fetchedProjects);
      if (fetchedSessions?.length) {
        const store = useChatStore.getState();
        const existing = new Map(store.sessions.map((s) => [s.id, s]));
        for (const row of fetchedSessions) {
          const current = existing.get(row.id);
          if (!current || !(current.messages?.length)) existing.set(row.id, { ...row, messages: current?.messages ?? [] } as Session);
        }
        const merged = [...existing.values()];
        store.setSessions(merged);
        if (!merged.some((s) => s.id === store.activeSessionId)) store.selectSession(merged[0].id);
      }
    } catch (error) {
      setProjectsError(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    void useSettingsStore.getState().hydrate(storage);
    void useAuthStore.getState().restore(storage, () => api.auth.me()).then(() => void syncLibrary());
  }, [syncLibrary]);
  useEffect(() => { if (!sessions.length) { useChatStore.getState().setSessions(initialSessions); useChatStore.getState().selectSession('welcome'); } }, [sessions.length]);
  useEffect(() => () => streamAbort.current?.abort(), []);
  const select = useCallback((id: string) => {
    const store = useChatStore.getState();
    store.selectSession(id);
    if (compact) setSidebarOpen(false);
    // Lazy detail: list rows carry no messages; fetch once for server ids.
    const session = store.sessions.find((s) => s.id === id);
    const authed = useAuthStore.getState().user;
    if (session && !(session.messages?.length) && !isLocalId(id) && authed && !authed.isGuest) {
      void api.sessions.get(id).then((detail) => {
        const current = useChatStore.getState();
        if (current.activeSessionId !== id) return;
        current.setSessions(current.sessions.map((s) => (s.id === id ? { ...detail, messages: detail.messages ?? [] } as Session : s)));
      }).catch(() => { /* keep the empty row; user can retry by reselecting */ });
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
    const session = store.sessions.find((item) => item.id === store.activeSessionId);
    if (!text || !session) return;
    const userMsg: Message = { clientId: `user-${Date.now()}`, role: 'user', rawText: text };
    const messages = [...session.messages || [], userMsg];
    store.appendMessage(userMsg);
    store.setDraft('');
    store.setStatus('streaming');
    streamAbort.current?.abort();
    const controller = new AbortController();
    streamAbort.current = controller;
    void streamConversation({
      sessionId: session.id,
      messages,
      signal: controller.signal,
      handlers: {
        onDelta: (delta) => useChatStore.getState().appendDelta(delta),
        onReasoning: (delta) => useChatStore.getState().appendDelta(delta),
        onError: (error) => useChatStore.getState().setStatus('error', error),
        onDone: () => useChatStore.getState().setStatus('idle'),
      },
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) useChatStore.getState().setStatus('error', error instanceof Error ? error.message : 'Stream failed');
    });
  }, []);
  const stop = useCallback(() => { streamAbort.current?.abort(); streamAbort.current = null; useChatStore.getState().setStatus('idle'); }, []);
  const login = useCallback(async (email: string, password: string) => {
    setAuthPending(true);
    setAuthError(null);
    try {
      const loggedIn = await api.auth.login(email, password);
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
    setProjects([]);
    setProjectFilter(null);
    setMovePickSession(null);
    setMenuOpen(false);
    setScreen('chat');
    useChatStore.getState().setSessions(initialSessions);
    useChatStore.getState().selectSession('welcome');
  }, []);
  const createProject = useCallback(async (name: string) => {
    const project = await api.projects.create({ name });
    setProjects((prev) => [project, ...prev]);
    setProjectFilter(project.id);
  }, []);
  const renameProject = useCallback(async (id: string, name: string) => {
    const updated = await api.projects.update(id, { name });
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }, []);
  const deleteProject = useCallback(async (id: string) => {
    await api.projects.remove(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (projectFilter === id) {
      // Sessions of a deleted project become unfiled, like the server
      // (DELETE /projects/:id nulls their project_id via transaction).
      const store = useChatStore.getState();
      store.setSessions(store.sessions.map((s) => (s.projectId === id ? { ...s, projectId: null } : s)));
      setProjectFilter(null);
    }
  }, [projectFilter]);
  // Archive hides the session from the sidebar (mirrors frontend recents).
  // Local-only ids are marked locally; server ids also POST the endpoint
  // (best-effort: the row stays hidden even if the POST fails offline).
  const archiveSession = useCallback((id: string) => {
    const store = useChatStore.getState();
    const archivedAt = new Date().toISOString();
    store.setSessions(store.sessions.map((s) => (s.id === id ? { ...s, archivedAt } : s)));
    if (store.activeSessionId === id) {
      const next = store.sessions.find((s) => s.id !== id && !s.archivedAt);
      store.selectSession(next ? next.id : null);
    }
    const authed = useAuthStore.getState().user;
    if (!isLocalId(id) && authed && !authed.isGuest) {
      void api.sessions.archive(id).catch(() => { /* already hidden locally */ });
    }
  }, []);
  // Move a session to another project (or unfiled). Server PATCH for
  // server ids; local ids are restamped locally only.
  const moveSessionToProject = useCallback(async (sessionId: string, targetId: string | null) => {
    const store = useChatStore.getState();
    const authed = useAuthStore.getState().user;
    if (!isLocalId(sessionId) && authed && !authed.isGuest) {
      const updated = await api.sessions.patch(sessionId, { projectId: targetId });
      store.setSessions(store.sessions.map((s) => (s.id === sessionId ? { ...s, ...updated } : s)));
    } else {
      store.setSessions(store.sessions.map((s) => (s.id === sessionId ? { ...s, projectId: targetId } : s)));
    }
    // If the moved session was the active one and it left the current
    // filter, fall back to the filter's first visible session.
    if (projectFilter && targetId !== projectFilter) {
      const current = useChatStore.getState();
      const stillVisible = current.sessions.some((s) => s.id === current.activeSessionId && !s.archivedAt && s.projectId === projectFilter);
      if (!stillVisible) {
        const first = current.sessions.find((s) => !s.archivedAt && s.projectId === projectFilter);
        current.selectSession(first ? first.id : null);
      }
    }
  }, [projectFilter]);
  // Selecting a project filters the sidebar AND moves the transcript to
  // that project's first session, so the message list never disagrees
  // with the filtered sidebar (e.g. still showing the welcome session).
  const selectProject = useCallback((id: string | null) => {
    setProjectFilter(id);
    if (id) {
      const store = useChatStore.getState();
      const current = store.sessions.find((s) => s.id === store.activeSessionId);
      if (!current || current.projectId !== id) {
        const first = store.sessions.find((s) => s.projectId === id);
        // Reuse select() so server rows lazily fetch their detail.
        if (first) select(first.id);
      }
    }
  }, [compact, select]);
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

  return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />
    <View style={styles.shell}>
      {sidebarOpen ? <Sidebar
        sessions={visibleSessions}
        activeId={activeId}
        onSelect={select}
        onNewChat={createSession}
        mode={theme}
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
          <Pressable accessibilityRole="button" accessibilityLabel="Open projects" onPress={() => setScreen('projects')} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>📁</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Toggle theme" onPress={toggleTheme} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>{theme === 'dark' ? '☾' : '☀'}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => setScreen('settings')} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>⚙</Text></Pressable>
          {active ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Session actions" onPress={() => setMenuOpen((open) => !open)} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>⋯</Text></Pressable>
          ) : null}
        </View>
        {menuOpen && active ? (
          <View style={[styles.menuSheet, { backgroundColor: palette.bg.raised, borderColor: palette.border.default }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${active.title || 'session'} to project`}
              onPress={() => { setMenuOpen(false); setMovePickSession(active.id); setScreen('projects'); }}
              style={styles.menuItem}
            >
              <Text style={[styles.menuItemText, { color: palette.text.primary }]}>📁 Move to project</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Archive ${active.title || 'session'}`}
              onPress={() => { setMenuOpen(false); archiveSession(active.id); }}
              style={styles.menuItem}
            >
              <Text style={[styles.menuItemText, { color: palette.text.primary }]}>📦 Archive session</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Close session menu" onPress={() => setMenuOpen(false)} style={styles.menuItem}>
              <Text style={[styles.menuItemText, { color: palette.text.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
        <ChatMessageList messages={active?.messages || []} mode={theme} />
        <Composer value={draft} streaming={status === 'streaming'} onChangeText={useChatStore.getState().setDraft} onSend={send} onStop={stop} mode={theme} />
      </View>
    </View>
  </SafeAreaView>;
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
