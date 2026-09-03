import React, { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface ComposerProps {
  value: string;
  disabled?: boolean;
  hasAttachments?: boolean;
  reasoningEffort?: ReasoningEffort;
  webSearchEnabled?: boolean;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onAttach: () => void;
  onChangeReasoningEffort?: (effort: ReasoningEffort) => void;
  onToggleWebSearch?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/* Reserved for the future STT recording indicator (frontend
 * `ui/voiceInput.js` voice-recording-stop). Currently unreferenced —
 * no speech-recognition engine is wired on mobile yet. */
export function VoiceWaveBars({ color }: { color: string }) {
  const bars = [6, 12, 18, 12, 6];
  return (
    <View style={waveStyles.container} pointerEvents="none">
      {bars.map((h, i) => (
        <View key={i} style={[waveStyles.bar, { height: h, backgroundColor: color }]} />
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

export function Composer({
  value,
  disabled = false,
  hasAttachments = false,
  reasoningEffort = 'medium',
  webSearchEnabled = false,
  onChangeText,
  onSend,
  onStop,
  onAttach,
  onChangeReasoningEffort,
  onToggleWebSearch,
  placeholder,
  autoFocus = false,
}: ComposerProps) {
  const { colors, typography, contentWidth, fontScale } = useTheme();
  const t = useT();
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const canSend = (value.trim().length > 0 || hasAttachments) && !disabled;

  // An expanded 2-row layout is shown when the user focuses, types multi-line, or enters text
  const isExpanded = focused || value.includes('\n') || value.length > 30;

  const toggleThinkDeeper = () => {
    if (!onChangeReasoningEffort) return;
    onChangeReasoningEffort(reasoningEffort === 'high' ? 'medium' : 'high');
  };

  const defaultPlaceholder = t('composer.placeholder') || t('chat.placeholder') || 'Ask Socrates';
  /* P1-2 alignment: iconColor now sourced from the canonical text
   * token (was `#e0e0e0` for dark, a legacy pre-align value). */
  const iconColor = colors.text;

  /* frontend `.send-btn` is neutral until there is text to send —
   *   `background: hsl(var(--bg-300)); color: hsl(var(--text-400));`
   * — then flips to `.send-btn.active` (accent fill, `--oncolor-100`
   * glyph). mobile previously painted it accent at all times. */
  const sendIdleBg = colors.surfaceHover;
  const sendIdleFg = colors.textMuted;

  return (
    <View
      style={[
        isExpanded ? styles.containerExpanded : styles.containerCapsule,
        {
          /* `--surface-input` / modal surfaces in frontend all resolve to
           * `--bg-000`, so the composer sits on the overlay token. */
          backgroundColor: colors.surfaceRaised,
          /* frontend: `border-color: hsl(var(--border-300)/0.24)` at rest,
           * brightening to the accent at 45% when focused. */
          borderColor: focused
            ? withAlpha(colors.accent, 0.45)
            : withAlpha(colors.border, 0.24),
          /* frontend `.chat-input-wrap` / `.topic-input-wrap` both use a
           * 28px pill radius. The previous 16 was a pre-align value. */
          borderRadius: 28,
          /* P3: live `contentWidth` from displayPrefs replaces the
           * hard-coded 620px so the chat column widens/narrows with
           * the user's display preference. */
          maxWidth: contentWidth,
        },
      ]}
    >
      {!isExpanded ? (
        /* Single-row resting capsule — frontend layout is
         * attach + text + send only (`src/ui/composerTools.js` popover
         * owns tools). The standalone mic + wave idle button was a
         * mobile-only fork (see frontend-parity.md Composer 🔴) and is
         * removed for 1:1. NOTE: voice input (STT) is not implemented
         * on mobile yet — `speech.ts` is TTS-only while frontend has
         * `ui/voiceInput.js` (SpeechRecognition). Do not re-add a mic
         * button until an STT engine is wired. */
        <View style={styles.singleRow}>
          {/* Plus button */}
          <AnimatedPressable
            onPress={onAttach}
            accessibilityRole="button"
            accessibilityLabel={t('chat.attach') || 'Add tools and files'}
            style={styles.circleBtn}
          >
            <Ionicons name="add" size={20} color={iconColor} />
          </AnimatedPressable>

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
              {
                color: colors.text,
                fontFamily: typography.body,
              },
            ]}
            autoFocus={autoFocus}
            returnKeyType="default"
            blurOnSubmit={false}
          />

          {/* Bottom control row */}
          <View style={styles.expandedFooter}>
            {/* Left: Plus button */}
            <AnimatedPressable
              onPress={onAttach}
              accessibilityRole="button"
              accessibilityLabel={t('chat.attach') || 'Add tools and files'}
              style={styles.circleBtn}
            >
              <Ionicons name="add" size={20} color={iconColor} />
            </AnimatedPressable>

            {/* Right actions: Think deeper + Web search + Send.
             * Mirrors the expanded composer toolbar (effort + search
             * live here, not as floating buttons). Voice input stays
             * in the attach sheet. */}
            <View style={styles.expandedRightRow}>
              {/* Think deeper dome glyph */}
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel="Think deeper"
                accessibilityState={{ selected: reasoningEffort === 'high' }}
                onPress={toggleThinkDeeper}
                style={styles.circleBtn}
              >
                <ThinkDeeperGlyph
                  size={20}
                  color={reasoningEffort === 'high' ? colors.accent : iconColor}
                />
              </AnimatedPressable>

              {/* Web search toggle */}
              {onToggleWebSearch ? (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel="Web search"
                  accessibilityState={{ selected: webSearchEnabled }}
                  onPress={onToggleWebSearch}
                  style={styles.circleBtn}
                >
                  <Ionicons
                    name="globe-outline"
                    size={19}
                    color={webSearchEnabled ? colors.accent : iconColor}
                  />
                </AnimatedPressable>
              ) : null}

              {/* Send / Stop */}
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
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /* P2-2 alignment: `maxWidth: 620` mirrors `frontend`'s
   * `#chatInputWrap { width: min(100%, 620px) }` so on tablet/landscape
   * phones the composer stays centered instead of stretching to
   * viewport edge. `alignSelf: 'center'` is RN's mechanism for the
   * same horizontal centering the `min(100%, 620px)` provides. */
  /* Both containers mirror frontend `.chat-input-wrap`:
   *   padding: 7px 8px; border-radius: 28px;
   *   box-shadow: 0 .35rem 1.8rem hsl(var(--always-black)/5%);
   * RN halves the CSS blur radius, hence `shadowRadius: 14` for 1.8rem
   * (28.8px), and the 0.35rem y-offset rounds to 6. */
  containerCapsule: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    minHeight: 52,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
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
    minHeight: 118,
    borderWidth: 1,
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 6,
  },
  singleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /* frontend `#chatInputArea` inherits the 14px body size at
   * line-height 1.45 → 20px. The previous 16/22 was oversized and made
   * the resting capsule taller than the web composer. */
  singleInput: {
    flex: 1,
    height: 38,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 8,
    paddingVertical: 0,
  },
  singleRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expandedContent: {
    flex: 1,
  },
  expandedInput: {
    minHeight: 56,
    maxHeight: 140,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
    textAlignVertical: 'top',
  },
  expandedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  expandedRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  /* Attach / think-deeper icon buttons — frontend sizes these at 38px
   * with a 20px glyph. */
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Mic sits one step smaller on the web (30px button, 16px glyph). */
  micBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* frontend `.send-btn`: 28px circle, 50% radius, 16px glyph. */
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
