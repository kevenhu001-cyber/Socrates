export type ExamQuestionType = 'multiple-choice' | 'fill-blank' | 'short-answer' | 'error';

export interface ExamQuestion {
 q: string;
 type: ExamQuestionType;
 explanation?: string;
 opts?: { letter?: string; text?: string | null }[];
 answer?: string | number;
 answers?: string[];
 _idx?: number;
 [key: string]: unknown;
}
export interface QuestionContext {
 topic: string; difficulty: string; lang: string; total: number; instructions: string;
 allowedTypes: string[];
}
export type QuestionSelection = Partial<Record<'mc' | 'fb' | 'sa', boolean>>;
