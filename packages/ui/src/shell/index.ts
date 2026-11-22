/**
 * Shell chrome (top bar and the sidebar's outer shell) as plain React DOM.
 * The web host owns nodes, stores and handlers; these components draw the
 * chrome and report presses (ADR 0027).
 */
export {
  TopBarAction,
  TopBarModelSwitcher,
  TopBarModeSwitch,
  TopBarStageProgress,
  TopBarPracticeProgress,
  type TopBarActionProps,
  type TopBarModelSwitcherProps,
  type TopBarModeSwitchProps,
  type TopBarModeOption,
  type TopBarStageProgressProps,
  type TopBarPracticeProgressProps,
} from './TopBar';
export {
  SidebarBrand,
  SidebarIconAction,
  SidebarHeaderActions,
  SidebarNavRow,
  type SidebarBrandProps,
  type SidebarIconActionProps,
  type SidebarNavRowProps,
} from './Sidebar';
export {
  ConversationRow,
  ConversationGroupHeading,
  type ConversationRowProps,
  type ConversationRowPart,
  type ConversationRowParts,
  type ConversationGroupHeadingProps,
} from './ConversationRow';
export {
  conversationRowPaint,
  isRowActivationKey,
  type ConversationRowState,
  type ConversationRowPaint,
} from './conversationRowModel';
