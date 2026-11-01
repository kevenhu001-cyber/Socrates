import { type ReactNode } from 'react';
import { Animated, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from './theme';
import { usePressFeedback } from './UiButton';

export type UiCardTone = 'raised' | 'fill';

function cardStyle(tone: UiCardTone, colors: ReturnType<typeof useUiTheme>['colors'], hovered: boolean): ViewStyle {
  return {
    borderRadius: uiRadius.card,
    padding: uiSpace[5],
    backgroundColor: tone === 'raised' ? colors.card : (hovered ? colors.fillHover : colors.fill),
    borderWidth: 1,
    borderColor: tone === 'raised' ? (hovered ? colors.hairlineStrong : colors.hairline) : 'transparent',
  };
}

/** Rounded card. `raised` is white with a hairline; `fill` is pale grey. */
export function UiCard({ tone = 'raised', style, children }: { tone?: UiCardTone; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const { colors } = useUiTheme();
  return <View style={[cardStyle(tone, colors, false), style]}>{children}</View>;
}

export interface UiPressableCardProps extends Omit<PressableProps, 'children' | 'style'> {
  tone?: UiCardTone;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** A card that is one button: hover darkens the hairline, press scales slightly. */
export function UiPressableCard({ tone = 'raised', style, children, ...rest }: UiPressableCardProps) {
  const { colors } = useUiTheme();
  const { scale, hovered, focused, handlers } = usePressFeedback();
  return (
    <Pressable accessibilityRole="button" {...rest} {...handlers} style={style}>
      <Animated.View
        style={[cardStyle(tone, colors, hovered), {
          flexGrow: 1,
          outlineStyle: focused ? 'solid' : undefined,
          outlineWidth: focused ? 2 : 0,
          outlineColor: colors.ink,
          outlineOffset: 2,
          transform: [{ scale }],
        }]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
