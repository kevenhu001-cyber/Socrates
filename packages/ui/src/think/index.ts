/**
 * RN-4 — "Think out loud": the question chain and the five learning modes,
 * DOM-free. The web shell mounts them through react-native-web
 * (frontend/src/react/tutor/QuestionChainRoot.tsx and
 * frontend/src/react/home/LearningModes.tsx); apps/socrates can reuse them.
 */
export { QuestionChain, type QuestionChainProps, type QuestionChainStrings } from './QuestionChain';
export { LearningModeSwitch, type LearningModeOption, type LearningModeSwitchProps } from './LearningModeSwitch';
export * from './model';
