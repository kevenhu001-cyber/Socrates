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
  const { colors, fontFamily, typeScale } = useUiTheme();
  const step = uiType[variant];
  const color = tone === 'ink' ? colors.ink
    : tone === 'secondary' ? colors.inkSecondary
      : tone === 'tertiary' ? colors.inkTertiary : colors.onInk;
  return (
    <Text
      {...rest}
      style={[{
        fontFamily,
        fontSize: Math.round(step.size * typeScale * 10) / 10,
        lineHeight: Math.round(step.lineHeight * typeScale * 10) / 10,
        fontWeight: step.weight,
        letterSpacing: Math.round(step.tracking * typeScale * 100) / 100,
        color,
        textAlign: align,
      }, style]}
    />
  );
}
