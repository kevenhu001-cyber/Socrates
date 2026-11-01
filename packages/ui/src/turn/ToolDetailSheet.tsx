/**
 * ToolDetailSheet — per-call detail: a right-hand drawer on wide screens,
 * a bottom sheet on phones. Holds input, output and error sections.
 *
 * Built on RN `Modal`, so react-native-web supplies the portal, the focus
 * trap and Escape (`onRequestClose`); focus returns to the opener on close.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { uiMotion, uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { UiButton, usePressFeedback } from '../primitives/UiButton';
import { nativeDriver, useReducedMotion } from './parts';
import { MonoText, monoFamily } from './ToolCards';
import type { SourceCardView } from './toolCardModel';

export const SHEET_BREAKPOINT = 768;

export interface ToolDetailSheetProps {
  visible: boolean;
  onClose(): void;
  title: string;
  subtitle?: string;
  status?: string;
  closeLabel: string;
  /** Override the width-based choice (tests, native tablets). */
  layout?: 'drawer' | 'sheet';
  children: ReactNode;
}

export function ToolDetailSheet({ visible, onClose, title, subtitle, status, closeLabel, layout, children }: ToolDetailSheetProps) {
  const { colors } = useUiTheme();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const mode = layout || (width < SHEET_BREAKPOINT ? 'sheet' : 'drawer');
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) {
      enter.setValue(0);
      return;
    }
    if (reduced) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, { toValue: 1, duration: uiMotion.medium, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }).start();
  }, [visible, reduced, enter]);
  const slide = mode === 'drawer'
    ? { translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }
    : { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) };
  const panel = mode === 'drawer'
    ? { position: 'absolute' as const, top: uiSpace[3], right: uiSpace[3], bottom: uiSpace[3], width: Math.min(440, width - uiSpace[6]), borderRadius: uiRadius.card }
    : { position: 'absolute' as const, left: 0, right: 0, bottom: 0, maxHeight: '86%' as const, borderTopLeftRadius: uiRadius.card, borderTopRightRadius: uiRadius.card };
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: enter }}>
          <Pressable testID="tool-detail-backdrop" aria-label={closeLabel} onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' }} />
        </Animated.View>
        <Animated.View
          testID="tool-detail"
          role="dialog"
          aria-modal
          aria-label={title}
          {...{ dataSet: { layout: mode } }}
          style={[panel, {
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.hairline,
            overflow: 'hidden',
            opacity: enter,
            transform: [slide],
          }]}
        >
          {mode === 'sheet' ? <View aria-hidden style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: uiSpace[2], backgroundColor: colors.hairlineStrong }} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: uiSpace[3], paddingHorizontal: uiSpace[5], paddingTop: uiSpace[4], paddingBottom: uiSpace[3], borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <UiText testID="tool-detail-title" variant="label" tone="ink" numberOfLines={2} role="heading" aria-level={2}>{title}</UiText>
              {subtitle || status ? (
                <UiText variant="labelSm" tone="tertiary" numberOfLines={1} style={{ fontWeight: '400' }}>
                  {[subtitle, status].filter(Boolean).join(' · ')}
                </UiText>
              ) : null}
            </View>
            <UiButton testID="tool-detail-close" label={closeLabel} variant="secondary" size="sm" onPress={onClose} />
          </View>
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: uiSpace[5], gap: uiSpace[5] }}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function DetailSection({ title, kind, children }: { title: string; kind: string; children: ReactNode }) {
  return (
    <View testID={`tool-detail-section-${kind}`} style={{ gap: uiSpace[2] }}>
      <UiText variant="eyebrow" tone="tertiary">{title}</UiText>
      {children}
    </View>
  );
}

export interface CodeBlockProps {
  text: string;
  /** Resolves true when the text reached the clipboard. */
  onCopy?: (text: string) => Promise<boolean>;
  copyLabel: string;
  copiedLabel: string;
  failedLabel: string;
  /** Optional second action (e.g. 「显示全部」). */
  extra?: ReactNode;
  tone?: 'plain' | 'error';
  /** Scroll cap for the block; live streams use a shorter one. */
  maxHeight?: number;
  testID?: string;
}

