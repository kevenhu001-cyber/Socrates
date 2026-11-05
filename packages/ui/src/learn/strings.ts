/**
 * The copy the shared learning cards draw.
 *
 * One table for every host: the web shell and the universal app mount the
 * same cards, so the labels must not live in two places. The file is plain
 * data (no JSX) so the unit suite can assert the two languages stay in step.
 */

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
    definition: 'Definition', theorem: 'Theorem', proof: 'Proof', derivation: 'Derivation', keyPoint: 'Key Point',
  },
  quizMulti: 'Select all that apply',
  quizSubmit: 'Check answer',
  quizRetry: 'Try again',
  quizExplanation: 'Explanation',
  quizAnswerIs: 'Answer: {answer}',
  quizCorrect: 'Correct!',
  quizIncorrect: 'Not quite',
  readOnly: 'View only',
  flashcardAria: 'Flashcard — click to flip',
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
  hintHide: 'Hide hint',
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

/**
 * The learn labels in the interface language.
 *
 * One table for every host: the web shell and the universal app mount the
 * same cards, so the copy must not live in two places.
 */
const LEARN_STRINGS_ZH: LearnStrings = {
  label: {
    quiz: '选择题', flashcard: '知识卡片', practice: '练习', example: '例题', step: '分步',
    definition: '定义', theorem: '定理', proof: '证明', derivation: '推导', keyPoint: '要点',
  },
  quizMulti: '多选',
  quizSubmit: '提交答案',
  quizRetry: '再试一次',
  quizExplanation: '解析',
  quizAnswerIs: '正确答案：{answer}',
  quizCorrect: '答对了！',
  quizIncorrect: '不太对',
  readOnly: '仅供查看',
  flashcardAria: '闪卡 — 点击翻转',
  flashcardFront: '问题',
  flashcardBack: '答案',
  flashcardFlip: '翻面',
  flashcardFlipBack: '翻回问题',
  flashcardPrompt: '先在心里回答，再翻面。',
  flashcardRate: '记得吗？',
  rating: { good: '记得', fuzzy: '模糊', forgot: '忘了' },
  ratingNote: {
    good: '记住了，下次可以隔久一点再复习。',
    fuzzy: '有点模糊，过会儿再用自己的话讲一遍。',
    forgot: '没关系，先看答案，稍后再试一次。',
  },
  hintShow: '显示提示',
  hintNext: '下一条提示（{n}/{total}）',
  hintHide: '隐藏提示',
  hintLevel: '提示 {n}',
  solutionShow: '显示答案',
  solutionHide: '隐藏答案',
  answerPlaceholder: '输入你的答案…',
  answerSubmit: '提交',
  answerReveal: '查看答案',
  stepsStepMode: '逐步查看',
  stepsNext: '下一步（{n}/{total}）',
  stepsAll: '全部展开',
  proofShow: '展开证明',
  proofHide: '收起证明',
};

/** The learn labels for an interface language (`en` / `zh`). */
export function learnStrings(language: 'en' | 'zh' = 'en'): LearnStrings {
  return language === 'zh' ? LEARN_STRINGS_ZH : defaultLearnStrings;
}
