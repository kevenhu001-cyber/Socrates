/**
 * ToolDetailSheet — per-call detail: a right-hand drawer on wide screens,
 * a bottom sheet on phones. Holds input, output and error sections.
 *
 * Built on RN `Modal`, so react-native-web supplies the portal, the focus
 * trap and Escape (`onRequestClose`); focus returns to the opener on close.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { uiMotion } from '@socrates/theme';
import { R, S, focusRing, insetRing, shadow, sheets } from '../look';
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
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      if (reduced) {
        enter.setValue(1);
        return;
      }
      Animated.timing(enter, { toValue: 1, duration: uiMotion.medium, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }).start();
    } else if (rendered) {
      if (reduced) {
        enter.setValue(0);
        setRendered(false);
        return;
      }
      Animated.timing(enter, { toValue: 0, duration: uiMotion.fast, easing: Easing.in(Easing.cubic), useNativeDriver: nativeDriver }).start(() => {
        setRendered(false);
      });
    }
  }, [visible, reduced, enter, rendered]);

  const slide = mode === 'drawer'
    ? { translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }
    : { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) };
  const panel = mode === 'drawer'
    ? { position: 'absolute' as const, top: S[100], right: S[100], bottom: S[100], width: Math.min(440, width - S[400]), borderRadius: R.stage }
    : { position: 'absolute' as const, left: 0, right: 0, bottom: 0, maxHeight: '86%' as const, borderTopLeftRadius: R.stage, borderTopRightRadius: R.stage };
  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: enter }}>
          <Pressable testID="tool-detail-backdrop" aria-label={closeLabel} onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.16)' }} />
        </Animated.View>
        <Animated.View
          testID="tool-detail"
          role="dialog"
          aria-modal
          aria-label={title}
          {...{ dataSet: { layout: mode } }}
          style={[panel, {
            backgroundColor: colors.card,
            boxShadow: shadow(colors, 'dialog'),
            overflow: 'hidden',
            opacity: enter,
            transform: [slide],
          }]}
        >
          {mode === 'sheet' ? <View aria-hidden style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: S[75], backgroundColor: colors.hairlineStrong }} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S[100], minHeight: 64, paddingHorizontal: S[300], paddingVertical: S[100], borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <UiText testID="tool-detail-title" variant="label" tone="ink" numberOfLines={2} role="heading" aria-level={2}>{title}</UiText>
              {subtitle || status ? (
                <UiText variant="labelSm" tone="tertiary" numberOfLines={1} style={{ fontWeight: '400' }}>
                  {[subtitle, status].filter(Boolean).join(' · ')}
                </UiText>
              ) : null}
            </View>
            <UiButton testID="tool-detail-close" label={closeLabel} variant="secondary" size={mode === 'sheet' ? 'lg' : 'sm'} onPress={onClose} style={{ flexShrink: 0 }} />
          </View>
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: S[300], gap: S[300] }}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function DetailSection({ title, kind, children }: { title: string; kind: string; children: ReactNode }) {
  return (
    <View testID={`tool-detail-section-${kind}`} style={{ gap: S[75] }}>
      <UiText variant="labelSm" tone="tertiary">{title}</UiText>
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
  const { width } = useWindowDimensions();
  const { subtle } = sheets(colors);
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
    <View style={{ gap: S[75] }}>
      <ScrollView
        testID={testID}
        horizontal={false}
        style={{ maxHeight, borderRadius: R.row, backgroundColor: subtle, boxShadow: insetRing(tone === 'error' ? colors.hairlineStrong : colors.hairline) }}
        contentContainerStyle={{ paddingHorizontal: S[200], paddingVertical: S[100] }}
      >
        <MonoText testID="tool-code-output" style={{ fontFamily: monoFamily, lineHeight: 20 }}>{text}</MonoText>
      </ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: S[75] }}>
        {extra}
        {onCopy ? (
          <UiButton
            testID="tool-code-copy"
            label={state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : copyLabel}
            variant="secondary"
            size={width < SHEET_BREAKPOINT ? 'lg' : 'sm'}
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
      <View aria-hidden style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' }}>
        <UiText variant="eyebrow" tone="secondary" style={{ fontSize: 10, lineHeight: 12, letterSpacing: 0 }}>{source.monogram}</UiText>
      </View>
    );
  }
  return <Image aria-hidden source={{ uri: source.favicon }} onError={() => setFailed(true)} style={{ width: 20, height: 20, borderRadius: 6 }} />;
}

function SourceCard({ source, onOpen }: { source: SourceCardView; onOpen?: (url: string) => void }) {
  const { colors } = useUiTheme();
  const { subtle } = sheets(colors);
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
        gap: S[100],
        minHeight: 52,
        paddingVertical: S[75],
        paddingHorizontal: S[100],
        borderRadius: R.row,
        backgroundColor: hovered && link ? subtle : colors.card,
        boxShadow: insetRing(hovered && link ? colors.hairlineStrong : colors.hairline),
        ...focusRing(colors, focused),
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
    <View testID="tool-sources" style={{ gap: S[75] }}>
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
      style={{ width: '100%', aspectRatio: ratio, borderRadius: R.row, backgroundColor: colors.fill }}
    />
  );
}

export function PlainDetail({ text }: { text: string }) {
  return <UiText variant="bodySm" tone="secondary">{text}</UiText>;
}
