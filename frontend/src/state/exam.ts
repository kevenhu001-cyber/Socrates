import type { ExamQuestion } from '../exam/types.ts';

export type ExamFormDraft = {
  topic: string;
  instructions: string;
  count: number;
  model: string;
  difficulty: string;
  selectedTypes: { mc: boolean; fb: boolean; sa: boolean };
};

export type ExamViewMode = 'form' | 'loading' | 'provider-required' | 'error' | 'cancelled' | 'questions';

export type ExamProgress = {
  index: number;
  total: number;
  step: 'preparing' | 'generating' | 'failed' | 'parse-failed' | 'finishing';
};

export function createExamFormDraft(overrides: Partial<ExamFormDraft> = {}): ExamFormDraft {
  const defaults: ExamFormDraft = {
    topic: '',
    instructions: '',
    count: 5,
    model: '',
    difficulty: 'intermediate',
    selectedTypes: { mc: true, fb: true, sa: false },
  };
  return {
    ...defaults,
    ...overrides,
    selectedTypes: { ...defaults.selectedTypes, ...overrides.selectedTypes },
  };
}

export function createInitialExamState() {
  return {
    examCancel: false,
    examQuestions: [] as ExamQuestion[],
    examAnswers: {} as Record<string, string | number | undefined>,
    examSubmitted: false,
    examTopic: '',
    examCount: 0,
    examReadOnly: false,
    examLang: '',
    examDifficulty: 'intermediate',
    examInstructions: '',
    examTypes: [] as string[],
    _examPrevActiveId: null as string | null,
    examViewMode: 'form' as ExamViewMode,
    examFormDraft: createExamFormDraft(),
    examProgress: { index: 0, total: 1, step: 'preparing' } as ExamProgress,
    examStatusMessage: '',
    examStatusDetail: '',
    examLocaleRevision: 0,
  };
}

export type ExamState = ReturnType<typeof createInitialExamState>;
