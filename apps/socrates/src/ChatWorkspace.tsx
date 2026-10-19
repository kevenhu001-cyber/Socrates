import React, { memo, type ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Session } from '@socrates/contracts';
import type { ThemePaletteHex, ThemeMode } from '@socrates/theme';
import { ChatMessageList, Composer, DiagView, ExamView, type UiLanguage } from '@socrates/ui';
import { useChatStore } from '@socrates/chat';
import type { AppStrings } from './strings';
import { styles } from './appStyles';

type DiagnosticProps = Omit<ComponentProps<typeof DiagView>, 'mode' | 'language'>;
type ExamProps = Omit<ComponentProps<typeof ExamView>, 'mode' | 'language'>;
type MessageListProps = Omit<ComponentProps<typeof ChatMessageList>, 'style' | 'compact' | 'messages' | 'mode' | 'language' | 'findQuery' | 'activeFindIndex'>;
type ComposerProps = Omit<ComponentProps<typeof Composer>, 'compact' | 'mode' | 'language' | 'value' | 'onChangeText'> & Partial<Pick<ComponentProps<typeof Composer>, 'value' | 'onChangeText'>>;

function ConnectedComposer({ composer, compact, mode, language }: { composer: ComposerProps; compact: boolean; mode: ThemeMode; language: UiLanguage }) {
  const value = useChatStore((state) => state.draft);
  const onChangeText = useChatStore((state) => state.setDraft);
  return <Composer {...composer} value={composer.value ?? value} onChangeText={composer.onChangeText ?? onChangeText} compact={compact} mode={mode} language={language} />;
}

interface ChatWorkspaceProps {
  compact: boolean;
  mode: ThemeMode;
  language: UiLanguage;
  palette: ThemePaletteHex;
  appCopy: AppStrings;
  active: Session | null;
  chatError: string | null;
  offlineNotice: boolean;
  findQuery: string;
  activeFindIndex: number;
  onRetryTurn(): void;
  diagnostic: DiagnosticProps | null;
  exam: ExamProps | null;
  messageList: MessageListProps;
  editingId: string | null;
  onCancelEdit(): void;
  composer: ComposerProps;
}

/** Transcript, exam cards, edit state and composer for the chat route. */
function ChatWorkspaceComponent({
  compact,
  mode,
  language,
  palette,
  appCopy,
  active,
  chatError,
  offlineNotice,
  findQuery,
  activeFindIndex,
  onRetryTurn,
  diagnostic,
  exam,
  messageList,
  editingId,
  onCancelEdit,
  composer,
}: ChatWorkspaceProps) {
  return (
    <>
      {chatError ? <View style={styles.errorRow}>
        <Text accessibilityRole="alert" style={[styles.errorText, { color: palette.danger }]}>{chatError}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={appCopy.retry} onPress={onRetryTurn} style={[styles.retryChip, { borderColor: palette.border.default }]}>
          <Text style={{ color: palette.text.primary }}>↻ {appCopy.retry}</Text>
        </Pressable>
      </View> : null}
      {offlineNotice ? <Text style={[styles.noticeText, { color: palette.text.muted }]}>{appCopy.savedOffline}</Text> : null}
      {diagnostic && active ? (
        <DiagView key={active.id} {...diagnostic} mode={mode} language={language} />
      ) : exam && active ? (
        <ExamView key={active.id} {...exam} mode={mode} language={language} />
      ) : (
        <>
          <ChatMessageList
            {...messageList}
            key={active?.id || 'new-chat'}
            onPromptSelect={useChatStore.getState().setDraft}
            style={styles.list}
            compact={compact}
            messages={active?.messages || []}
            mode={mode}
            language={language}
            findQuery={findQuery}
            activeFindIndex={activeFindIndex}
          />
          {editingId ? <View style={[styles.editBanner, { borderColor: palette.border.default }]}>
            <Text style={[styles.editBannerText, { color: palette.text.secondary }]}>{appCopy.editingMessage}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={appCopy.cancelEdit} onPress={onCancelEdit} style={styles.editCancel}>
              <Text style={{ color: palette.text.primary }}>{appCopy.cancel}</Text>
            </Pressable>
          </View> : null}
          <ConnectedComposer composer={composer} compact={compact} mode={mode} language={language} />
        </>
      )}
    </>
  );
}

export const ChatWorkspace = memo(ChatWorkspaceComponent);
