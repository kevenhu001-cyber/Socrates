import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Attachment } from '@socrates/contracts';
import { useTheme } from '../theme/ThemeProvider';
import { AnimatedPressable } from './AnimatedPressable';

/* Mobile port of the web `.attachment-chip` family:
 *   - a 28px round icon well (`bg-300`) tinted accent (`hsl(212 90% 62%)`)
 *   - images show a 28px round thumbnail instead of a glyph
 *   - name truncates inside a 220px max chip; optional remove button
 * (`attachment-chip-remove`). `pending` swaps the glyph for a spinner and
 * `progress` draws the accent fill bar (`attachment-chip-progress-*`). */
export function attachmentIconName(attachment: Pick<Attachment, 'kind' | 'docKind' | 'mime' | 'name'>): keyof typeof Ionicons.glyphMap {
  const docKind = String(attachment.docKind || '').toLowerCase();
  const name = attachment.name || '';
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  const mime = String(attachment.mime || '').toLowerCase();

  // Office formats — resolved by the server extractor first, then by
  // extension for files whose mime the picker never supplied.
  if (['docx', 'doc'].includes(docKind) || extension === 'doc' || extension === 'docx') return 'reader-outline';
  if (['xlsx', 'xls'].includes(docKind) || extension === 'xls' || extension === 'xlsx') return 'grid-outline';
  if (['pptx', 'ppt'].includes(docKind) || extension === 'ppt' || extension === 'pptx') return 'easel-outline';
  if (docKind === 'pdf' || mime === 'application/pdf' || extension === 'pdf') return 'document-text-outline';
  if (docKind === 'epub' || docKind === 'rtf') return 'document-outline';

  if (attachment.kind === 'image' || mime.startsWith('image/')) return 'image-outline';
  if (mime.startsWith('audio/') || mime.startsWith('video/')
    || ['mp4', 'webm', 'mov', 'mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'].includes(extension)) {
    return 'play-outline';
  }
  if (mime.startsWith('text/')
    || ['txt', 'md', 'markdown', 'rst', 'log', 'json', 'csv', 'tsv'].includes(extension)) {
    return 'document-outline';
  }
  if ([
    'py', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'java', 'kt', 'kts', 'swift',
    'go', 'rs', 'rb', 'php', 'c', 'cc', 'cpp', 'cxx', 'h', 'hpp', 'm', 'mm',
    'cs', 'scala', 'sh', 'bash', 'zsh', 'sql', 'r', 'lua', 'pl', 'dart', 'ex',
    'exs', 'elm', 'clj', 'html', 'htm', 'xml', 'vue', 'svelte', 'yaml', 'yml', 'toml',
  ].includes(extension)) {
    return 'code-slash-outline';
  }
  return 'document-outline';
}

export interface AttachmentChipProps {
  attachment: Attachment;
  /** Remove affordance — composer chips pass the store remover; message
   *  attachments leave it undefined (a sent attachment cannot be edited). */
  onRemove?: (id: string) => void;
  /** Upload progress 0–100; renders the accent fill bar like
   *  `.attachment-chip-progress-bar`. */
  progress?: number;
  pending?: boolean;
  error?: boolean;
}

export function AttachmentChip({ attachment, onRemove, progress, pending, error }: AttachmentChipProps) {
  const { colors, typography } = useTheme();
  const isImage = attachment.kind === 'image' && Boolean(attachment.dataUrl);
  const iconColor = colors.voiceBlue; // web uses a single soft blue across kinds
  const showProgress = typeof progress === 'number' && progress >= 0;

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: error ? colors.danger : pending ? colors.accent : colors.border,
          borderRadius: 18,
        },
      ]}
    >
      {pending ? (
        <View style={[styles.iconWell, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="ellipsis-horizontal" size={12} color={colors.accent} />
        </View>
      ) : isImage ? (
        <Image source={{ uri: attachment.dataUrl }} style={[styles.thumb, { backgroundColor: colors.surfaceHover }]} />
      ) : (
        <View style={[styles.iconWell, { backgroundColor: colors.surfaceHover }]}>
          <Ionicons name={attachmentIconName(attachment)} size={14} color={iconColor} />
        </View>
      )}
      <Text numberOfLines={1} style={[styles.name, { color: colors.textMuted, fontFamily: typography.medium }]}>
        {attachment.name || 'file'}
      </Text>
      {attachment.truncated && !pending ? (
        <Text style={[styles.meta, { color: colors.textSubtle, fontFamily: typography.body }]}>(truncated)</Text>
      ) : null}
      {onRemove ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Remove attachment"
          onPress={() => onRemove(attachment.id)}
          style={styles.remove}
          hitSlop={6}
        >
          <Ionicons name="close" size={12} color={colors.textMuted} />
        </AnimatedPressable>
      ) : null}
      {showProgress ? (
        <View style={[styles.progressBar, { backgroundColor: colors.surfaceHover }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.accent, width: `${Math.min(Math.max(progress ?? 0, 0), 100)}%` },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* frontend `.attachment-chip`: inline-flex, gap 6px, `bg-200` fill,
   * `border-300/0.18`, radius 18, padding 3px 10px 3px 3px, max-width 220. */
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 3,
    paddingRight: 10,
    maxWidth: 220,
    alignSelf: 'flex-start',
    flexWrap: 'wrap',
  },
  iconWell: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  name: {
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
  meta: {
    fontSize: 10,
    flexShrink: 0,
  },
  remove: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBar: {
    flexBasis: '100%',
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
    marginHorizontal: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});
