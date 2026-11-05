/**
 * RN-3 learning scaffolds, DOM-free. The web shell mounts them through
 * react-native-web (frontend/src/react/tutor-widgets); apps/socrates can
 * reuse them with its own `renderRich`.
 */
export { LearnHostProvider, useLearnHost, type LearnHost } from './host';
export { defaultLearnStrings, learnStrings, type LearnStrings } from './strings';
export { QuizCard, type QuizCardProps, type QuizResult } from './QuizCard';
export { FlashcardCard, type FlashcardCardProps } from './FlashcardCard';
export { ProblemCard, type ProblemCardProps, type AnswerFeedback, type AnswerFeedbackState } from './ProblemCard';
export { StepsCard, type StepsCardProps, type StepItem } from './StepsCard';
export { DefinitionCard, KeyPointCard, TheoremCard, ProofCard } from './NoteCard';
export { ScaffoldCard, Rich, PillAction } from './parts';
export { ReviewSession, defaultReviewStrings, type ReviewSessionProps, type ReviewStrings, type ReviewCardInput } from './ReviewSession';
export * from './model';
export * from './split';
