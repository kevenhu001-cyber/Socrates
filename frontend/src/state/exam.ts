export const EXAM_FLAT_KEYS = {
  examCancel: 'cancel',
  examQuestions: 'questions',
  examAnswers: 'answers',
  examSubmitted: 'submitted',
  examTopic: 'topic',
  examCount: 'count',
  _examScrollBound: '_examScrollBound',
  examReadOnly: 'readOnly',
  examLang: 'lang',
  examDifficulty: 'difficulty',
  examInstructions: 'instructions',
  examTypes: 'types',
  _examPrevActiveId: '_examPrevActiveId',
} as const;

export function createInitialExamState() {
  return {
    cancel: false,
    questions: [],
    answers: {},
    submitted: false,
    topic: '',
    count: 0,
    _examScrollBound: false,
    readOnly: false,
    lang: '',
    difficulty: 'intermediate',
    instructions: '',
    types: [],
    _examPrevActiveId: null,
  };
}

export type ExamState = ReturnType<typeof createInitialExamState>;
