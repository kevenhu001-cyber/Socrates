import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Message, Session, User } from '@socrates/contracts';
import { buildChatHistory, consumeSseBuffer, dispatchChatSseFrame } from '@socrates/core';

type TokenPair = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  refreshExpiresAt?: string;
};

type RuntimeConfig = { apiBaseUrl?: string };
type GlobalWithConfig = typeof globalThis & { __SOCRATES_CONFIG__?: RuntimeConfig };

const DEFAULT_API_BASE_URL = 'https://app.topodrive.top/api/v2';
const API_BASE_URL = ((globalThis as GlobalWithConfig).__SOCRATES_CONFIG__?.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');

const colors = {
  background: '#0B0B0B',
  sidebar: '#141414',
  surface: '#1C1C1C',
  surfaceRaised: '#252525',
  border: '#303030',
  text: '#F6F3EA',
  muted: '#A8A39A',
  subtle: '#716C64',
  accent: '#E9BE53',
  danger: '#F48B8B',
  white: '#FFFFFF',
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function messageText(message: Message) {
  return message.rawText || message.content || '';
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const body = await response.text();
  let parsed: unknown = null;
  try { parsed = body ? JSON.parse(body) : null; } catch { parsed = { message: body }; }
  if (!response.ok) {
    const detail = parsed as { message?: unknown; detail?: unknown; error?: unknown } | null;
    throw new Error(typeof detail?.message === 'string' ? detail.message : typeof detail?.detail === 'string' ? detail.detail : typeof detail?.error === 'string' ? detail.error : `Request failed (${response.status})`);
  }
  return parsed as T;
}

function LoginPanel({ onLogin, busy, error }: { onLogin: (email: string, password: string) => void; busy: boolean; error: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <View style={styles.loginWrap}>
      <Text style={styles.eyebrow}>SOCRATES DESKTOP</Text>
      <Text style={styles.loginTitle}>A calmer place to think.</Text>
      <Text style={styles.loginBody}>The Windows shell shares the same account, sessions, API contract, and streaming core as Android and RN Web.</Text>
      <Text style={styles.label}>Email</Text>
      <TextInput
        accessibilityLabel="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={colors.subtle}
        style={styles.input}
        value={email}
      />
      <Text style={styles.label}>Password</Text>
      <TextInput
        accessibilityLabel="Password"
        autoComplete="current-password"
        onChangeText={setPassword}
        onSubmitEditing={() => onLogin(email, password)}
        placeholder="••••••••"
        placeholderTextColor={colors.subtle}
        secureTextEntry
        style={styles.input}
        value={password}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => onLogin(email, password)} style={[styles.primaryButton, busy && styles.disabled]}>
        {busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryButtonText}>Sign in</Text>}
      </Pressable>
    </View>
  );
}

function Sidebar({ sessions, activeId, onNewChat, onOpenSession, onLogout, user }: { sessions: Session[]; activeId: string | null; onNewChat: () => void; onOpenSession: (id: string) => void; onLogout: () => void; user: User }) {
  return (
    <View style={styles.sidebar}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>S</Text></View>
        <Text style={styles.brand}>Socrates</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onNewChat} style={styles.newChatButton}>
        <Text style={styles.newChatText}>＋ New chat</Text>
      </Pressable>
      <Text style={styles.sectionLabel}>RECENTS</Text>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => onOpenSession(item.id)} style={[styles.sessionRow, activeId === item.id && styles.sessionRowActive]}>
            <Text numberOfLines={1} style={styles.sessionTitle}>{item.title || item.topic || 'Untitled conversation'}</Text>
            <Text numberOfLines={1} style={styles.sessionPreview}>{item.preview || 'No messages yet'}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.emptySessions}>Your conversations will appear here.</Text>}
        style={styles.sessionList}
      />
      <View style={styles.profileRow}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(user.displayName || user.email).slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.profileCopy}>
          <Text numberOfLines={1} style={styles.profileName}>{user.displayName || user.email}</Text>
          <Text numberOfLines={1} style={styles.profileEmail}>{user.email}</Text>
        </View>
        <Pressable accessibilityLabel="Sign out" onPress={onLogout} style={styles.iconButton}><Text style={styles.iconText}>↪</Text></Pressable>
      </View>
    </View>
  );
}

