export const LEARNING_KINDS: readonly ['quiz','practice','definition','flashcard','example','theorem','proof','derivation','key-point','step'];
export type LearningUiKind = typeof LEARNING_KINDS[number];
export interface LearningUiOption { letter: string; text: string; explanation?: string }
/** Only treat as this type after learningUiIssues returns no issues. */
export interface LearningUiNode {
 id: string; type:'learning'; kind:LearningUiKind; parent?:string;
 title?:string; q?:string; options?:LearningUiOption[]; correct?:string; multi?:boolean; graded?:boolean; explanation?:string;
 problem?:string; solution?:string; hint?:string; hints?:string[];
 term?:string; body?:string; front?:string; back?:string; statement?:string; n?:number;
}
export function normalizeLearningUiNode(input: unknown): unknown;
export function learningUiIssues(input: unknown): Array<{path:string;message:string}>;
/** OpenUI component names that only exist because the model wanted a learning card. */
export const LEARNING_UI_MISUSE_COMPONENTS: readonly string[];
/** The learning component names an OpenUI inspection complained about. */
export function openUiLearningMisuse(issues: unknown): string[];
export const LEARNING_UI_GUIDANCE: string;
