import React, { memo, useState } from 'react';
import { MessageContent, type MessageActions } from './MessageContent.tsx';
import type { Message, Session } from '@socrates/contracts';
import { getThemePaletteHex } from '@socrates/theme';
import type { ThemeMode } from '@socrates/theme';
import { uiStrings, type UiLanguage } from './strings';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export { artifactFromFence, artifactsFromToolCalls, islandKindForLang, parseArtifactBridgeMessage, type ArtifactDescriptor } from './artifacts';
export { buildEmbeddedDocument } from './artifactDocument';
export { buildVisualizationDocument, isVisualizationSpec, paletteForDocument, visualizationSpecOf, visualizationSummary, type VisualizationSpec } from './visualization';
export { fileKindLabel, formatFileSize, isImageMime, storedFileIdFromRawUrl, storedFileIdsInText } from './fileMeta';
export { toolArtifacts, toolDurationLabel, toolInputPreview, toolLabel, toolState, type ToolArtifactRef } from './toolModel';
export { ExamView } from './ExamView.tsx';
export { detectExamLanguage, examAnswersOf, examGenerationPrompt, examProgress, examPromptTypes, gradeExam, missingExamAnswers, parseExamQuestionResponse, parseExamQuestions, type ExamQuestion, type ExamQuestionType } from './examModel';
export type { MessageActions } from './MessageContent.tsx';

// Legacy light-only export kept for compat; new code should pass mode
// explicitly (frontend baseline supports light + dark).
export const colors = { bg: '#ffffff', sidebar: '#f7f7f8', text: '#0d0d0d', muted: '#6b6b6b', border: '#e5e5e5', user: '#f4f4f4' } as const;

export type UiMode = ThemeMode;

function paletteFor(mode: UiMode = 'light') {
  return getThemePaletteHex(mode);
}

// Pure navigation: rows only select. Session actions (archive/move) live in
// the App header overflow menu so they work on every viewport — and so the
// sidebar stays animation-free: mount entering/exiting animations caused
// tap cancellations on RN Web (row shifts between pointerdown/up) plus
// Playwright stability flake. Message rows keep their LinearTransition.
export function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNewChat,
  onNewExam,
  mode = 'light',
  language = 'en',
  archived = [],
  onSelectArchived,
}: {
  sessions: Session[];
  activeId: string | null;
  onSelect(id: string): void;
  onNewChat(): void;
  /** Opens the exam setup flow; hidden when omitted (guest). */
  onNewExam?(): void;
  mode?: UiMode;
  language?: UiLanguage;
  /** Server-fetched archived rows; rendered in a collapsed section so the
   * main list stays a pure visible-session navigator. */
  archived?: Session[];
  /** Restores and opens an archived session; defaults to plain select. */
  onSelectArchived?(id: string): void;
}) {
  const p = paletteFor(mode);
  const t = uiStrings(language);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const openArchived = onSelectArchived || onSelect;
  const titleOf = (item: Session) => item.title || item.topic || t.untitled;
  return (
    <View style={[styles.sidebar, { backgroundColor: p.bg.raised, borderRightColor: p.border.default }]}>
      <Text style={[styles.brand, { color: p.text.primary }]}>{t.brand}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t.newChat} onPress={onNewChat} style={[styles.newChat, { borderColor: p.border.default }]}>
        <Text style={[styles.newChatText, { color: p.text.primary }]}>{t.newChat}</Text>
      </Pressable>
      {onNewExam ? <Pressable accessibilityRole="button" accessibilityLabel={t.newExam} onPress={onNewExam} style={[styles.newChat, { borderColor: p.border.default }]}>
        <Text style={[styles.newChatText, { color: p.text.primary }]}>🗒 {t.newExam}</Text>
      </Pressable> : null}
      <Text style={[styles.section, { color: p.text.muted }]}>{t.conversations}</Text>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={titleOf(item)}
            onPress={() => onSelect(item.id)}
            style={[styles.session, item.id === activeId && { backgroundColor: p.bg.hover }]}
          >
            <Text numberOfLines={1} style={[styles.sessionTitle, { color: p.text.primary }]}>
              {item.kind === 'exam' ? '🗒 ' : ''}{titleOf(item)}
            </Text>
          </Pressable>
        )}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={archivedOpen ? t.hideArchived : t.showArchived(archived.length)}
        accessibilityState={{ expanded: archivedOpen }}
        onPress={() => setArchivedOpen((open) => !open)}
        style={styles.archivedToggle}
      >
        <Text style={[styles.section, { color: p.text.muted }]}>{archivedOpen ? '▾' : '▸'} {archivedOpen ? t.hideArchived : t.showArchived(archived.length)}</Text>
      </Pressable>
      {archivedOpen ? (
        archived.length ? (
          <FlatList
            data={archived}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.restoreSession(titleOf(item))}
                onPress={() => openArchived(item.id)}
                style={styles.session}
              >
                <Text numberOfLines={1} style={[styles.sessionTitle, { color: p.text.muted }]}>
                  {titleOf(item)}
                </Text>
              </Pressable>
            )}
          />
        ) : (
          <Text style={[styles.archivedEmpty, { color: p.text.muted }]}>{t.noArchived}</Text>
        )
      ) : null}
    </View>
  );
}

