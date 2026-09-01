export function createInitialExamState() {
  return {
    examCancel: false,
    examQuestions: [],
    examAnswers: {},
    examSubmitted: false,
    examTopic: '',
    examCount: 0,
    _examScrollBound: false,
    examReadOnly: false,
    examLang: '',
    examDifficulty: 'intermediate',
    examInstructions: '',
    examTypes: [],
    _examPrevActiveId: null,
  };
}

export type ExamState = ReturnType<typeof createInitialExamState>;
