import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { Composer } from '../components/Composer';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import { filesApi } from '../data/api/client';
import { native } from '../native/native';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function NewChatScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const state = useAppStore();
  const mode = state.activeSession?.mode || 'chat';

  useEffect(() => {
    if (!state.activeSession || state.activeSession.messages?.length) appStore.startNewSession('chat', true);
  }, []);

  const changeMode = (next: 'chat' | 'tutor') => {
    if (next === mode) return;
    appStore.startNewSession(next, true);
  };

  const newChat = () => appStore.startNewSession(mode);

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

  const send = async () => {
    if (!state.draft.trim()) return;
    navigation.navigate('Chat');
    await native.vibrate('light');
    await appStore.sendMessage(state.draft);
  };

  return (
    <Screen keyboard style={styles.screen}>
      <AppHeader showModeSwitch mode={mode} onModeChange={changeMode} onNewChat={newChat} />
      {!state.isOnline ? (
        <View style={[styles.offline, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}> 
          <Text style={[styles.offlineText, { color: colors.textMuted, fontFamily: typography.medium }]}>{t('chat.offlineBanner')}</Text>
        </View>
      ) : null}
      <View style={styles.blank} />
      {state.error ? <Text style={[styles.error, { color: colors.danger, fontFamily: typography.body }]}>{state.error}</Text> : null}
      <View style={styles.composerArea}>
        {state.pendingAttachments.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachments} keyboardShouldPersistTaps="handled">
            {state.pendingAttachments.map((attachment) => (
              <AnimatedPressable
                key={attachment.id}
                onPress={() => appStore.removeAttachment(attachment.id)}
                style={[styles.attachmentChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, borderRadius: radius.sm }]}
              >
                <Ionicons name="document-outline" size={16} color={colors.accent} />
                <Text numberOfLines={1} style={[styles.attachmentName, { color: colors.textMuted, fontFamily: typography.medium }]}>{attachment.name}</Text>
                <Ionicons name="close" size={16} color={colors.textSubtle} />
              </AnimatedPressable>
            ))}
          </ScrollView>
        ) : null}
        <Composer
          value={state.draft}
          disabled={state.isStreaming}
          onChangeText={(value) => appStore.setDraft(value)}
          onSend={send}
          onStop={() => appStore.stopGenerating()}
          onAttach={onAttach}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  blank: { flex: 1 },
  offline: { position: 'absolute', top: 106, left: 16, right: 16, zIndex: 2, minHeight: 38, paddingHorizontal: 14, borderWidth: 1, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  offlineText: { fontSize: 12 },
  error: { paddingHorizontal: 18, paddingBottom: 8, fontSize: 12, lineHeight: 18 },
  composerArea: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  attachments: { gap: 8, paddingHorizontal: 6, paddingBottom: 8 },
  attachmentChip: { maxWidth: 250, minHeight: 38, borderWidth: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  attachmentName: { flexShrink: 1, fontSize: 12 },
});
