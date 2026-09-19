import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Attachment } from '@socrates/contracts';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useI18n, useT } from '../i18n';
import { toast } from './Toast';
import { AnimatedPressable } from './AnimatedPressable';
import { AttachmentChip } from './AttachmentChip';
import { ReasoningEffortPicker, type EffortPickerAnchor } from './ReasoningEffortPicker';
import { useResponsive } from '../theme/responsive';
import { useVoiceInput, type VoiceInputErrorCode, type VoiceInputStatus } from '../native/voiceInput';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface ComposerProps {
  value: string;
  disabled?: boolean;
  hasAttachments?: boolean;
  /** Pending attachments — rendered as the web `.attachment-chips` strip
   *  (typed icon + truncated name + remove) above the editor rows. */
  attachments?: Attachment[];
  onRemoveAttachment?: (attachmentId: string) => void;
  reasoningEffort?: ReasoningEffort;
  webSearchEnabled?: boolean;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onAttach: (anchor?: { x: number; y: number; width: number; height: number }) => void;
  onChangeReasoningEffort?: (effort: ReasoningEffort) => void;
  onToggleWebSearch?: () => void;
  activeExtensionLabel?: string | null;
  selectedPlugins?: Array<{ id: string; name: string }>;
  onRemoveActiveExtension?: () => void;
  onRemovePlugin?: (pluginId: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/* Compact native version of frontend `.voice-recording-wave`. The Android
 * recognizer emits volumechange events, so the bars respond to the actual
 * microphone level instead of being a decorative static icon. */
export function VoiceWaveBars({ color, level = 0.16 }: { color: string; level?: number }) {
  const bars = [0.45, 0.72, 1, 0.78, 0.5, 0.82, 0.58];
  return (
    <View style={waveStyles.container} pointerEvents="none">
      {bars.map((scale, i) => (
        <View
          key={i}
          style={[waveStyles.bar, { height: Math.round(4 + Math.min(1, level) * scale * 18), backgroundColor: color }]}
        />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.4,
    height: 18,
    width: 20,
  },
  bar: {
    width: 2.2,
    borderRadius: 1.1,
  },
});

export function ThinkDeeperGlyph({ size = 19, color }: { size?: number; color: string }) {
  return (
    <View
      style={{
        width: size,
        height: size * 0.72,
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
      pointerEvents="none"
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', width: size }}>
        {/* Left foot */}
        <View style={{ width: 3, height: 1.8, backgroundColor: color, borderRadius: 0.5 }} />
        {/* Center dome arch */}
        <View
          style={{
            flex: 1,
            height: size * 0.62,
            borderTopLeftRadius: (size - 6) / 2,
            borderTopRightRadius: (size - 6) / 2,
            borderWidth: 1.8,
            borderBottomWidth: 0,
            borderColor: color,
          }}
        />
        {/* Right foot */}
        <View style={{ width: 3, height: 1.8, backgroundColor: color, borderRadius: 0.5 }} />
      </View>
    </View>
  );
}

function formatVoiceDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function VoiceRecordingBar({
  status,
  transcript,
  elapsedSeconds,
  volume,
  onStop,
}: {
  status: Exclude<VoiceInputStatus, 'idle'>;
  transcript: string;
  elapsedSeconds: number;
  volume: number;
  onStop: () => void;
}) {
  const { colors, typography } = useTheme();
  const t = useT();
  const label = status === 'stopping'
    ? t('chat.voiceProcessing')
    : status === 'starting'
      ? t('chat.voiceStarting')
      : t('chat.voiceListening');

  /* web `.voice-recording-*` paints the whole bar in the neutral text ramp,
   * not the accent blue — voiceBlue stays reserved for AttachmentChip. */
  const voiceColor = colors.text;

  return (
    <View style={styles.voiceBar} testID="voice-recording-bar" accessibilityLiveRegion="polite">
      <View style={[styles.voiceIndicator, { backgroundColor: voiceColor }]} />
      <View style={styles.voiceCopy}>
        <View style={styles.voiceLabelRow}>
          <Text style={[styles.voiceLabel, { color: colors.text, fontFamily: typography.semibold }]}>{label}</Text>
          <Text style={[styles.voiceTimer, { color: colors.textMuted, fontFamily: typography.mono }]}>{formatVoiceDuration(elapsedSeconds)}</Text>
        </View>
        <Text numberOfLines={1} style={[styles.voiceTranscript, { color: colors.textMuted, fontFamily: typography.body }]}>
          {transcript || t('chat.voiceSpeak')}
        </Text>
      </View>
      <VoiceWaveBars color={voiceColor} level={volume} />
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.voiceStop')}
        disabled={status === 'stopping'}
        onPress={status === 'stopping' ? undefined : onStop}
        style={[styles.voiceStop, { backgroundColor: withAlpha(voiceColor, 0.14), borderColor: withAlpha(voiceColor, 0.35) }]}
      >
        <Ionicons name="stop" size={14} color={voiceColor} />
      </AnimatedPressable>
    </View>
  );
}

export function Composer({
  value,
  disabled = false,
  hasAttachments = false,
  attachments = [],
  onRemoveAttachment,
  reasoningEffort = 'medium',
  onChangeText,
  onSend,
  onStop,
  onAttach,
  onChangeReasoningEffort,
  activeExtensionLabel = null,
  selectedPlugins = [],
  onRemoveActiveExtension,
  onRemovePlugin,
  placeholder,
  autoFocus = false,
}: ComposerProps) {
  const { colors, typography, contentWidth, mode } = useTheme();
  const { isCompact } = useResponsive();
  const t = useT();
  const { language } = useI18n();
  const ref = useRef<TextInput>(null);
  const attachAnchorRef = useRef<View>(null);
  const effortAnchorRef = useRef<View>(null);
  const [focused, setFocused] = useState(false);
  const [editorHeight, setEditorHeight] = useState(50);
  const [effortPickerOpen, setEffortPickerOpen] = useState(false);
  const [effortAnchor, setEffortAnchor] = useState<EffortPickerAnchor | null>(null);
  const canSend = (value.trim().length > 0 || hasAttachments) && !disabled;

  const handleVoiceError = (code: VoiceInputErrorCode) => {
    const message = code === 'not-allowed'
      ? t('chat.voicePermission')
      : code === 'no-speech'
        ? t('chat.voiceNoSpeech')
        : code === 'unsupported' || code === 'service-not-allowed' || code === 'language-not-supported'
          ? t('chat.voiceUnsupported')
          : t('chat.voiceError');
    toast.show(message, code === 'no-speech' ? 'info' : 'error');
  };

  const voice = useVoiceInput({
    language,
    existingText: value,
    onChangeText,
    onError: handleVoiceError,
  });

  // The current SPA phone composer is always a two-row 104px card:
  // editor on top, controls on the bottom. Desktop keeps the compact resting
  // pill and expands only when the draft/focus requires it.
  const hasContextChips = Boolean(activeExtensionLabel) || selectedPlugins.length > 0;
  const isExpanded = isCompact || focused || value.includes('\n') || value.length > 30 || hasContextChips;

  const openAttachMenu = () => {
    const node = attachAnchorRef.current;
    if (!node) {
      onAttach();
      return;
    }
    node.measureInWindow((x, y, width, height) => onAttach({ x, y, width, height }));
  };

  const openEffortPicker = () => {
    if (!onChangeReasoningEffort) return;
    const node = effortAnchorRef.current;
    if (!node) {
      setEffortAnchor(null);
      setEffortPickerOpen(true);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setEffortAnchor({ x, y, width, height });
      setEffortPickerOpen(true);
    });
  };

  const inputPlaceholder = t('chat.inputPlaceholder');
  const chatPlaceholder = t('chat.placeholder');
  const defaultPlaceholder = inputPlaceholder !== 'chat.inputPlaceholder'
    ? inputPlaceholder
    : chatPlaceholder !== 'chat.placeholder'
      ? chatPlaceholder
      : 'Ask Socrates';
  /* P1-2 alignment: iconColor now sourced from the canonical text
   * token (was `#e0e0e0` for dark, a legacy pre-align value). */
  const iconColor = colors.text;

  /* frontend `.send-btn` is neutral until there is text to send —
   *   `background: hsl(var(--bg-300)); color: hsl(var(--text-400));`
   * — then flips to `.send-btn.active` (accent fill, `--oncolor-100`
   * glyph). mobile previously painted it accent at all times. */
  const sendIdleBg = colors.surfaceHover;
  const sendIdleFg = colors.textMuted;
  const voiceRecording = voice.status !== 'idle';
  /* frontend `.chat-input-wrap` card fill. `conversationSurface` is the
   * canonical token (added by the P0 tokens agent); fall back to the
   * literal web values until it lands. */
  const composerSurface =
    (colors as { conversationSurface?: string }).conversationSurface
    ?? (mode === 'dark' ? '#212121' : '#f2f2f2');

  return (
    <>
    <View
      style={[
        voiceRecording ? styles.containerVoice : isExpanded ? styles.containerExpanded : styles.containerCapsule,
        {
          /* `--surface-input` / the conversation composer card — web resolves
           * it to #212121 dark / #f2f2f2 light via `conversationSurface`. */
          backgroundColor: composerSurface,
          /* frontend: `border-color: hsl(var(--border-300)/0.24)` at rest.
           * chat-surface.css (final authority) focuses with a neutral ring —
           * dark `rgb(255 255 255 / 23%)`, light `rgb(0 0 0 / 20%)` — not the
           * accent. */
          borderColor: voiceRecording
            ? withAlpha(colors.text, 0.55)
            : focused
            ? withAlpha(mode === 'dark' ? colors.white : colors.black, mode === 'dark' ? 0.23 : 0.2)
            : withAlpha(colors.border, 0.24),
          /* frontend `.chat-input-wrap` / `.topic-input-wrap` both use a
           * 28px pill radius. The previous 16 was a pre-align value. */
          borderRadius: 28,
          /* P3: live `contentWidth` from displayPrefs replaces the
           * hard-coded 620px so the chat column widens/narrows with
           * the user's display preference. */
          maxWidth: contentWidth,
        },
        /* chat-surface.css swaps the resting drop shadow for a 1px halo on
         * focus (`0 0 0 1px` white/8% dark, black/7% light). `boxShadow`
         * takes precedence over the legacy `shadow*` props while focused. */
        focused && !voiceRecording
          ? {
              boxShadow: `0 0 0 1px ${withAlpha(
                mode === 'dark' ? colors.white : colors.black,
                mode === 'dark' ? 0.08 : 0.07,
              )}`,
              /* Android draws the resting shadow via `elevation`, which
               * `boxShadow` does not replace — zero it out while the
               * focus ring owns the outline. */
              elevation: 0,
            }
          : null,
      ]}
    >
      {/* `.attachment-chips` — web renders the pending-file strip as
       * grid-row:1 *inside* `.chat-input-wrap`, so the card owns it. */}
      {attachments.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.attachmentChips}
          keyboardShouldPersistTaps="handled"
        >
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.id}
              attachment={attachment}
              onRemove={onRemoveAttachment}
            />
          ))}
        </ScrollView>
      ) : null}
      {voiceRecording ? (
        <VoiceRecordingBar
          status={voice.status === 'idle' ? 'starting' : voice.status}
          transcript={voice.liveTranscript}
          elapsedSeconds={voice.elapsedSeconds}
          volume={voice.volume}
          onStop={voice.stop}
        />
      ) : !isExpanded ? (
        /* Single-row resting capsule — frontend layout is
         * attach + text + send. Voice input is implemented by the native
         * SpeechRecognizer and swaps this row for the live recording bar. */
        <View style={styles.singleRow}>
          {/* Plus button */}
          <View ref={attachAnchorRef} collapsable={false}>
            <AnimatedPressable
              onPress={openAttachMenu}
              accessibilityRole="button"
              accessibilityLabel={t('chat.attach') || 'Add tools and files'}
              style={styles.circleBtn}
            >
              <Ionicons name="add" size={20} color={iconColor} />
            </AnimatedPressable>
          </View>

          {/* Text Input */}
          <TextInput
            ref={ref}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder || defaultPlaceholder}
            placeholderTextColor={colors.textMuted}
            style={[
              styles.singleInput,
              {
                color: colors.text,
                fontFamily: typography.body,
              },
            ]}
            autoFocus={autoFocus}
            returnKeyType="default"
          />

          {/* Send / Stop — idle mirrors `.send-btn` neutral
           * (`bg-300` fill, `text-400` glyph), active flips to accent. */}
          <View style={styles.singleRightActions}>
            <AnimatedPressable
              accessibilityLabel={t('chat.voiceInput') || 'Voice input'}
              accessibilityState={{ selected: voiceRecording }}
              onPress={voice.start}
              style={[styles.micBtn, voiceRecording ? { backgroundColor: colors.accentSoft } : null]}
            >
              <Ionicons name="mic-outline" size={20} color={iconColor} />
            </AnimatedPressable>
            {/* frontend `.send-btn.chat-stop`: neutral fill + dark glyph. */}
            {disabled ? (
              <AnimatedPressable
                accessibilityLabel={t('chat.stopGenerating') || 'Stop generating'}
                onPress={onStop}
                scale={0.92}
                style={[styles.actionBtn, { backgroundColor: sendIdleBg }]}
              >
                <Ionicons name="stop" size={14} color={sendIdleFg} />
              </AnimatedPressable>
            ) : (
              <AnimatedPressable
                accessibilityLabel={t('chat.send') || 'Send message'}
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                onPress={canSend ? onSend : undefined}
                scale={0.92}
                restingScale={canSend ? 1.05 : 1}
                style={[
                  styles.actionBtn,
                  { backgroundColor: canSend ? colors.accent : sendIdleBg },
                  canSend ? [styles.sendGlow, { shadowColor: colors.accent }] : null,
                ]}
              >
                <Ionicons name="arrow-up" size={16} color={canSend ? colors.textInverse : sendIdleFg} />
              </AnimatedPressable>
            )}
          </View>
        </View>
      ) : (
        /* Multi-row expanded layout 1:1 matching cur-mobile-focused.png */
        <View style={styles.expandedContent}>
          {/* Top text area */}
          <TextInput
            ref={ref}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            multiline
            maxLength={32000}
            placeholder={placeholder || defaultPlaceholder}
            placeholderTextColor={colors.textMuted}
            style={[
              styles.expandedInput,
              isCompact ? { height: editorHeight } : null,
              {
                color: colors.text,
                fontFamily: typography.body,
              },
            ]}
            autoFocus={autoFocus}
            onContentSizeChange={(event) => {
              if (!isCompact) return;
              const next = Math.max(50, Math.min(180, Math.ceil(event.nativeEvent.contentSize.height)));
              setEditorHeight((current) => current === next ? current : next);
            }}
            returnKeyType="default"
            blurOnSubmit={false}
          />

          {/* Current SPA mobile control rail:
           * +  [workflow/plugin chips]  effort  mic  send */}
          <View style={styles.expandedFooter}>
            <View ref={attachAnchorRef} collapsable={false}>
              <AnimatedPressable
                onPress={openAttachMenu}
                accessibilityRole="button"
                accessibilityLabel={t('chat.attach') || 'Add tools and files'}
                style={[styles.circleBtn, { backgroundColor: colors.surfaceHover }]}
              >
                <Ionicons name="add" size={21} color={iconColor} />
              </AnimatedPressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.contextChips}
              style={styles.contextChipScroller}
              keyboardShouldPersistTaps="handled"
            >
              {activeExtensionLabel ? (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel={activeExtensionLabel}
                  onPress={onRemoveActiveExtension}
                  style={[styles.contextChip, { backgroundColor: colors.accentSoft }]}
                >
                  <Text numberOfLines={1} style={[styles.contextChipText, { color: colors.accent, fontFamily: typography.medium }]}>
                    {activeExtensionLabel}
                  </Text>
                  {onRemoveActiveExtension ? <Ionicons name="close" size={14} color={colors.accent} /> : null}
                </AnimatedPressable>
              ) : null}
              {selectedPlugins.map((plugin) => (
                <AnimatedPressable
                  key={plugin.id}
                  accessibilityRole="button"
                  accessibilityLabel={plugin.name}
                  onPress={onRemovePlugin ? () => onRemovePlugin(plugin.id) : undefined}
                  style={[styles.contextChip, { backgroundColor: colors.accentSoft }]}
                >
                  <Text numberOfLines={1} style={[styles.contextChipText, { color: colors.accent, fontFamily: typography.medium }]}>
                    {plugin.name}
                  </Text>
                  {onRemovePlugin ? <Ionicons name="close" size={14} color={colors.accent} /> : null}
                </AnimatedPressable>
              ))}
            </ScrollView>

            <View style={styles.expandedRightRow}>
              <View ref={effortAnchorRef} collapsable={false}>
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel={t('effort.label') || 'Reasoning effort'}
                  onPress={openEffortPicker}
                  style={[styles.effortPill, { backgroundColor: colors.surfaceHover }]}
                >
                  <Text style={[styles.effortLabel, { color: colors.text, fontFamily: typography.medium }]}>
                    {reasoningEffort === 'high'
                      ? (t('effort.high') || 'High')
                      : reasoningEffort === 'low'
                        ? (t('effort.low') || 'Low')
                        : (t('effort.medium') || 'Medium')}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.text} />
                </AnimatedPressable>
              </View>

              <AnimatedPressable
                accessibilityLabel={t('chat.voiceInput') || 'Voice input'}
                accessibilityState={{ selected: voiceRecording }}
                onPress={voice.start}
                style={[styles.circleBtn, { backgroundColor: colors.surfaceHover }]}
              >
                <Ionicons name="mic-outline" size={21} color={iconColor} />
              </AnimatedPressable>

              {disabled ? (
                <AnimatedPressable
                  accessibilityLabel={t('chat.stopGenerating') || 'Stop generating'}
                  onPress={onStop}
                  scale={0.92}
                style={[styles.actionBtn, { backgroundColor: colors.text }]}
                >
                  <Ionicons name="stop" size={14} color={colors.background} />
                </AnimatedPressable>
              ) : (
                <AnimatedPressable
                  accessibilityLabel={t('chat.send') || 'Send message'}
                  accessibilityState={{ disabled: !canSend }}
                  disabled={!canSend}
                  onPress={canSend ? onSend : undefined}
                  scale={0.92}
                  style={[
                    styles.actionBtn,
                    { backgroundColor: canSend ? colors.text : colors.surfaceHover },
                    !canSend ? styles.actionDisabled : null,
                  ]}
                >
                  <Ionicons name="arrow-up" size={20} color={canSend ? colors.background : colors.textMuted} />
                </AnimatedPressable>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
    <ReasoningEffortPicker
      visible={effortPickerOpen}
      value={reasoningEffort}
      anchor={effortAnchor}
      onChange={(effort) => onChangeReasoningEffort?.(effort)}
      onClose={() => setEffortPickerOpen(false)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  /* frontend `.attachment-chips`: grid-row:1 inside the input wrap, flex
   * wrap gap 6px, padding 8px 12px 0 — the RN strip scrolls horizontally. */
  attachmentChips: {
    gap: 6,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 6,
    alignItems: 'center',
  },
  /* P2-2 alignment: `maxWidth` is a fallback only — the inline style
   * overrides it with the live `contentWidth` displayPref (frontend's
   * `.chat-input-wrap { max-width: 720px }`). `alignSelf: 'center'` is
   * RN's mechanism for the same horizontal centering `margin: 0 auto`
   * provides on tablet/landscape. */
  /* Both containers mirror frontend `.chat-input-wrap`:
   *   padding: 7px 8px; border-radius: 28px;
   *   box-shadow: 0 .35rem 1.8rem hsl(var(--always-black)/5%);
   * RN halves the CSS blur radius, hence `shadowRadius: 14` for 1.8rem
   * (28.8px), and the 0.35rem y-offset rounds to 6. */
  containerCapsule: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    minHeight: 64,
    borderWidth: 1,
    paddingLeft: 4,
    paddingRight: 6,
    paddingVertical: 0,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 4,
  },
  containerExpanded: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    minHeight: 104,
    borderWidth: 1,
    paddingVertical: 0,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 6,
  },
  containerVoice: {
    minHeight: 78,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  voiceBar: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voiceIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  voiceCopy: {
    flex: 1,
    minWidth: 0,
  },
  voiceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceLabel: {
    fontSize: 13,
  },
  voiceTimer: {
    fontSize: 11,
  },
  voiceTranscript: {
    marginTop: 4,
    fontSize: 12,
  },
  voiceStop: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /* web mobile `#chatInputArea` renders at 17px. */
  singleInput: {
    flex: 1,
    height: 52,
    fontSize: 17,
    lineHeight: 24,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  singleRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  expandedContent: {
    flex: 1,
  },
  expandedInput: {
    minHeight: 40,
    /* web mobile caps the growing editor at 180px (was 220). */
    maxHeight: 180,
    fontSize: 17,
    lineHeight: 24,
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 4,
    textAlignVertical: 'top',
  },
  expandedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  expandedRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  contextChipScroller: {
    flex: 1,
    minWidth: 0,
  },
  contextChips: {
    minHeight: 30,
    alignItems: 'center',
    gap: 6,
    paddingRight: 2,
  },
  contextChip: {
    minHeight: 30,
    maxWidth: 160,
    paddingHorizontal: 10,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  contextChipText: {
    maxWidth: 125,
    fontSize: 12,
    lineHeight: 16,
  },
  effortPill: {
    height: 40,
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  effortLabel: {
    fontSize: 15,
    lineHeight: 20,
  },
  /* Attach / think-deeper icon buttons — frontend sizes these at 38px
   * with a 20px glyph. */
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Mic sits one step smaller on the web (30px button, 16px glyph). */
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* frontend `.send-btn`: 28px circle, 50% radius, 16px glyph. */
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDisabled: {
    opacity: 0.56,
  },
  /* frontend `.send-btn.active` glow (`0 2px 10px accent/.22,
   * `0 4px 18px accent/.12`). RN has no CSS transition, so the swap
   * is instant; opacity is tuned for RN's shadow semantics. Resting
   * `scale(1.05)` rides on `AnimatedPressable restingScale`. */
  sendGlow: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
});
