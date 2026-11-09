/**
 * Detail primitives for one tool call: sections, code output, sources and
 * images. The call's detail now opens inline beneath its step row, so the
 * old drawer/bottom-sheet host is gone; the content blocks stay shared.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { R, S, focusRing, insetRing, sheets } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { UiButton, usePressFeedback } from '../primitives/UiButton';
import { MonoText, monoFamily } from './ToolCards';
import type { SourceCardView } from './toolCardModel';

export const SHEET_BREAKPOINT = 768;

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
