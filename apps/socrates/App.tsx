import 'react-native-reanimated';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Message, Session } from '@socrates/contracts';
import { useChatStore } from '@socrates/chat';
import { useAuthStore } from '@socrates/auth';
import { useSettingsStore } from '@socrates/settings';
import { getThemePaletteHex } from '@socrates/theme';
import { ChatMessageList, Composer, Sidebar } from '@socrates/ui';
import { api, streamConversation } from './src/runtime';
import { storage } from './src/storage';
import { AuthGate } from './src/AuthGate';
import { SettingsScreen } from './src/SettingsScreen';

const initialSessions: Session[] = [{ id: 'welcome', title: 'Welcome to Socrates', topic: 'Universal app', mode: 'chat', phase: 'chat', messages: [{ clientId: 'welcome-assistant', role: 'assistant', rawText: 'How can I help you learn today?' }] }];

export default function App() {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [sidebarOpen, setSidebarOpen] = useState(!compact);
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [screen, setScreen] = useState<'chat' | 'settings'>('chat');
  const sessions = useChatStore((state) => state.sessions);
  const activeId = useChatStore((state) => state.activeSessionId);
  const draft = useChatStore((state) => state.draft);
  const status = useChatStore((state) => state.status);
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const theme = useSettingsStore((state) => state.theme);
  const palette = useMemo(() => getThemePaletteHex(theme), [theme]);
  const active = useMemo(() => sessions.find((session) => session.id === activeId) || null, [activeId, sessions]);
  const streamAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    void useSettingsStore.getState().hydrate(storage);
    void useAuthStore.getState().restore(storage, () => api.auth.me());
  }, []);
  useEffect(() => { if (!sessions.length) { useChatStore.getState().setSessions(initialSessions); useChatStore.getState().selectSession('welcome'); } }, [sessions.length]);
  useEffect(() => () => streamAbort.current?.abort(), []);
  const select = useCallback((id: string) => { useChatStore.getState().selectSession(id); if (compact) setSidebarOpen(false); }, [compact]);
  const createSession = useCallback(() => { const id = `session-${Date.now()}`; useChatStore.getState().setSessions([{ id, title: 'New chat', topic: '', mode: 'chat', phase: 'chat', messages: [] }, ...useChatStore.getState().sessions]); select(id); }, [select]);
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
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setAuthPending(false);
    }
  }, []);
  const continueAsGuest = useCallback(() => {
    useAuthStore.getState().setUser({ id: 'guest', email: '', displayName: 'Guest', isGuest: true });
  }, []);
  const signOut = useCallback(() => { void useAuthStore.getState().signOut(storage, () => api.auth.logout()); }, []);
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

  return <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg.page }]}><StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />
    <View style={styles.shell}>
      {sidebarOpen ? <Sidebar sessions={sessions} activeId={activeId} onSelect={select} onNewChat={createSession} mode={theme} /> : null}
      <View style={[styles.main, { backgroundColor: palette.bg.page }]}>
        <View style={[styles.header, { borderBottomColor: palette.border.default }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Toggle sidebar" onPress={() => setSidebarOpen((open) => !open)} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>☰</Text></Pressable>
          <Text numberOfLines={1} style={[styles.title, { color: palette.text.primary }]}>{active?.title || 'Socrates'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Toggle theme" onPress={toggleTheme} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>{theme === 'dark' ? '☾' : '☀'}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => setScreen('settings')} style={styles.menu}><Text style={[styles.menuText, { color: palette.text.primary }]}>⚙</Text></Pressable>
        </View>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
