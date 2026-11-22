/**
 * Detail primitives for one tool call: sections, code output, sources and
 * images. The call's detail now opens inline beneath its step row, so the
 * old drawer/bottom-sheet host is gone; the content blocks stay shared.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { R, S, focusRing, insetRing, sheets } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { UiButton, usePressFeedback } from '../primitives/UiButton';
import { MonoText, monoFamily } from './ToolCards';
import type { SourceCardView } from './toolCardModel';

export const SHEET_BREAKPOINT = 768;

const BUTTON_RESET: CSSProperties = {
  display: 'flex',
  background: 'none',
  border: 0,
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  textAlign: 'inherit',
};

export function DetailSection({
  title,
  kind,
  children,
}: {
  title: string;
  kind: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={`tool-detail-section-${kind}`}
      style={{ display: 'flex', flexDirection: 'column', gap: S[75] }}
    >
      <UiText variant="labelSm" tone="tertiary">
        {title}
      </UiText>
      {children}
    </div>
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
export function CodeBlock({
  text,
  onCopy,
  copyLabel,
  copiedLabel,
  failedLabel,
  extra,
  tone = 'plain',
  maxHeight = 360,
  testID,
}: CodeBlockProps) {
  const { colors } = useUiTheme();
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[75] }}>
      <div
        data-testid={testID}
        style={{
          overflow: 'auto',
          maxHeight,
          borderRadius: R.row,
          backgroundColor: subtle,
          boxShadow: insetRing(tone === 'error' ? colors.hairlineStrong : colors.hairline),
        }}
      >
        <div style={{ paddingInline: S[200], paddingBlock: S[100] }}>
          <MonoText testID="tool-code-output" style={{ fontFamily: monoFamily, lineHeight: 20 }}>
            {text}
          </MonoText>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          gap: S[75],
        }}
      >
        {extra}
        {onCopy ? (
          <UiButton
            testID="tool-code-copy"
            label={state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : copyLabel}
            variant="secondary"
            size="sm"
            aria-live="polite"
            onPress={() => {
              void copy();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function SourceFavicon({ source }: { source: SourceCardView }) {
  const { colors } = useUiTheme();
  const [failed, setFailed] = useState(!source.favicon);
  if (failed || !source.favicon) {
    return (
      <span
        data-testid="tool-source-monogram"
        aria-hidden
        style={{
          display: 'inline-flex',
          width: 20,
          height: 20,
          borderRadius: 6,
          backgroundColor: colors.fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <UiText
          variant="eyebrow"
          tone="secondary"
          style={{ fontSize: 10, lineHeight: 12, letterSpacing: 0 }}
        >
          {source.monogram}
        </UiText>
      </span>
    );
  }
  return (
    <img
      aria-hidden
      src={source.favicon}
      alt=""
      onError={() => setFailed(true)}
      style={{ width: 20, height: 20, borderRadius: 6 }}
    />
  );
}

function SourceCard({
  source,
  onOpen,
}: {
  source: SourceCardView;
  onOpen?: (url: string) => void;
}) {
  const { colors } = useUiTheme();
  const { subtle } = sheets(colors);
  const { hovered, focused, handlers } = usePressFeedback();
  const link = Boolean(source.url && onOpen);
  return (
    <button
      type="button"
      data-testid="tool-source"
      role={link ? 'link' : undefined}
      aria-label={[source.title, source.host].filter(Boolean).join(' · ')}
      disabled={!link}
      onClick={() => {
        if (source.url && onOpen) onOpen(source.url);
      }}
      {...handlers}
      style={{
        ...BUTTON_RESET,
        flexDirection: 'row',
        alignItems: 'center',
        gap: S[100],
        minHeight: 52,
        paddingBlock: S[75],
        paddingInline: S[100],
        borderRadius: R.row,
        backgroundColor: hovered && link ? subtle : colors.card,
        boxShadow: insetRing(hovered && link ? colors.hairlineStrong : colors.hairline),
        ...focusRing(colors, focused),
      }}
    >
      <SourceFavicon source={source} />
      <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <UiText testID="tool-source-title" variant="labelSm" tone="ink" numberOfLines={1}>
          {source.title}
        </UiText>
        {source.host ? (
          <UiText
            testID="tool-source-host"
            variant="labelSm"
            tone="tertiary"
            numberOfLines={1}
            style={{ fontWeight: '400' }}
          >
            {source.host}
          </UiText>
        ) : null}
      </span>
    </button>
  );
}

/** Search sources as compact cards: favicon, title and domain. */
export function SourceList({
  sources,
  onOpen,
}: {
  sources: ReadonlyArray<SourceCardView>;
  onOpen?: (url: string) => void;
}) {
  return (
    <div
      data-testid="tool-sources"
      style={{ display: 'flex', flexDirection: 'column', gap: S[75] }}
    >
      {sources.map((source) => (
        <SourceCard key={source.key} source={source} onOpen={onOpen} />
      ))}
    </div>
  );
}

/** Image output, shown directly at its natural aspect. */
export function ImageOutput({ uri, alt }: { uri: string; alt: string }) {
  const { colors } = useUiTheme();
  const [ratio, setRatio] = useState(4 / 3);
  return (
    <img
      data-testid="tool-image-output"
      alt={alt}
      src={uri}
      onLoad={(event) => {
        const image = event.currentTarget;
        if (image.naturalWidth && image.naturalHeight) {
          setRatio(image.naturalWidth / image.naturalHeight);
        }
      }}
      style={{
        display: 'block',
        width: '100%',
        aspectRatio: ratio,
        objectFit: 'contain',
        borderRadius: R.row,
        backgroundColor: colors.fill,
      }}
    />
  );
}

export function PlainDetail({ text }: { text: string }) {
  return (
    <UiText variant="bodySm" tone="secondary">
      {text}
    </UiText>
  );
}
