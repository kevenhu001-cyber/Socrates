/**
 * RN exam surface — shared types. The screen is a discriminated union so the
 * host decides which state is on screen; the panel only draws it. Same shape
 * as `study/DiagnosticPanel.tsx`: one command callback, copy already baked,
 * rich text handed back through a render slot.
 */
import type { ReactNode } from 'react';
import type {
  ExamAnswers, ExamDraft, ExamDraftPatch, ExamQuestion, ExamQuestionType, ExamResults,
} from '../examModel';

export type { ExamAnswers, ExamDraft, ExamDraftPatch, ExamQuestion, ExamQuestionType, ExamResults };

export interface ExamProviderOption {
  id: string;
  label: string;
}

/** DOM hooks the web host wants on the shared nodes; native ignores them. */
export interface ExamIds {
  topic?: string;
  instructions?: string;
  count?: string;
  modelTrigger?: string;
  questionsContainer?: string;
  /** Prefix for per-question ids: `examQ` → `examQ0`, `examQ1` … */
  questionCardPrefix?: string;
}

export type ExamScreen =
  | { kind: 'form'; draft: ExamDraft; providers: ExamProviderOption[] }
  | { kind: 'loading'; percent: number; message: string; step: string; subtitle: string }
  | { kind: 'empty'; message: string; detail?: string }
  | { kind: 'error'; message: string; detail?: string }
  | {
    kind: 'questions';
    questions: ExamQuestion[];
    answers: ExamAnswers;
    current: number;
    answered: number[];
    readOnly: boolean;
    /** Submit-gate message, already translated by the host. */
  }
  | { kind: 'results'; results: ExamResults };

export type ExamCommand =
  | 'generate' | 'cancel' | 'close' | 'form' | 'submit' | 'previous' | 'next' | 'jump';

export type ExamCommandHandler = (command: ExamCommand, index?: number) => void;

export type ExamTextPart = 'exam-q' | 'exam-option' | 'exam-explain' | 'exam-expected';

export type RenderExamText = (text: string, part: ExamTextPart) => ReactNode;

export interface ExamAction {
  command: ExamCommand;
  label: string;
  tone?: 'solid' | 'quiet';
}