const MessageRow = memo(function MessageRow({ message, mode = 'light', language = 'en', onCopyText, onSpeakText, onOpenArtifact, onOpenStoredArtifact, resolveImage, onOpenFile }: { message: Message; mode?: UiMode; language?: UiLanguage } & MessageActions) {
  const p = paletteFor(mode);
  return <Animated.View layout={LinearTransition} style={[styles.message, message.role === 'user' && { ...styles.userMessage, backgroundColor: p.bg.hover }]}>
    <MessageContent message={message} mode={mode} language={language} onCopyText={onCopyText} onSpeakText={onSpeakText} onOpenArtifact={onOpenArtifact} onOpenStoredArtifact={onOpenStoredArtifact} resolveImage={resolveImage} onOpenFile={onOpenFile} />
  </Animated.View>;
});

export function ChatMessageList({
  messages,
  mode = 'light',
  language = 'en',
  emptyText,
  onCopyText,
  onSpeakText,
  onOpenArtifact,
  onOpenStoredArtifact,
  resolveImage,
  onOpenFile,
}: {
  messages: Message[];
  mode?: UiMode;
  language?: UiLanguage;
  emptyText?: string;
} & MessageActions) {
  const p = paletteFor(mode);
  const t = uiStrings(language);
  if (!messages.length) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: p.text.muted }]}>{emptyText ?? t.emptyChat}</Text>
      </View>
    );
  }
  return (
    <FlatList
      contentContainerStyle={styles.messages}
      data={messages}
      keyExtractor={(item, index) => item.id || item.clientId || String(index)}
      renderItem={({ item }) => <MessageRow message={item} mode={mode} language={language} onCopyText={onCopyText} onSpeakText={onSpeakText} onOpenArtifact={onOpenArtifact} onOpenStoredArtifact={onOpenStoredArtifact} resolveImage={resolveImage} onOpenFile={onOpenFile} />}
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
  language = 'en',
  attachments = [],
  canCapturePhoto = false,
  voiceInputSupported = false,
  listening = false,
  onPickImages,
  onTakePhoto,
  onPickFile,
  onRemoveAttachment,
  onToggleListen,
}: {
  value: string;
  streaming?: boolean;
  onChangeText(value: string): void;
  onSend(): void;
  onStop(): void;
  mode?: UiMode;
  language?: UiLanguage;
  /** Staged files (chips with remove); picking stays in the host app. */
  attachments?: Array<{ id: string; name: string }>;
  canCapturePhoto?: boolean;
  voiceInputSupported?: boolean;
  listening?: boolean;
  onPickImages?(): void;
  onTakePhoto?(): void;
  onPickFile?(): void;
  onRemoveAttachment?(id: string): void;
  onToggleListen?(): void;
}) {
  const p = paletteFor(mode);
  const t = uiStrings(language);
  const enabled = value.trim().length > 0 || attachments.length > 0;
  const attachButtons = (
    <>
      {onPickImages ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.attachPhotos} onPress={onPickImages} style={styles.attachBtn}>
          <Text style={{ color: p.text.secondary }}>🖼</Text>
        </Pressable>
      ) : null}
      {onPickFile ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.attachFile} onPress={onPickFile} style={styles.attachBtn}>
          <Text style={{ color: p.text.secondary }}>📄</Text>
        </Pressable>
      ) : null}
      {canCapturePhoto && onTakePhoto ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.takePhoto} onPress={onTakePhoto} style={styles.attachBtn}>
          <Text style={{ color: p.text.secondary }}>📷</Text>
        </Pressable>
      ) : null}
      {voiceInputSupported && onToggleListen ? (
        <Pressable accessibilityRole="button" accessibilityLabel={listening ? t.stopVoiceInput : t.startVoiceInput} accessibilityState={{ expanded: listening }} onPress={onToggleListen} style={styles.attachBtn}>
          <Text style={{ color: listening ? p.danger : p.text.secondary }}>🎤</Text>
        </Pressable>
      ) : null}
    </>
  );
  return (
    <View style={[styles.composerWrap, { backgroundColor: p.bg.page }]}>
      {attachments.length > 0 ? (
        <View style={[styles.attachBar, { backgroundColor: p.bg.page }]}>
          {attachments.map((attachment) => (
            <View key={attachment.id} style={[styles.chip, { borderColor: p.border.default }]}>
              <Text numberOfLines={1} style={[styles.chipText, { color: p.text.secondary }]}>📎 {attachment.name}</Text>
              {onRemoveAttachment ? (
                <Pressable accessibilityRole="button" accessibilityLabel={t.removeAttachment(attachment.name)} onPress={() => onRemoveAttachment(attachment.id)} style={styles.chipX}>
                  <Text style={[styles.chipText, { color: p.text.muted }]}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      <View style={[styles.composer, { borderColor: p.border.default, backgroundColor: p.bg.page }]}>
        {attachButtons}
        <TextInput
          accessibilityLabel={t.messagePlaceholder}
          multiline
          value={value}
          onChangeText={onChangeText}
          placeholder={t.messagePlaceholder}
          placeholderTextColor={p.text.muted}
          style={[styles.input, { color: p.text.primary }]}
          onSubmitEditing={() => enabled && !streaming && onSend()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={streaming ? t.stopGenerating : t.sendMessage}
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
  archivedToggle: { paddingVertical: 8 },
  archivedEmpty: { fontSize: 13, paddingHorizontal: 10, paddingBottom: 8 },
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
  attachBar: { maxWidth: 768, width: '100%', alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  attachBtn: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, gap: 8 },
  chipText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  chipX: { paddingHorizontal: 6, paddingVertical: 2 },
  input: { flex: 1, minHeight: 36, maxHeight: 180, fontSize: 16, paddingVertical: 8 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.25 },
  sendText: { fontSize: 20, fontWeight: '700' },
});
