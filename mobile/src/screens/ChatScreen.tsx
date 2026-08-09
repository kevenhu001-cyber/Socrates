import React, { useEffect, useRef } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Message } from '@socrates/contracts';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { useAppDrawer } from '../components/AppDrawer';
import { MessageBubble } from '../components/MessageBubble';
import { Composer } from '../components/Composer';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import { native } from '../native/native';
import { filesApi, sharesApi } from '../data/api/client';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export function ChatScreen({ navigation }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  const state = useAppStore();
  const listRef = useRef<FlatList<Message>>(null);
  const { openDrawer } = useAppDrawer();
  const messages = state.activeSession?.messages || [];
  useEffect(() => { listRef.current?.scrollToEnd({ animated: true }); }, [messages.length, messages.at(-1)?.rawText]);
  const onSend = async () => { await native.vibrate('light'); await appStore.sendMessage(state.draft); };
  const onAttach = async () => {
    const result = await native.pickFile();
    if (result.canceled || !result.assets[0]) return;
    try {
      const asset = result.assets[0];
      const uploaded = await filesApi.upload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size }, state.activeSession?.id);
      appStore.addAttachment({ id: uploaded.id, fileId: uploaded.id, kind: uploaded.kind, name: uploaded.name, mime: uploaded.mimeType, size: uploaded.size });
      await native.vibrate('success');
    } catch (error) {
      appStore.setError(error instanceof Error ? error.message : t('chat.uploadFailed'));
      await native.vibrate('error');
    }
  };
  const onShare = async () => {
    const session = state.activeSession;
    if (!session) return;
    try {
      const share = await sharesApi.create(session.id);
      navigation.navigate('Share', { url: sharesApi.absoluteUrl(share.url), title: session.title || t('chat.newConversation') });
    } catch (error) {
      appStore.setError(error instanceof Error ? error.message : t('share.failed'));
    }
  };
  return (
    <Screen keyboard style={styles.screen}>
      <AppHeader conversationActive onShare={() => { void onShare(); }} onMore={openDrawer} />
      {!state.isOnline ? (
        <View style={[styles.offline, { backgroundColor: colors.accentSoft, borderBottomColor: colors.border }]}>
          <View style={[styles.offlineDot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.offlineText, { color: colors.textMuted }]}>{t('chat.offlineBanner')}</Text>
        </View>
      ) : null}
      <FlatList ref={listRef} data={messages} keyExtractor={(item, index) => item.clientId || item.id || String(index)} renderItem={({ item }) => <MessageBubble message={item} />} contentContainerStyle={[styles.messages, { paddingHorizontal: spacing.sm }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" ListEmptyComponent={<View style={styles.empty} />} />
      {state.error ? <Text style={[styles.error, { color: colors.danger, fontFamily: typography.body }]}>{state.error}</Text> : null}
      <View style={[styles.composerWrap, { backgroundColor: colors.background }]}> 
        {state.pendingAttachments.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachments} keyboardShouldPersistTaps="handled">
            {state.pendingAttachments.map((attachment) => (
              <AnimatedPressable
                key={attachment.id}
                accessibilityLabel={`${t('chat.attach.remove.aria')}: ${attachment.name}`}
                onPress={() => appStore.removeAttachment(attachment.id)}
                style={[styles.attachmentChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.sm }]}
              >
                <Ionicons name="document-outline" size={16} color={colors.accent} />
                <Text numberOfLines={1} style={[styles.attachmentName, { color: colors.textMuted, fontFamily: typography.medium }]}>{attachment.name}</Text>
                <Ionicons name="close" size={16} color={colors.textSubtle} />
              </AnimatedPressable>
            ))}
          </ScrollView>
        ) : null}
        <Composer value={state.draft} disabled={state.isStreaming} onChangeText={(value) => appStore.setDraft(value)} onSend={onSend} onStop={() => appStore.stopGenerating()} onAttach={onAttach} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ screen: { paddingTop: 0 }, offline: { minHeight: 34, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, offlineDot: { width: 6, height: 6, borderRadius: 3 }, offlineText: { fontSize: 12, fontWeight: '600' }, messages: { flexGrow: 1, paddingTop: 18, paddingBottom: 12 }, empty: { flex: 1 }, error: { fontSize: 12, lineHeight: 18, paddingHorizontal: 16, paddingVertical: 8 }, composerWrap: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }, attachments: { gap: 8, paddingBottom: 8 }, attachmentChip: { maxWidth: 250, minHeight: 38, borderWidth: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }, attachmentName: { flexShrink: 1, fontSize: 12 }, });