/** Monospace output block with a copy pill. */
export function CodeBlock({ text, onCopy, copyLabel, copiedLabel, failedLabel, extra, tone = 'plain', maxHeight = 360, testID }: CodeBlockProps) {
  const { colors } = useUiTheme();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => setState('idle'), [text]);
  const copy = async () => {
    if (!onCopy) return;
    const ok = await onCopy(text).catch(() => false);
    setState(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1500);
  };
  return (
    <View style={{ gap: uiSpace[2] }}>
      <ScrollView
        testID={testID}
        horizontal={false}
        style={{ maxHeight, borderRadius: uiRadius.md, backgroundColor: colors.fill, borderWidth: tone === 'error' ? 1 : 0, borderColor: colors.hairlineStrong }}
        contentContainerStyle={{ padding: uiSpace[3] }}
      >
        <MonoText testID="tool-code-output" style={{ fontFamily: monoFamily, lineHeight: 20 }}>{text}</MonoText>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: uiSpace[2] }}>
        {extra}
        {onCopy ? (
          <UiButton
            testID="tool-code-copy"
            label={state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : copyLabel}
            variant="secondary"
            size="sm"
            aria-live="polite"
            onPress={() => { void copy(); }}
          />
        ) : null}
      </View>
    </View>
  );
}

function SourceFavicon({ source }: { source: SourceCardView }) {
  const { colors } = useUiTheme();
  const [failed, setFailed] = useState(!source.favicon);
  if (failed || !source.favicon) {
    return (
      <View aria-hidden style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: colors.fillPressed, alignItems: 'center', justifyContent: 'center' }}>
        <UiText variant="eyebrow" tone="secondary" style={{ fontSize: 10, lineHeight: 12, letterSpacing: 0 }}>{source.monogram}</UiText>
      </View>
    );
  }
  return <Image aria-hidden source={{ uri: source.favicon }} onError={() => setFailed(true)} style={{ width: 16, height: 16, borderRadius: 4 }} />;
}

function SourceCard({ source, onOpen }: { source: SourceCardView; onOpen?: (url: string) => void }) {
  const { colors } = useUiTheme();
  const { hovered, focused, handlers } = usePressFeedback();
  const link = Boolean(source.url && onOpen);
  return (
    <Pressable
      testID="tool-source"
      role={link ? 'link' : undefined}
      aria-label={[source.title, source.host].filter(Boolean).join(' · ')}
      disabled={!link}
      onPress={() => { if (source.url && onOpen) onOpen(source.url); }}
      {...handlers}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: uiSpace[3],
        paddingVertical: uiSpace[2],
        paddingHorizontal: uiSpace[3],
        borderRadius: uiRadius.md,
        borderWidth: 1,
        borderColor: colors.hairline,
        backgroundColor: hovered && link ? colors.fill : colors.card,
        outlineStyle: focused ? 'solid' : undefined,
        outlineWidth: focused ? 2 : 0,
        outlineColor: colors.ink,
      }}
    >
      <SourceFavicon source={source} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <UiText testID="tool-source-title" variant="labelSm" tone="ink" numberOfLines={1}>{source.title}</UiText>
        {source.host ? <UiText testID="tool-source-host" variant="labelSm" tone="tertiary" numberOfLines={1} style={{ fontWeight: '400' }}>{source.host}</UiText> : null}
      </View>
    </Pressable>
  );
}

/** Search sources as compact cards: favicon, title and domain. */
export function SourceList({ sources, onOpen }: { sources: ReadonlyArray<SourceCardView>; onOpen?: (url: string) => void }) {
  return (
    <View testID="tool-sources" style={{ gap: uiSpace[2] }}>
      {sources.map((source) => <SourceCard key={source.key} source={source} onOpen={onOpen} />)}
    </View>
  );
}

/** Image output, shown directly at its natural aspect. */
export function ImageOutput({ uri, alt }: { uri: string; alt: string }) {
  const { colors } = useUiTheme();
  const [ratio, setRatio] = useState(4 / 3);
  return (
    <Image
      testID="tool-image-output"
      accessibilityLabel={alt}
      source={{ uri }}
      resizeMode="contain"
      onLoad={(event) => {
        const source = (event.nativeEvent as { source?: { width?: number; height?: number } }).source;
        if (source?.width && source?.height) setRatio(source.width / source.height);
      }}
      style={{ width: '100%', aspectRatio: ratio, borderRadius: uiRadius.md, backgroundColor: colors.fill }}
    />
  );
}

export function PlainDetail({ text }: { text: string }) {
  return <UiText variant="bodySm" tone="secondary">{text}</UiText>;
}
