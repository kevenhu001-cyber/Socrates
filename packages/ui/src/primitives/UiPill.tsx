import { View, type StyleProp, type ViewStyle } from 'react-native';
import { uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from './theme';
import { UiText } from './UiText';

export interface UiPillProps {
  label: string;
  /** `outline` is a hairline capsule; `fill` a pale grey capsule. */
  tone?: 'outline' | 'fill';
  style?: StyleProp<ViewStyle>;
}

/** Static capsule for tags and small labels (not interactive — use UiButton). */
export function UiPill({ label, tone = 'fill', style }: UiPillProps) {
  const { colors } = useUiTheme();
  return (
    <View
      style={[{
        alignSelf: 'flex-start',
        paddingHorizontal: uiSpace[3],
        paddingVertical: 3,
        borderRadius: uiRadius.pill,
        backgroundColor: tone === 'fill' ? colors.fill : 'transparent',
        borderWidth: tone === 'outline' ? 1 : 0,
        borderColor: colors.hairline,
      }, style]}
    >
      <UiText variant="labelSm" tone="secondary" numberOfLines={1}>{label}</UiText>
    </View>
  );
}
