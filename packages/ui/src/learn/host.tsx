/**
 * Host contract for the RN-3 learning scaffolds.
 *
 * The scaffolds never parse markdown or math themselves: every content field
 * is handed back to the host through `renderRich(source, part)`. The web shell
 * answers with its markdown + KaTeX HTML; a native client can answer with its
 * own markdown view. `part` names the field (`quiz-q`, `definition-term`, …)
 * so hosts and tests can address it.
 */
import { createContext, useContext, type ReactNode } from 'react';

export interface LearnStrings {
  label: Record<'quiz' | 'flashcard' | 'practice' | 'example' | 'step' | 'definition' | 'theorem' | 'proof' | 'derivation' | 'keyPoint', string>;
  quizMulti: string;
  quizSubmit: string;
  quizRetry: string;
  quizExplanation: string;
  /** `{answer}` is replaced with the formatted key. */
  quizAnswerIs: string;
  quizCorrect: string;
  quizIncorrect: string;
  readOnly: string;
  flashcardAria: string;
  flashcardFront: string;
  flashcardBack: string;
  flashcardFlip: string;
  flashcardFlipBack: string;
  flashcardPrompt: string;
  flashcardRate: string;
  rating: Record<'good' | 'fuzzy' | 'forgot', string>;
  ratingNote: Record<'good' | 'fuzzy' | 'forgot', string>;
  hintShow: string;
  /** `{n}` / `{total}`. */
  hintNext: string;
  hintHide: string;
  /** `{n}`. */
  hintLevel: string;
  solutionShow: string;
  solutionHide: string;
  answerPlaceholder: string;
  answerSubmit: string;
  answerReveal: string;
  stepsStepMode: string;
  /** `{n}` / `{total}`. */
  stepsNext: string;
  stepsAll: string;
  proofShow: string;
  proofHide: string;
}

export const defaultLearnStrings: LearnStrings = {
  label: {
    quiz: 'Quiz', flashcard: 'Flashcard', practice: 'Practice', example: 'Example', step: 'Steps',
    definition: 'Definition', theorem: 'Theorem', proof: 'Proof', derivation: 'Derivation', keyPoint: 'Key point',
  },
  quizMulti: 'Select all that apply',
  quizSubmit: 'Check answer',
  quizRetry: 'Try again',
  quizExplanation: 'Explanation',
  quizAnswerIs: 'Answer: {answer}',
  quizCorrect: 'Correct',
  quizIncorrect: 'Not quite',
  readOnly: 'View only',
  flashcardAria: 'Flashcard — press to turn',
  flashcardFront: 'Question',
  flashcardBack: 'Answer',
  flashcardFlip: 'Turn the card',
  flashcardFlipBack: 'Back to question',
  flashcardPrompt: 'Answer it in your head first, then turn the card.',
  flashcardRate: 'Did you remember it?',
  rating: { good: 'Remembered', fuzzy: 'Fuzzy', forgot: 'Forgot' },
  ratingNote: {
    good: 'Remembered. Leave it a little longer next time.',
    fuzzy: 'A bit fuzzy. Come back sooner and explain it again.',
    forgot: 'That is fine. Read the answer, then try again soon.',
  },
  hintShow: 'Show hint',
  hintNext: 'Next hint ({n}/{total})',
  hintHide: 'Hide hints',
  hintLevel: 'Hint {n}',
  solutionShow: 'Show solution',
  solutionHide: 'Hide solution',
  answerPlaceholder: 'Type your answer…',
  answerSubmit: 'Submit',
  answerReveal: 'Reveal answer',
  stepsStepMode: 'Step through',
  stepsNext: 'Next step ({n}/{total})',
  stepsAll: 'Show all',
  proofShow: 'Show proof',
  proofHide: 'Hide proof',
};

export interface LearnHost {
  strings: LearnStrings;
  /** Render one markdown field. Must return block content. */
  renderRich: (source: string, part: string) => ReactNode;
  /** Shared / replayed transcripts: no grading, no reporting. */
  readOnly?: boolean;
}

const fallbackHost: LearnHost = {
  strings: defaultLearnStrings,
  renderRich: () => null,
};

const LearnHostContext = createContext<LearnHost>(fallbackHost);

export function LearnHostProvider({ value, children }: { value: LearnHost; children: ReactNode }) {
  return <LearnHostContext.Provider value={value}>{children}</LearnHostContext.Provider>;
}

export function useLearnHost(): LearnHost {
  return useContext(LearnHostContext);
}
