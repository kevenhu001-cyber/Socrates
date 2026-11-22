import type { CSSProperties, HTMLAttributes } from 'react';
import { uiType, type UiTypeToken } from '@socrates/theme';
import { useUiTheme } from './theme';
import { dataAttributes, type DataSet } from '../domProps';

export type UiTextTone = 'ink' | 'secondary' | 'tertiary' | 'onInk';

type TextStyle = Omit<CSSProperties, 'fontVariant'> & {
  WebkitLineClamp?: number;
  WebkitBoxOrient?: 'vertical';
  /** RN style shape still passed by a few callers; normalized to CSS below. */
  fontVariant?: string | string[];
  paddingHorizontal?: number;
  paddingVertical?: number;
};

export type UiTextStyle = TextStyle;

export interface UiTextProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'style'> {
  variant?: UiTypeToken;
  tone?: UiTextTone;
  align?: 'auto' | 'left' | 'center' | 'right';
  style?: TextStyle | Array<TextStyle | undefined | null | false>;
  /** DOM id. Kept under the old name while components migrate off the shim. */
  nativeID?: string;
  /** Clamp to N lines; the DOM replacement for the RN prop. */
  numberOfLines?: number;
  testID?: string;
  dataSet?: DataSet;
  /** Ignored on the DOM: text is always selectable. */
  selectable?: boolean;
  /** RN aliases still passed by a few callers while they migrate. */
  accessibilityLabel?: string;
  ellipsizeMode?: string;
}

/**
 * Text drawn from the shared type ladder. Hierarchy is size and weight, never hue.
 *
 * React DOM by design (ADR 0027): a plain `<span>`, no React Native layer.
 */
export function UiText({
  variant = 'body',
  tone = 'ink',
  align,
  style,
  nativeID,
  numberOfLines,
  testID,
  dataSet,
  selectable: _selectable,
  accessibilityLabel,
  ellipsizeMode,
  children,
  ...rest
}: UiTextProps) {
  const { colors, fontFamily, fontFamilies, typeScale } = useUiTheme();
  const step = uiType[variant];
  /* A host that registers one face per weight gets that face; the ladder's
     weight is then already baked into the file, so it must not be asked for
     again. Web hosts keep the CSS family and let CSS pick the weight. */
  const face = fontFamilies?.[step.weight];
  const color =
    tone === 'ink'
      ? colors.ink
      : tone === 'secondary'
        ? colors.inkSecondary
        : tone === 'tertiary'
          ? colors.inkTertiary
          : colors.onInk;
  const rawFlat: TextStyle = Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : (style ?? {});
  const { fontVariant } = rawFlat;
  const restFlat: Record<string, unknown> = { ...rawFlat };
  delete restFlat.fontVariant;
  const paddingHorizontal = rawFlat.paddingHorizontal;
  const paddingVertical = rawFlat.paddingVertical;
  delete restFlat.paddingHorizontal;
  delete restFlat.paddingVertical;
  const flatStyle = {
    ...restFlat,
    ...(Array.isArray(fontVariant)
      ? { fontVariantNumeric: fontVariant.join(' ') }
      : fontVariant
        ? { fontVariant }
        : {}),
    ...(paddingHorizontal !== undefined
      ? { paddingLeft: paddingHorizontal, paddingRight: paddingHorizontal }
      : {}),
    ...(paddingVertical !== undefined
      ? { paddingTop: paddingVertical, paddingBottom: paddingVertical }
      : {}),
  } as CSSProperties;
  const clamp: TextStyle | undefined =
    numberOfLines && numberOfLines > 0
      ? {
          display: '-webkit-box',
          WebkitLineClamp: numberOfLines,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }
      : undefined;
  return (
    <span
      {...dataAttributes(dataSet)}
      {...rest}
      id={nativeID || (rest.id as string | undefined)}
      data-testid={testID}
      aria-label={accessibilityLabel ?? (rest['aria-label'] as string | undefined)}
      style={
        {
          fontFamily: face ?? fontFamily,
          ...(face ? {} : { fontWeight: step.weight }),
          fontSize: Math.round(step.size * typeScale * 10) / 10,
          /* Unitless line-height is a multiplier in CSS; React does not add
             px to it (it is on the unitless list), so `28` would render as
             28× the font size. Emit the pixel value explicitly. */
          lineHeight: `${Math.round(step.lineHeight * typeScale * 10) / 10}px`,
          letterSpacing: Math.round(step.tracking * typeScale * 100) / 100,
          color,
          textAlign: align === 'auto' ? undefined : align,
          ...(numberOfLines ? { textOverflow: 'ellipsis' } : {}),
          ...clamp,
          ...flatStyle,
        } as CSSProperties
      }
    >
      {children}
    </span>
  );
}
