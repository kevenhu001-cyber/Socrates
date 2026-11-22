/**
 * Shared pieces of the learning scaffolds: the hairline-headed card, the
 * rich-field slot, a disclosure pill and the small text actions. State is
 * carried by ink, grey, glyphs and words — never by colour hue, and nothing
 * here draws a dot.
 *
 * React DOM by design (ADR 0027). Geometry and the host's structural class
 * hooks still come from the shell CSS where a surface owns them.
 */
import { type ReactNode } from 'react';
import { dataAttributes } from '../domProps';
import { domStyle, type ViewStyle } from '../domStyle';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { Chevron, useReducedMotion } from '../turn/parts';
import { H, R, S, focusRing, insetRing, sheets, transition } from '../look';
import { useLearnHost } from './host';

export const CARD_PAD = S[100];
/** Phones: the card keeps 12px of air so the reply column stays readable. */
export const CARD_PAD_COMPACT = S[100];
export const CARD_COMPACT_WIDTH = 769;

export function useCardPad(): number {
  return CARD_PAD;
}

/**
 * The site's learning scaffold card.
 *
 * A framed reference separates structured teaching material from surrounding prose.
 */
export function ScaffoldCard({
  kind,
  label,
  trailing,
  children,
  testID,
  accessibilityLabel,
}: {
  kind: string;
  label: string;
  trailing?: ReactNode;
  children: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const pad = useCardPad();
  const { colors } = useUiTheme();
  return (
    <div
      data-testid={testID ?? `scaffold-${kind}`}
      role="group"
      aria-label={accessibilityLabel ?? label}
      {...dataAttributes({ scaffold: kind })}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: R.card,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.hairline,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S[100],
          minHeight: H.action,
          paddingLeft: pad,
          paddingRight: pad,
          paddingTop: S[50],
          paddingBottom: S[50],
        }}
      >
        <UiText variant="labelSm" tone="ink" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </UiText>
        {trailing ?? null}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: pad,
          paddingRight: pad,
          paddingTop: pad,
          paddingBottom: pad,
          gap: S[100],
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Site `.ui-tag`: a 24px capsule, pale fill, quiet caption. `line` is the white variant. */
export function Tag({
  label,
  tone = 'fill',
  testID,
}: {
  label: string;
  tone?: 'fill' | 'line' | 'ink';
  testID?: string;
}) {
  const { colors } = useUiTheme();
  return (
    <div
      data-testid={testID}
      style={{
        display: 'flex',
        alignSelf: 'flex-start',
        flexShrink: 0,
        height: H.tag,
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: R.pill,
        backgroundColor: tone === 'ink' ? colors.ink : tone === 'line' ? colors.card : colors.fill,
      }}
    >
      <UiText
        variant="labelSm"
        tone={tone === 'ink' ? 'onInk' : 'secondary'}
        numberOfLines={1}
        style={{ fontWeight: '400' }}
      >
        {label}
      </UiText>
    </div>
  );
}

/**
 * The tinted sheet that holds a prompt, a hint or an explanation inside a
 * card. The tint separates it from the reply; it carries no ring of its
 * own, so nothing inside the card reads as a nested box.
 */
export function Sheet({
  children,
  label,
  testID,
  live,
  style,
  emphasis,
}: {
  children: ReactNode;
  label?: string;
  testID?: string;
  live?: boolean;
  style?: ViewStyle;
  /** Ink ring: the sheet that carries the right answer / the key idea. */
  emphasis?: boolean;
}) {
  const { colors } = useUiTheme();
  const { subtle } = sheets(colors);
  return (
    <div
      data-testid={testID}
      aria-live={live ? 'polite' : undefined}
      style={domStyle([
        {
          display: 'flex',
          flexDirection: 'column',
          gap: S[75],
          padding: S[200],
          borderRadius: R.row,
          backgroundColor: emphasis ? colors.card : subtle,
        },
        style,
      ])}
    >
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      {children}
    </div>
  );
}

/** One markdown field, rendered by the host. */
export function Rich({ source, part, style }: { source: string; part: string; style?: ViewStyle }) {
  const { renderRich } = useLearnHost();
  if (!source) return null;
  return <div style={domStyle([{ minWidth: 0 }, style])}>{renderRich(source, part)}</div>;
}

/** Quiet eyebrow above a sub-section ("Hint 1", "Explanation"). */
export function SectionLabel({ children }: { children: string }) {
  return (
    <UiText variant="labelSm" tone="tertiary">
      {children}
    </UiText>
  );
}

/**
 * Sub-section inside a card (hints, solutions, explanation): a tinted
 * `.rc-face` sheet. It mounts fully visible, so the sheet never flashes.
 */
export function Section({
  label,
  children,
  testID,
  live,
  emphasis,
}: {
  label?: string;
  children: ReactNode;
  testID?: string;
  live?: boolean;
  emphasis?: boolean;
}) {
  return (
    <Sheet label={label} testID={testID} live={live} emphasis={emphasis}>
      {children}
    </Sheet>
  );
}

/**
 * Capsule action, the site's 36px button (`.rc-flip` / `.rc-grade`):
 *   quiet  white with an inset 12% ring, `#f9f9f9` on hover;
 *          `selected` deepens the ring to 1.5px ink (`[aria-pressed]`);
 *   soft   the 4% grey capsule (`.home-text-link`);
 *   solid  the black capsule.
 * `chevron` shows a disclosure chevron and wires `aria-expanded`.
 * `size="sm"` is the 32px variant for dense rows (card heads, tool rows).
 */
export function PillAction({
  label,
  onPress,
  tone = 'quiet',
  disabled,
  expanded,
  chevron,
  selected,
  testID,
  accessibilityLabel,
  controls,
  data,
  size = 'md',
  leading,
}: {
  label: string;
  onPress?: () => void;
  tone?: 'quiet' | 'soft' | 'solid';
  disabled?: boolean;
  expanded?: boolean;
  chevron?: boolean;
  selected?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  controls?: string;
  data?: Record<string, string | number | undefined>;
  size?: 'sm' | 'md';
  leading?: ReactNode;
}) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { scale, hovered, focused, handlers } = usePressFeedback();
  const live = hovered && !disabled;
  const { subtle } = sheets(colors);
  const background =
    tone === 'solid'
      ? live
        ? colors.inkHover
        : colors.ink
      : tone === 'soft'
        ? live
          ? colors.fillHover
          : colors.fill
        : live
          ? subtle
          : colors.card;
  const ring =
    tone === 'quiet'
      ? insetRing(selected ? colors.ink : colors.hairlineStrong, selected ? 1.5 : 1)
      : tone === 'soft' && selected
        ? insetRing(colors.ink, 1.5)
        : undefined;
  const pad = size === 'sm' ? S[100] : S[200];
  return (
    <button
      type="button"
      data-testid={testID}
      aria-label={accessibilityLabel ?? label}
      aria-expanded={expanded}
      aria-pressed={selected}
      aria-controls={controls}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onPress}
      {...handlers}
      {...dataAttributes(data ?? {})}
      style={{
        display: 'inline-flex',
        alignSelf: 'flex-start',
        margin: 0,
        padding: 0,
        border: 0,
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span
        style={domStyle([
          {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: S[50],
            height: size === 'sm' ? 32 : H.action,
            paddingLeft: leading ? pad - 2 : pad,
            paddingRight: chevron ? pad - 4 : pad,
            borderRadius: R.pill,
            backgroundColor: background,
            boxShadow: ring,
            opacity: disabled ? 0.4 : 1,
            ...focusRing(colors, focused),
            ...transition('background-color, box-shadow, transform', reduced),
            transform: `scale(${scale})`,
          },
        ])}
      >
        {leading ?? null}
        <UiText variant="labelSm" tone={tone === 'solid' ? 'onInk' : 'ink'} numberOfLines={1}>
          {label}
        </UiText>
        {chevron ? (
          <Chevron
            open={Boolean(expanded)}
            size={6}
            tone={tone === 'solid' ? 'ink' : 'secondary'}
          />
        ) : null}
      </span>
    </button>
  );
}

export function ActionRow({ children, end }: { children: ReactNode; end?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: end ? 'flex-end' : 'flex-start',
        gap: S[75],
      }}
    >
      {children}
    </div>
  );
}

/**
 * ✓ / ✕ verdict mark (site `.ui-check`): a filled ink disc with a white
 * tick for right, a ringed disc with a grey cross for wrong. It carries a
 * glyph, so it reads as a mark, not as a dot.
 */
export function VerdictGlyph({
  verdict,
  size = 20,
}: {
  verdict: 'correct' | 'incorrect';
  size?: number;
}) {
  const { colors } = useUiTheme();
  const right = verdict === 'correct';
  return (
    <div
      aria-hidden
      style={{
        display: 'flex',
        width: size,
        height: size,
        borderRadius: R.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: right ? colors.ink : colors.card,
        boxShadow: right ? undefined : insetRing(colors.hairlineStrong, 1.5),
      }}
    >
      <UiText
        variant="labelSm"
        tone={right ? 'onInk' : 'secondary'}
        style={{ fontSize: 11, lineHeight: size }}
      >
        {right ? '✓' : '✕'}
      </UiText>
    </div>
  );
}
