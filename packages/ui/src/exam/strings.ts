/**
 * Exam surface copy. Hosts translate; the English table keeps native builds
 * and tests readable. Function entries take the numbers the surface knows.
 */
import type { ExamQuestionType } from '../examModel';

export interface ExamTypeCardCopy {
  title: string;
  hint: string;
}

export interface ExamSetupStrings {
  eyebrow: string;
  heroTitle: string;
  heroDescription: string;
  topic: string;
  topicHelp: string;
  topicPlaceholder: string;
  settings: string;
  settingsHelp: string;
  model: string;
  modelPlaceholder: string;
  noModels: string;
  difficulty: string;
  count: string;
  fewer: string;
  more: string;
  types: string;
  typesHelp: string;
  typeCards: Record<'mc' | 'fb' | 'sa', ExamTypeCardCopy>;
  instructions: string;
  instructionsHelp: string;
  instructionsPlaceholder: string;
  difficulties: Record<string, string>;
}

export interface ExamQuestionStrings {
  number(n: number, total: number): string;
  type: Record<ExamQuestionType, string>;
  answerLabel(n: number): string;
  answerPlaceholder: string;
  missing: string;
}

export interface ExamNavStrings {
  previous: string;
  next: string;
  answered: string;
}

export interface ExamStrings {
  setup: ExamSetupStrings;
  questions: ExamQuestionStrings;
  nav: ExamNavStrings;
}

export const defaultExamStrings: ExamStrings = {
  setup: {
    eyebrow: 'Assessment studio',
    heroTitle: 'Build a focused practice exam',
    heroDescription: 'Choose the scope and challenge. Socrates will compose a balanced paper you can complete at your own pace.',
    topic: 'Topic',
    topicHelp: 'Name the subject or learning objective',
    topicPlaceholder: 'e.g. Linear Algebra, World War II...',
    settings: 'Paper settings',
    settingsHelp: 'Select the model, difficulty, and length',
    model: 'Model',
    modelPlaceholder: 'Select a model',
    noModels: 'No models available',
    difficulty: 'Difficulty',
    count: 'Questions',
    fewer: 'Fewer',
    more: 'More',
    types: 'Question types',
    typesHelp: 'Keep at least one response format',
    typeCards: {
      mc: { title: 'Multiple choice', hint: 'Choose one answer' },
      fb: { title: 'Fill blank', hint: 'Recall key terms' },
      sa: { title: 'Short answer', hint: 'Explain your reasoning' },
    },
    instructions: 'Instructions',
    instructionsHelp: 'Optional constraints for the examiner',
    instructionsPlaceholder: 'Specific topics to cover, or leave blank...',
    difficulties: {
      beginner: 'Beginner',
      intermediate: 'Intermediate',
      hard: 'Hard',
      expert: 'Expert',
    },
  },
  questions: {
    number: (n, total) => `Question ${n} / ${total}`,
    type: {
      'multiple-choice': 'Multiple choice',
      'fill-blank': 'Fill blank',
      'short-answer': 'Short answer',
    },
    answerLabel: (n) => `Answer for question ${n}`,
    answerPlaceholder: 'Type your answer…',
    missing: 'Answer every question before submitting.',
  },
  nav: {
    previous: 'Previous question',
    next: 'Next question',
    answered: 'answered',
  },
};
