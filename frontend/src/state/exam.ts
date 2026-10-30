import type { ExamQuestion } from '../exam/types.ts';

export function createInitialExamState() {
  return {
    examCancel: false,
    examQuestions: [] as ExamQuestion[],
    examAnswers: {} as Record<string, string | number | undefined>,
    examSubmitted: false,
    examTopic: '',
    examCount: 0,
    _examScrollBound: false,
    examReadOnly: false,
    examLang: '',
    examDifficulty: 'intermediate',
    examInstructions: '',
    examTypes: [] as string[],
    _examPrevActiveId: null,
  };
}

export type ExamState = ReturnType<typeof createInitialExamState>;