function ChatPanel({ session, draft, streaming, error, onDraftChange, onSend, onStop }: { session: Session | null; draft: string; streaming: boolean; error: string; onDraftChange: (value: string) => void; onSend: () => void; onStop: () => void }) {
  const messages = session?.messages || [];
  return (
    <KeyboardAvoidingView behavior="height" style={styles.chatPane}>
      <View style={styles.chatHeader}>
        <View>
          <Text style={styles.chatKicker}>{session?.mode === 'tutor' ? 'TUTOR' : 'CHAT'}</Text>
          <Text style={styles.chatTitle}>{session?.title || 'New conversation'}</Text>
        </View>
        <Text style={styles.connection}>● Native Windows</Text>
      </View>
      <FlatList
        data={messages}
        keyExtractor={(item, index) => item.clientId || item.id || `${item.role}-${index}`}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => (
          <View style={[styles.messageRow, item.role === 'user' && styles.messageRowUser]}>
            <View style={[styles.messageBubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
              <Text style={[styles.messageRole, item.role === 'user' ? styles.userRole : styles.assistantRole]}>{item.role === 'user' ? 'You' : 'Socrates'}</Text>
              <Text selectable style={styles.messageText}>{messageText(item) || (item.type === 'streaming' ? 'Thinking…' : '')}</Text>
              {item.reasoningContent ? <Text style={styles.reasoning}>Reasoning available · {item.reasoningContent.length} chars</Text> : null}
            </View>
          </View>
        )}
        ListEmptyComponent={<View style={styles.emptyChat}><Text style={styles.emptyChatTitle}>What would you like to explore?</Text><Text style={styles.emptyChatBody}>Ask a question, work through an idea, or bring a difficult concept into focus.</Text></View>}
      />
      {error ? <Text style={styles.chatError}>{error}</Text> : null}
      <View style={styles.composerWrap}>
        <TextInput
          accessibilityLabel="Message"
          editable={!streaming}
          multiline
          onChangeText={onDraftChange}
          onSubmitEditing={onSend}
          placeholder="Message Socrates…"
          placeholderTextColor={colors.subtle}
          style={styles.composer}
          value={draft}
        />
        <Pressable accessibilityRole="button" disabled={!streaming && !draft.trim()} onPress={streaming ? onStop : onSend} style={[styles.sendButton, (!streaming && !draft.trim()) && styles.disabled]}>
          <Text style={styles.sendButtonText}>{streaming ? '■' : '↑'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function App() {
  const [tokens, setTokens] = useState<TokenPair | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const refreshSessions = useCallback(async (accessToken: string) => {
    const result = await request<{ sessions: Session[] }>('/sessions?limit=50', {}, accessToken);
    setSessions(result.sessions || []);
    return result.sessions || [];
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    setBusy(true); setError('');
    try {
      const result = await request<{ user: User } & TokenPair>('/auth/mobile/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
      const nextTokens = { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt, refreshExpiresAt: result.refreshExpiresAt };
      setTokens(nextTokens);
      setUser(result.user);
      await refreshSessions(nextTokens.accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in.');
    } finally { setBusy(false); }
  }, [refreshSessions]);

  const newChat = useCallback(() => {
    setActiveSession({ id: makeId('windows'), topic: '', title: 'New conversation', mode: 'chat', kind: 'chat', messages: [] });
    setDraft('');
    setError('');
  }, []);

  const openSession = useCallback(async (id: string) => {
    if (!tokens) return;
    setBusy(true); setError('');
    try { setActiveSession(await request<Session>(`/sessions/${encodeURIComponent(id)}`, {}, tokens.accessToken)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to open conversation.'); }
    finally { setBusy(false); }
  }, [tokens]);

  const saveSession = useCallback(async (session: Session) => {
    if (!tokens) return session;
    const saved = await request<Session>('/sessions', { method: 'POST', body: JSON.stringify(session) }, tokens.accessToken);
    setSessions((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    return { ...session, ...saved, messages: session.messages };
  }, [tokens]);

  const streamReply = useCallback(async (session: Session, messages: Message[]) => {
    if (!tokens) return;
    setStreaming(true);
    const assistant: Message = { clientId: makeId('assistant'), role: 'assistant', rawText: '', content: '', type: 'streaming' };
    setActiveSession({ ...session, messages: [...messages, assistant] });
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    let cursor = 0;
    let buffer = '';
    const patchAssistant = (patch: (message: Message) => Message) => {
      setActiveSession((current) => {
        if (!current) return current;
        const nextMessages = current.messages || [];
        const last = nextMessages.at(-1);
        if (!last || last.role !== 'assistant') return current;
        return { ...current, messages: [...nextMessages.slice(0, -1), patch(last)] };
      });
    };
    const consume = () => {
      buffer += (xhr.responseText || '').slice(cursor);
      cursor = (xhr.responseText || '').length;
      buffer = consumeSseBuffer(buffer, (frame) => dispatchChatSseFrame(frame, {
        onDelta: (value) => patchAssistant((message) => ({ ...message, rawText: `${message.rawText || ''}${value}`, content: `${message.content || ''}${value}` })),
        onReasoning: (value) => patchAssistant((message) => ({ ...message, reasoningContent: `${message.reasoningContent || ''}${value}` })),
        onError: (value) => setError(value),
        onDone: () => undefined,
      }));
    };
    xhr.open('POST', `${API_BASE_URL}/chat/stream?sessionId=${encodeURIComponent(session.id)}`);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${tokens.accessToken}`);
    xhr.onprogress = consume;
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      consume();
      if (buffer.trim()) dispatchChatSseFrame(buffer, { onError: setError });
      setStreaming(false);
      xhrRef.current = null;
      setActiveSession((current) => current ? { ...current, messages: (current.messages || []).map((message) => message.type === 'streaming' ? { ...message, type: 'assistant' } : message) } : current);
      if (xhr.status >= 400) setError(`Stream failed (${xhr.status})`);
    };
    xhr.onerror = () => { xhrRef.current = null; setStreaming(false); setError('Network unavailable.'); };
    xhr.send(JSON.stringify({ messages: buildChatHistory(messages), mode: session.mode, temperature: 0.7, max_tokens: 4096 }));
  }, [tokens]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming || !tokens) return;
    let session = activeSession;
    if (!session) {
      newChat();
      session = { id: makeId('windows'), topic: text.slice(0, 100), title: text.slice(0, 54), mode: 'chat', kind: 'chat', messages: [] };
    }
    const messages = [...(session.messages || []), { clientId: makeId('user'), role: 'user' as const, rawText: text, content: text, type: 'user' }];
    const nextSession = { ...session, topic: session.topic || text.slice(0, 100), title: session.title === 'New conversation' ? text.slice(0, 54) : session.title, messages, updatedAt: new Date().toISOString() };
    setDraft(''); setError(''); setActiveSession(nextSession);
    try { await streamReply(await saveSession(nextSession), messages); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to send message.'); }
  }, [activeSession, draft, newChat, saveSession, streamReply, streaming, tokens]);

  const logout = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setTokens(null); setUser(null); setSessions([]); setActiveSession(null); setDraft(''); setError('');
  }, []);

  useEffect(() => () => { xhrRef.current?.abort(); }, []);

  const title = useMemo(() => activeSession?.title || 'New conversation', [activeSession?.title]);
  if (!user || !tokens) return <SafeAreaView style={styles.root}><LoginPanel busy={busy} error={error} onLogin={(email, password) => { void login(email, password); }} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.appFrame}>
        <Sidebar activeId={activeSession?.id || null} onLogout={logout} onNewChat={newChat} onOpenSession={(id) => { void openSession(id); }} sessions={sessions} user={user} />
        <View style={styles.mainPane}>
          <View style={styles.windowHeader}><Text style={styles.windowTitle}>{title}</Text>{busy ? <ActivityIndicator color={colors.accent} /> : null}</View>
          <ChatPanel draft={draft} error={error} onDraftChange={setDraft} onSend={() => { void send(); }} onStop={() => { xhrRef.current?.abort(); setStreaming(false); }} session={activeSession} streaming={streaming} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  appFrame: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 320, backgroundColor: colors.sidebar, borderRightColor: colors.border, borderRightWidth: 1, paddingHorizontal: 18, paddingTop: 22 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 8, paddingBottom: 26 },
  brandMark: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  brandMarkText: { color: colors.background, fontSize: 18, fontWeight: '800' },
  brand: { color: colors.text, fontSize: 21, fontWeight: '700' },
  newChatButton: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 10, borderWidth: 1, minHeight: 46, justifyContent: 'center', paddingHorizontal: 15 },
  newChatText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sectionLabel: { color: colors.subtle, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 28, paddingHorizontal: 8 },
  sessionList: { flex: 1, marginTop: 10 },
  sessionRow: { borderRadius: 9, minHeight: 60, paddingHorizontal: 11, paddingVertical: 9 },
  sessionRowActive: { backgroundColor: colors.surfaceRaised },
  sessionTitle: { color: colors.text, fontSize: 13, fontWeight: '600' },
  sessionPreview: { color: colors.subtle, fontSize: 11, marginTop: 5 },
  emptySessions: { color: colors.subtle, fontSize: 12, lineHeight: 18, padding: 10 },
  profileRow: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, minHeight: 76 },
  avatar: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  avatarText: { color: colors.background, fontSize: 14, fontWeight: '800' },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { color: colors.text, fontSize: 13, fontWeight: '600' },
  profileEmail: { color: colors.subtle, fontSize: 10, marginTop: 3 },
  iconButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  iconText: { color: colors.muted, fontSize: 22 },
  mainPane: { flex: 1, minWidth: 0 },
  windowHeader: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 72, paddingHorizontal: 34 },
  windowTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  chatPane: { flex: 1, minWidth: 0 },
  chatHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 34, paddingTop: 28 },
  chatKicker: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  chatTitle: { color: colors.text, fontSize: 25, fontWeight: '700', marginTop: 5 },
  connection: { color: colors.subtle, fontSize: 11 },
  messageList: { alignSelf: 'center', maxWidth: 980, paddingBottom: 28, paddingHorizontal: 34, paddingTop: 30, width: '100%' },
  messageRow: { alignItems: 'flex-start', marginBottom: 18 },
  messageRowUser: { alignItems: 'flex-end' },
  messageBubble: { borderRadius: 14, maxWidth: '78%', paddingHorizontal: 18, paddingVertical: 13 },
  assistantBubble: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  userBubble: { backgroundColor: '#3A301C' },
  messageRole: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 },
  assistantRole: { color: colors.accent },
  userRole: { color: '#F3D88D' },
  messageText: { color: colors.text, fontSize: 15, lineHeight: 23 },
  reasoning: { color: colors.subtle, fontSize: 11, marginTop: 9 },
  emptyChat: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 150 },
  emptyChatTitle: { color: colors.text, fontSize: 25, fontWeight: '700', textAlign: 'center' },
  emptyChatBody: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: 12, maxWidth: 440, textAlign: 'center' },
  chatError: { color: colors.danger, fontSize: 12, paddingHorizontal: 34, paddingBottom: 8 },
  composerWrap: { alignSelf: 'center', flexDirection: 'row', gap: 10, maxWidth: 980, paddingBottom: 22, paddingHorizontal: 34, width: '100%' },
  composer: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.text, flex: 1, fontSize: 15, maxHeight: 120, minHeight: 54, paddingHorizontal: 17, paddingVertical: 14 },
  sendButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 14, height: 54, justifyContent: 'center', width: 54 },
  sendButtonText: { color: colors.background, fontSize: 22, fontWeight: '800' },
  loginWrap: { alignSelf: 'center', maxWidth: 470, padding: 40, width: '100%' },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  loginTitle: { color: colors.text, fontSize: 38, fontWeight: '700', lineHeight: 46, marginTop: 16 },
  loginBody: { color: colors.muted, fontSize: 14, lineHeight: 22, marginBottom: 28, marginTop: 14 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 7, marginTop: 13 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 9, borderWidth: 1, color: colors.text, fontSize: 15, minHeight: 48, paddingHorizontal: 13 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 12 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 9, justifyContent: 'center', marginTop: 20, minHeight: 50 },
  primaryButtonText: { color: colors.background, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.55 },
});
