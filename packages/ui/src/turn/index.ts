/**
 * RN-2 turn module: thinking line + tool rows, DOM-free. The web shell
 * mounts these through react-native-web (frontend/src/react/tool-run);
 * apps/socrates can reuse them as-is.
 */
export { ThinkingSurface, ThinkingTimeline, ActivityStep, type ThinkingSurfaceProps, type ActivityStepProps } from './ThinkingSurface';
export {
  ToolApprovalCard,
  ToolErrorNotice,
  MonoText,
  type ApprovalDecisionView,
  type ToolApprovalCardProps,
} from './ToolCards';
export { DetailSection, CodeBlock, SourceList, ImageOutput, PlainDetail, SHEET_BREAKPOINT } from './ToolDetailSheet';
export { Chevron, Spinner } from './parts';
export * from './thinkingModel';
export * from './toolCardModel';
