import { Text, type TextProps } from 'react-native';
import { uiType, type UiTypeToken } from '@socrates/theme';
import { useUiTheme } from './theme';

export type UiTextTone = 'ink' | 'secondary' | 'tertiary' | 'onInk';

export interface UiTextProps extends TextProps {
  variant?: UiTypeToken;
  tone?: UiTextTone;
  align?: 'auto' | 'left' | 'center' | 'right';
}

/** Text drawn from the shared type ladder. Hierarchy is size and weight, never hue. */
export function UiText({ variant = 'body', tone = 'ink', align, style, ...rest }: UiTextProps) {
  const { colors, fontFamily, fontFamilies, typeScale } = useUiTheme();
  const step = uiType[variant];
  /* A host that registers one face per weight gets that face; the ladder's
     weight is then already baked into the file, so it must not be asked for
     again. Web hosts keep the CSS family and let CSS pick the weight. */
  const face = fontFamilies?.[step.weight];
  const color = tone === 'ink' ? colors.ink
    : tone === 'secondary' ? colors.inkSecondary
      : tone === 'tertiary' ? colors.inkTertiary : colors.onInk;
  return (
    <Text
      {...rest}
      style={[{
        fontFamily: face ?? fontFamily,
        ...(face ? {} : { fontWeight: step.weight }),
        fontSize: Math.round(step.size * typeScale * 10) / 10,
        lineHeight: Math.round(step.lineHeight * typeScale * 10) / 10,
        letterSpacing: Math.round(step.tracking * typeScale * 100) / 100,
        color,
        textAlign: align,
      }, style]}
    />
  );
}
