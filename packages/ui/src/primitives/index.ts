/**
 * Shared primitives: token-driven React DOM building blocks.
 *
 * ADR 0027: these are plain DOM elements plus CSS, not React Native views.
 * The RN-shaped style aliases come from `domStyle.ts` and disappear with the
 * frozen `react-web` shim.
 */
export type { TextStyle, ViewStyle } from '../domStyle';
export { UiThemeProvider, useUiTheme, type UiFontWeight, type UiThemeValue } from './theme';
export { UiText, type UiTextProps, type UiTextTone } from './UiText';
export {
  UiButton,
  usePressFeedback,
  type UiButtonProps,
  type UiButtonSize,
  type UiButtonVariant,
} from './UiButton';
export { UiPill, type UiPillProps } from './UiPill';
export { UiCard, UiPressableCard, type UiCardTone, type UiPressableCardProps } from './UiCard';
export {
  UiIcon,
  UI_GLYPHS,
  UI_ICON_STROKE,
  type UiIconProps,
  type UiGlyphName,
  type UiGlyphShape,
  type UiIconRenderer,
  type UiIconRendererProps,
} from './UiIcon';
