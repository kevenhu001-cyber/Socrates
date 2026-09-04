import React, { useCallback, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from './AnimatedPressable';
import { Markdown } from '../render/MarkdownView';
import { setClipboardText } from '../native/clipboard';
import { toast } from './Toast';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';

type CanvasMode = 'view-original' | 'view-edited' | 'edit';

export function CanvasBlock({
  originalText,
  initialEditedText,
  label,
  onIterate,
}: {
  originalText: string;
  initialEditedText?: string | null;
  label?: string;
  onIterate?: (text: string) => void;
}) {
  const { colors, typography } = useTheme();
  const t = useT();
  const [mode, setMode] = useState<CanvasMode>('view-edited');
  const [editedText, setEditedText] = useState(initialEditedText || originalText);
  const [hasEdited, setHasEdited] = useState(Boolean(initialEditedText));
  const [fullscreen, setFullscreen] = useState(false);

  const toggleEdit = useCallback(() => {
    if (mode === 'edit') {
      setHasEdited(editedText !== originalText);
      setMode('view-edited');
    } else {
      setMode('edit');
    }
  }, [editedText, mode, originalText]);

  const content = mode === 'view-original' ? originalText : editedText;
  const body = (
    <View style={[styles.block, { backgroundColor: colors.toolCardBgHover, borderColor: colors.toolCardBorder }]}>
      <View style={[styles.header, { backgroundColor: colors.toolCardBgSunken, borderBottomColor: colors.toolCardBorder }]}>
        <View style={[styles.chip, { backgroundColor: colors.toolCardBg, borderColor: colors.toolCardBorder }]}>
          <Ionicons name="create-outline" size={14} color={colors.accent} />
          <Text numberOfLines={1} style={[styles.chipText, { color: colors.textSecondary, fontFamily: typography.medium }]}>{label || t('composer.write')}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
          <CanvasButton active={mode === 'view-original'} label={mode === 'view-original' ? t('composer.canvas.editedView') : t('composer.canvas.original')} onPress={() => setMode((current) => current === 'view-original' ? 'view-edited' : 'view-original')} />
          <CanvasButton active={mode === 'edit'} label={mode === 'edit' ? t('composer.canvas.done') : t('composer.canvas.edit')} onPress={toggleEdit} />
          <CanvasButton label={t('composer.canvas.copy')} onPress={() => { void setClipboardText(content); toast.show(t('common.copied'), 'success'); }} />
          <CanvasButton label={t('composer.canvas.iterate')} onPress={() => onIterate?.(editedText)} />
          <CanvasButton label={t('composer.canvas.fullscreen')} onPress={() => setFullscreen(true)} />
        </ScrollView>
      </View>
      {mode === 'edit' ? (
        <TextInput
          value={editedText}
          onChangeText={setEditedText}
          multiline
          autoFocus
          textAlignVertical="top"
          accessibilityLabel={t('composer.canvas.edit')}
          style={[styles.editor, { color: colors.text, borderColor: withAlpha(colors.accent, 0.45), fontFamily: typography.body }]}
        />
      ) : mode === 'view-original' ? (
        <ScrollView style={styles.originalScroll} nestedScrollEnabled>
          <Text selectable style={[styles.original, { color: colors.textMuted, backgroundColor: colors.toolCardBgSunken, fontFamily: typography.mono }]}>{originalText}</Text>
        </ScrollView>
      ) : (
        <View style={styles.markdown}><Markdown text={editedText} /></View>
      )}
      {hasEdited ? <Text style={[styles.editedBadge, { color: colors.text, backgroundColor: colors.accentSoft, borderColor: withAlpha(colors.accent, 0.25) }]}>{t('composer.canvas.edited')}</Text> : null}
    </View>
  );

  return (
    <>
      {fullscreen ? null : body}
      <Modal visible={fullscreen} transparent animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={[styles.fullscreenScrim, { backgroundColor: colors.scrim }]}>
          <View style={styles.fullscreenBody}>
            {body}
            <AnimatedPressable accessibilityLabel={t('common.close')} onPress={() => setFullscreen(false)} style={[styles.fullscreenClose, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <Ionicons name="contract-outline" size={18} color={colors.text} />
            </AnimatedPressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function CanvasButton({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable accessibilityLabel={label} onPress={onPress} style={[styles.button, { borderColor: active ? withAlpha(colors.accent, 0.45) : colors.toolCardBorderStrong, backgroundColor: active ? colors.toolCardBgHover : 'transparent' }]}>
      <Text style={[styles.buttonText, { color: active ? colors.text : colors.textMuted }]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  block: { width: '100%', marginTop: 8, marginBottom: 12, borderWidth: 1, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } },
  header: { minHeight: 54, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, gap: 8 },
  chip: { alignSelf: 'flex-start', maxWidth: 160, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 12.5 }, actions: { gap: 6 },
  button: { height: 28, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, justifyContent: 'center' }, buttonText: { fontSize: 12.5 },
  markdown: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 14 },
  editor: { minHeight: 160, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, lineHeight: 23, borderWidth: 2 },
  originalScroll: { maxHeight: 480 }, original: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 12.5, lineHeight: 19 },
  editedBadge: { alignSelf: 'flex-start', marginLeft: 14, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, borderWidth: 1, fontSize: 11.5 },
  fullscreenScrim: { flex: 1, padding: 24, justifyContent: 'center' }, fullscreenBody: { flex: 1, justifyContent: 'center' },
  fullscreenClose: { position: 'absolute', top: 8, right: 8, width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
