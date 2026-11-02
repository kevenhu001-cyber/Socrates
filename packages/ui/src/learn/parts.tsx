/**
 * Shared pieces of the RN-3 learning scaffolds: the hairline-headed card,
 * the rich-field slot, a disclosure pill and the small text actions.
 * State is carried by ink, grey, glyphs and words — never by colour hue,
 * and nothing here draws a dot.
 */
import { type ReactNode } from 'react';
import { Animated, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { Chevron, useReveal } from '../turn/parts';
import { useLearnHost } from './host';

/** react-native-web turns `dataSet` into `data-*` attributes; native ignores it. */
export function dataSet(values: Record<string, string | number | undefined>): object {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) if (value !== undefined) clean[key] = String(value);
  return { dataSet: clean };
}

export const CARD_PAD = uiSpace[4];

export function ScaffoldCard({ kind, label, trailing, children, testID, accessibilityLabel }: {
  kind: string;
  label: string;
  trailing?: ReactNode;
  children: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useUiTheme();
  return (
    <View
      testID={testID ?? `scaffold-${kind}`}
      role="group"
      aria-label={accessibilityLabel ?? label}
      {...dataSet({ scaffold: kind })}
      style={{
        borderRadius: uiRadius.lg,
        borderWidth: 1,
        borderColor: colors.hairline,
        backgroundColor: colors.card,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: uiSpace[2],
          minHeight: 36,
          paddingHorizontal: CARD_PAD,
          paddingVertical: uiSpace[2],
          borderBottomWidth: 1,
          borderBottomColor: colors.hairline,
        }}
      >
        <UiText variant="labelSm" tone="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>{label}</UiText>
        {trailing ?? null}
      </View>
      <View style={{ padding: CARD_PAD, gap: uiSpace[3] }}>{children}</View>
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

/** Hairline-ruled sub-section inside a card (hints, solutions, explanation). */
export function Section({ label, children, testID, live }: { label?: string; children: ReactNode; testID?: string; live?: boolean }) {
  const { colors } = useUiTheme();
  const reveal = useReveal(true, 4);
  return (
    <Animated.View
      testID={testID}
      aria-live={live ? 'polite' : undefined}
      style={[{ borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: uiSpace[3], gap: uiSpace[2] }, reveal]}
    >
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      {children}
    </Animated.View>
  );
}

/**
 * Small capsule action. `quiet` is a text-weight pill (pale fill on hover),
 * `solid` the black capsule, `soft` the grey capsule. `chevron` shows a
 * disclosure chevron and wires `aria-expanded`.
 */
export function PillAction({ label, onPress, tone = 'quiet', disabled, expanded, chevron, selected, testID, accessibilityLabel, controls, data }: {
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
}) {
  const { colors } = useUiTheme();
  const { scale, hovered, focused, handlers } = usePressFeedback();
  const inked = tone === 'solid' || selected === true;
  const background = inked
    ? (hovered && !disabled ? colors.inkHover : colors.ink)
    : tone === 'soft'
      ? (hovered && !disabled ? colors.fillHover : colors.fill)
      : (hovered && !disabled ? colors.fill : 'transparent');
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
          gap: uiSpace[1],
          height: 32,
          paddingLeft: tone === 'quiet' ? uiSpace[2] : uiSpace[3],
          paddingRight: chevron ? uiSpace[2] : (tone === 'quiet' ? uiSpace[2] : uiSpace[3]),
          borderRadius: uiRadius.pill,
          borderWidth: tone === 'quiet' && !inked ? 1 : 0,
          borderColor: colors.hairline,
          backgroundColor: background,
          opacity: disabled ? 0.45 : 1,
          outlineStyle: focused ? 'solid' : undefined,
          outlineWidth: focused ? 2 : 0,
          outlineColor: colors.ink,
          outlineOffset: 2,
          transform: [{ scale }],
        }}
      >
        <UiText variant="labelSm" tone={inked ? 'onInk' : 'ink'} numberOfLines={1}>{label}</UiText>
        {chevron ? <Chevron open={Boolean(expanded)} size={6} tone="secondary" /> : null}
      </Animated.View>
    </Pressable>
  );
}

export function ActionRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: uiSpace[2] }}>{children}</View>;
}

/** ✓ / ✕ glyph in a hairline square: the verdict mark next to feedback. */
export function VerdictGlyph({ verdict, size = 18 }: { verdict: 'correct' | 'incorrect'; size?: number }) {
  const { colors } = useUiTheme();
  const right = verdict === 'correct';
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: right ? colors.ink : 'transparent',
        borderWidth: right ? 0 : 1,
        borderColor: colors.hairlineStrong,
      }}
    >
      <UiText variant="labelSm" tone={right ? 'onInk' : 'secondary'} style={{ fontSize: size * 0.62, lineHeight: size }}>{right ? '✓' : '✕'}</UiText>
    </View>
  );
}
