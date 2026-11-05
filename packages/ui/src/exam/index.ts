/**
 * RN exam surface — narrow entry (`@socrates/ui/exam`).
 *
 * Only the drawing pieces are exported here; the host keeps generation,
 * persistence, scrolling and URL state. Pure model helpers stay in
 * `@socrates/ui/exam-model` so a shell that only needs grading does not pull
 * the components into its bundle.
 */
export { ExamPanel } from './ExamPanel';
export { ExamNavigation } from './ExamNavigation';
export { ExamFooter } from './ExamFooter';
export { defaultExamStrings } from './strings';
export type {
  ExamNavStrings, ExamQuestionStrings, ExamSetupStrings, ExamStrings, ExamTypeCardCopy,
} from './strings';
export type {
  ExamAction, ExamCommand, ExamCommandHandler, ExamDraft, ExamDraftPatch, ExamIds,
  ExamProviderOption, ExamScreen, ExamTextPart, RenderExamText,
} from './model';
