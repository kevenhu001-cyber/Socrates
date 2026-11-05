/**
 * Shared pieces of the RN-3 learning scaffolds: the hairline-headed card,
 * the rich-field slot, a disclosure pill and the small text actions.
 * State is carried by ink, grey, glyphs and words — never by colour hue,
 * and nothing here draws a dot.
 */
import { type ReactNode } from 'react';
import { Animated, Pressable, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { Chevron, useReducedMotion, useReveal } from '../turn/parts';
import { H, R, S, focusRing, insetRing, sheets, transition } from '../look';
import { useLearnHost } from './host';

/** react-native-web turns `dataSet` into `data-*` attributes; native ignores it. */
export function dataSet(values: Record<string, string | number | undefined>): object {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) if (value !== undefined) clean[key] = String(value);
  return { dataSet: clean };
}

export const CARD_PAD = S[300];
/** Phones: the card keeps 16px of air so the reply column stays readable. */
export const CARD_PAD_COMPACT = S[200];
export const CARD_COMPACT_WIDTH = 769;

export function useCardPad(): number {
  const { width } = useWindowDimensions();
  return width < CARD_COMPACT_WIDTH ? CARD_PAD_COMPACT : CARD_PAD;
}

/**
 * The site's learning scaffold card.
 *
 * The card is a zone inside the reply, not a box on top of it: no hairline
 * ring, no lift, no divider under the label. The content reads as part of
 * the answer, and the label plus the inner sheets carry the structure.
 */
export function ScaffoldCard({ kind, label, trailing, children, testID, accessibilityLabel }: {
  kind: string;
  label: string;
  trailing?: ReactNode;
  children: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const pad = useCardPad();
  return (
    <View
      testID={testID ?? `scaffold-${kind}`}
      role="group"
      aria-label={accessibilityLabel ?? label}
      {...dataSet({ scaffold: kind })}
      style={{
        borderRadius: R.card,
        backgroundColor: 'transparent',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S[100],
          minHeight: H.head,
          paddingHorizontal: pad,
          paddingVertical: S[75],
        }}
      >
        <UiText variant="labelSm" tone="ink" numberOfLines={1} style={{ flexShrink: 1 }}>{label}</UiText>
        {trailing ?? null}
      </View>
      <View style={{ paddingHorizontal: pad, paddingTop: pad, paddingBottom: pad, gap: S[200] }}>{children}</View>
    </View>
  );
}

/** Site `.ui-tag`: a 24px capsule, pale fill, quiet caption. `line` is the white variant. */
export function Tag({ label, tone = 'fill', testID }: { label: string; tone?: 'fill' | 'line' | 'ink'; testID?: string }) {
  const { colors } = useUiTheme();
  return (
    <View
      testID={testID}
      style={{
        alignSelf: 'flex-start',
        flexShrink: 0,
        height: H.tag,
        justifyContent: 'center',
        paddingHorizontal: 10,
        borderRadius: R.pill,
        backgroundColor: tone === 'ink' ? colors.ink : tone === 'line' ? colors.card : colors.fill,
      }}
    >
      <UiText variant="labelSm" tone={tone === 'ink' ? 'onInk' : 'secondary'} numberOfLines={1} style={{ fontWeight: '400' }}>{label}</UiText>
    </View>
  );
}

/**
 * The tinted sheet that holds a prompt, a hint or an explanation inside a
 * card. The tint separates it from the reply; it carries no ring of its
 * own, so nothing inside the card reads as a nested box.
 */
export function Sheet({ children, label, testID, live, style, emphasis }: {
  children: ReactNode;
  label?: string;
  testID?: string;
  live?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Ink ring: the sheet that carries the right answer / the key idea. */
  emphasis?: boolean;
}) {
  const { colors } = useUiTheme();
  const { subtle } = sheets(colors);
  return (
    <View
      testID={testID}
      aria-live={live ? 'polite' : undefined}
      style={[{
        gap: S[75],
        padding: S[200],
        borderRadius: R.row,
        backgroundColor: emphasis ? colors.card : subtle,
      }, style]}
    >
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      {children}
    </View>
  );
}

/** One markdown field, rendered by the host. */
export function Rich({ source, part, style }: { source: string; part: string; style?: StyleProp<ViewStyle> }) {
  const { renderRich } = useLearnHost();
  if (!source) return null;
  return <View style={[{ minWidth: 0 }, style]}>{renderRich(source, part)}</View>;
}

/** Quiet eyebrow above a sub-section ("Hint 1", "Explanation"). */
export function SectionLabel({ children }: { children: string }) {
  return <UiText variant="labelSm" tone="tertiary">{children}</UiText>;
}

/**
 * Sub-section inside a card (hints, solutions, explanation): a tinted
 * `.rc-face` sheet that fades in once when it opens.
 */
export function Section({ label, children, testID, live, emphasis }: { label?: string; children: ReactNode; testID?: string; live?: boolean; emphasis?: boolean }) {
  const reveal = useReveal(true, 4);
  return (
    <Animated.View style={reveal}>
      <Sheet label={label} testID={testID} live={live} emphasis={emphasis}>{children}</Sheet>
    </Animated.View>
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
export function PillAction({ label, onPress, tone = 'quiet', disabled, expanded, chevron, selected, testID, accessibilityLabel, controls, data, size = 'md', leading }: {
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
  const background = tone === 'solid'
    ? (live ? colors.inkHover : colors.ink)
    : tone === 'soft'
      ? (live ? colors.fillHover : colors.fill)
      : (live ? subtle : colors.card);
  const ring = tone === 'quiet'
    ? insetRing(selected ? colors.ink : colors.hairlineStrong, selected ? 1.5 : 1)
    : (tone === 'soft' && selected ? insetRing(colors.ink, 1.5) : undefined);
  const pad = size === 'sm' ? S[100] : S[200];
  return (
    <Pressable
      role="button"
      testID={testID}
      aria-label={accessibilityLabel ?? label}
      aria-expanded={expanded}
      aria-pressed={selected}
      aria-controls={controls}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onPress={onPress}
      {...handlers}
      {...dataSet(data ?? {})}
      style={{ alignSelf: 'flex-start' }}
    >
      <Animated.View
        style={{
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
          ...transition('background-color, box-shadow', reduced),
          transform: [{ scale }],
        }}
      >
        {leading ?? null}
        <UiText variant="labelSm" tone={tone === 'solid' ? 'onInk' : 'ink'} numberOfLines={1}>{label}</UiText>
        {chevron ? <Chevron open={Boolean(expanded)} size={6} tone={tone === 'solid' ? 'ink' : 'secondary'} /> : null}
      </Animated.View>
    </Pressable>
  );
}

export function ActionRow({ children, end }: { children: ReactNode; end?: boolean }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: end ? 'flex-end' : 'flex-start', gap: S[75] }}>{children}</View>;
}

/**
 * ✓ / ✕ verdict mark (site `.ui-check`): a filled ink disc with a white
 * tick for right, a ringed disc with a grey cross for wrong. It carries a
 * glyph, so it reads as a mark, not as a dot.
 */
export function VerdictGlyph({ verdict, size = 20 }: { verdict: 'correct' | 'incorrect'; size?: number }) {
  const { colors } = useUiTheme();
  const right = verdict === 'correct';
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: R.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: right ? colors.ink : colors.card,
        boxShadow: right ? undefined : insetRing(colors.hairlineStrong, 1.5),
      }}
    >
      <UiText variant="labelSm" tone={right ? 'onInk' : 'secondary'} style={{ fontSize: 11, lineHeight: size }}>{right ? '✓' : '✕'}</UiText>
    </View>
  );
}
