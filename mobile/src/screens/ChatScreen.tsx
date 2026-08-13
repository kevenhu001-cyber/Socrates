import React, { useCallback, useRef } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
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
import { sharesApi } from '../data/api/client';
import { pickChatAttachment, type ChatAttachmentSource } from '../data/chat/attachments';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;
const EMPTY_MESSAGES: Message[] = [];
const BOTTOM_TOLERANCE = 96;

export function ChatScreen({ navigation }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  const state = useAppStore();
  const listRef = useRef<FlatList<Message>>(null);
  const stickToBottom = useRef(true);
  const pendingScroll = useRef(false);
  const { openDrawer } = useAppDrawer();
  const messages = state.activeSession?.messages || EMPTY_MESSAGES;
  const scrollToLatest = useCallback((animated = false) => {
    if (!stickToBottom.current || pendingScroll.current) return;
    pendingScroll.current = true;
    // Wait for FlatList layout; non-animated scrolling avoids queuing a native
    // animation for every streaming markdown reflow.
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated });
      pendingScroll.current = false;
    }, 0);
  }, []);
  const onContentSizeChange = useCallback(() => scrollToLatest(false), [scrollToLatest]);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    stickToBottom.current = contentSize.height - layoutMeasurement.height - contentOffset.y <= BOTTOM_TOLERANCE;
  }, []);
  const onSend = useCallback(async () => {
    stickToBottom.current = true;
    await native.vibrate('light');
    await appStore.sendMessage(state.draft);
  }, [state.draft]);
  const attach = useCallback(async (source: ChatAttachmentSource) => {
    try {
      const attachment = await pickChatAttachment(source, state.activeSession?.id);
      if (!attachment) return;
      appStore.addAttachment(attachment);
      await native.vibrate('success');
    } catch (error) {
      appStore.setError(error instanceof Error ? error.message : t('chat.uploadFailed'));
      await native.vibrate('error');
    }
  }, [state.activeSession?.id, t]);
  const onAttach = useCallback(() => Alert.alert(t('chat.attach'), t('chat.attachOptions'), [
    { text: t('chat.attachFile'), onPress: () => { void attach('file'); } },
    { text: t('chat.attachImage'), onPress: () => { void attach('image'); } },
    { text: t('chat.capturePhoto'), onPress: () => { void attach('camera'); } },
    { text: t('common.cancel'), style: 'cancel' },
  ]), [attach, t]);
  const onShare = useCallback(async () => {
    const session = state.activeSession;
    if (!session) return;
    try {
      const share = await sharesApi.create(session.id);
      navigation.navigate('Share', { url: sharesApi.absoluteUrl(share.url), title: session.title || t('chat.newConversation') });
    } catch (error) {
      appStore.setError(error instanceof Error ? error.message : t('share.failed'));
    }
  }, [navigation, state.activeSession, t]);
  const renderMessage = useCallback(({ item }: { item: Message }) => <MessageBubble message={item} />, []);
  const keyForMessage = useCallback((item: Message, index: number) => item.clientId || item.id || String(index), []);
  return (
    <Screen keyboard style={styles.screen}>
      <AppHeader conversationActive onShare={() => { void onShare(); }} onMore={openDrawer} />
      {!state.isOnline ? (
        <View style={[styles.offline, { backgroundColor: colors.accentSoft, borderBottomColor: colors.border }]}>
          <View style={[styles.offlineDot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.offlineText, { color: colors.textMuted }]}>{t('chat.offlineBanner')}</Text>
        </View>
      ) : null}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={keyForMessage}
        renderItem={renderMessage}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        scrollEventThrottle={32}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={9}
        contentContainerStyle={[styles.messages, { paddingHorizontal: spacing.sm }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<View style={styles.empty} />}
      />
      {state.error ? (
        <View style={styles.errorRow}>
          <Text style={[styles.error, { color: colors.danger, fontFamily: typography.body }]}>{state.error}</Text>
          {!state.isStreaming ? <AnimatedPressable onPress={() => { void appStore.retryLastResponse(); }} style={[styles.retry, { borderColor: colors.border, borderRadius: radius.sm }]}><Text style={[styles.retryText, { color: colors.text, fontFamily: typography.medium }]}>{t('chat.retry')}</Text></AnimatedPressable> : null}
        </View>
      ) : null}
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
        <Composer value={state.draft} hasAttachments={state.pendingAttachments.length > 0} disabled={state.isStreaming} onChangeText={(value) => appStore.setDraft(value)} onSend={onSend} onStop={() => appStore.stopGenerating()} onAttach={onAttach} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ screen: { paddingTop: 0 }, offline: { minHeight: 34, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, offlineDot: { width: 6, height: 6, borderRadius: 3 }, offlineText: { fontSize: 12, fontWeight: '600' }, messages: { flexGrow: 1, paddingTop: 18, paddingBottom: 12 }, empty: { flex: 1 }, errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }, error: { flex: 1, fontSize: 12, lineHeight: 18, paddingVertical: 8 }, retry: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1 }, retryText: { fontSize: 12 }, composerWrap: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }, attachments: { gap: 8, paddingBottom: 8 }, attachmentChip: { maxWidth: 250, minHeight: 38, borderWidth: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }, attachmentName: { flexShrink: 1, fontSize: 12 }, });
