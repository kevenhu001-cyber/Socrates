import React from 'react';
import type { Message, Session } from '@socrates/contracts';
import { getThemePaletteHex } from '@socrates/theme';
import type { ThemeMode } from '@socrates/theme';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

// Legacy light-only export kept for compat; new code should pass mode
// explicitly (frontend baseline supports light + dark).
export const colors = { bg: '#ffffff', sidebar: '#f7f7f8', text: '#0d0d0d', muted: '#6b6b6b', border: '#e5e5e5', user: '#f4f4f4' } as const;

export type UiMode = ThemeMode;

function paletteFor(mode: UiMode = 'light') {
  return getThemePaletteHex(mode);
}

export function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNewChat,
  mode = 'light',
}: {
  sessions: Session[];
  activeId: string | null;
  onSelect(id: string): void;
  onNewChat(): void;
  mode?: UiMode;
}) {
  const p = paletteFor(mode);
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.sidebar, { backgroundColor: p.bg.raised, borderRightColor: p.border.default }]}>
      <Text style={[styles.brand, { color: p.text.primary }]}>Socrates</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="New chat" onPress={onNewChat} style={[styles.newChat, { borderColor: p.border.default }]}>
        <Text style={[styles.newChatText, { color: p.text.primary }]}>New chat</Text>
      </Pressable>
      <Text style={[styles.section, { color: p.text.muted }]}>Conversations</Text>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.title || item.topic || 'Untitled'}
            onPress={() => onSelect(item.id)}
            style={[styles.session, item.id === activeId && { backgroundColor: p.bg.hover }]}
          >
            <Text numberOfLines={1} style={[styles.sessionTitle, { color: p.text.primary }]}>
              {item.title || item.topic || 'Untitled'}
            </Text>
          </Pressable>
        )}
      />
    </Animated.View>
  );
}

function MessageRow({ message, mode = 'light' }: { message: Message; mode?: UiMode }) {
  const p = paletteFor(mode);
  const text = message.rawText || message.content || '';
  return (
    <Animated.View layout={LinearTransition} style={[styles.message, message.role === 'user' && { ...styles.userMessage, backgroundColor: p.bg.hover }]}>
      <Text selectable style={[styles.messageText, { color: p.text.primary }]}>
        {text || '…'}
      </Text>
      {message.toolCalls?.map((tool) => (
        <View key={tool.id} style={[styles.tool, { borderColor: p.border.default }]}>
          <Text style={[styles.toolName, { color: p.text.primary }]}>{tool.name}</Text>
          <Text style={[styles.toolText, { color: p.text.muted }]}>{tool.output || tool.argumentsText || 'Running…'}</Text>
        </View>
      ))}
    </Animated.View>
  );
}

export function ChatMessageList({
  messages,
  mode = 'light',
  emptyText = 'How can I help you learn today?',
}: {
  messages: Message[];
  mode?: UiMode;
  emptyText?: string;
}) {
  const p = paletteFor(mode);
  if (!messages.length) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: p.text.muted }]}>{emptyText}</Text>
      </View>
    );
  }
  return (
    <FlatList
      contentContainerStyle={styles.messages}
      data={messages}
      keyExtractor={(item, index) => item.id || item.clientId || String(index)}
      renderItem={({ item }) => <MessageRow message={item} mode={mode} />}
    />
  );
}

export function Composer({
  value,
  streaming,
  onChangeText,
  onSend,
  onStop,
  mode = 'light',
}: {
  value: string;
  streaming?: boolean;
  onChangeText(value: string): void;
  onSend(): void;
  onStop(): void;
  mode?: UiMode;
}) {
  const p = paletteFor(mode);
  const enabled = value.trim().length > 0;
  return (
    <View style={[styles.composerWrap, { backgroundColor: p.bg.page }]}>
      <View style={[styles.composer, { borderColor: p.border.default, backgroundColor: p.bg.page }]}>
        <TextInput
          accessibilityLabel="Message Socrates"
          multiline
          value={value}
          onChangeText={onChangeText}
          placeholder="Message Socrates"
          placeholderTextColor={p.text.muted}
          style={[styles.input, { color: p.text.primary }]}
          onSubmitEditing={() => enabled && onSend()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={streaming ? 'Stop generating' : 'Send message'}
          disabled={!streaming && !enabled}
          onPress={streaming ? onStop : onSend}
          style={[styles.send, { backgroundColor: p.text.primary }, !streaming && !enabled && styles.sendDisabled]}
        >
          <Text style={[styles.sendText, { color: p.onAccent }]}>{streaming ? '■' : '↑'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { width: 280, height: '100%', padding: 12, borderRightWidth: StyleSheet.hairlineWidth },
  brand: { fontSize: 18, fontWeight: '700', padding: 12 },
  newChat: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 20 },
  newChatText: { fontWeight: '600' },
  section: { fontSize: 12, paddingHorizontal: 10, paddingBottom: 6 },
  session: { padding: 10, borderRadius: 9 },
  sessionTitle: {},
  messages: { width: '100%', maxWidth: 768, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 36, paddingBottom: 120, gap: 24 },
  message: { alignSelf: 'stretch' },
  userMessage: { alignSelf: 'flex-end', maxWidth: '80%', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10 },
  messageText: { fontSize: 16, lineHeight: 25 },
  tool: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  toolName: { fontWeight: '600' },
  toolText: { marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 16, textAlign: 'center' },
  composerWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16 },
  composer: { maxWidth: 768, width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderRadius: 24, padding: 8, paddingLeft: 16 },
  input: { flex: 1, minHeight: 36, maxHeight: 180, fontSize: 16, paddingVertical: 8 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.25 },
  sendText: { fontSize: 20, fontWeight: '700' },
});
