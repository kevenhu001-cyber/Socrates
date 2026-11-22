import { uiRadius, uiSpace } from '@socrates/theme';
import { domStyle } from '../domStyle';
import { useUiTheme } from './theme';
import { UiText } from './UiText';

export interface UiPillProps {
  label: string;
  /** `outline` is a hairline capsule; `fill` a pale grey capsule. */
  tone?: 'outline' | 'fill';
  style?: unknown;
}

/** Static capsule for tags and small labels (not interactive — use UiButton). */
export function UiPill({ label, tone = 'fill', style }: UiPillProps) {
  const { colors } = useUiTheme();
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingLeft: uiSpace[3],
        paddingRight: uiSpace[3],
        paddingTop: 3,
        paddingBottom: 3,
        borderRadius: uiRadius.pill,
        backgroundColor: tone === 'fill' ? colors.fill : 'transparent',
        borderWidth: tone === 'outline' ? 1 : 0,
        borderStyle: 'solid',
        borderColor: colors.hairline,
        ...domStyle(style),
      }}
    >
      <UiText variant="labelSm" tone="secondary" numberOfLines={1}>
        {label}
      </UiText>
    </span>
  );
}
