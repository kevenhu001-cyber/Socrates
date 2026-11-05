/**
 * The six live teaching stages the tutor header reports. Pure data keeps
 * the top bar aligned with the session state machine without loading the
 * lesson runtime into the first paint.
 */
export interface SocraticStage {
  readonly id: string;
  readonly step: number;
  readonly labelKey: string;
  readonly defaultLabel: string;
}

export const SOCRATIC_STAGES: readonly SocraticStage[] = [
  { id: 'motivate', step: 1, labelKey: 'tutor.stageMotivate', defaultLabel: '建立直觉' },
  { id: 'define', step: 2, labelKey: 'tutor.stageDefine', defaultLabel: '精确定义' },
  { id: 'develop', step: 3, labelKey: 'tutor.stageDevelop', defaultLabel: '深入推导' },
  { id: 'illustrate', step: 4, labelKey: 'tutor.stageIllustrate', defaultLabel: '应用示例' },
  { id: 'exercise', step: 5, labelKey: 'tutor.stageExercise', defaultLabel: '动手练习' },
  { id: 'check', step: 6, labelKey: 'tutor.stageCheck', defaultLabel: '阶段检查' },
];

/** Read the live teaching state; turn count is not evidence of lesson progress. */
export function getActiveSocraticStage(teachingStage: string | null | undefined): SocraticStage {
  return SOCRATIC_STAGES.find((stage) => stage.id === teachingStage) || SOCRATIC_STAGES[0];
}

/** Remove an optional numeric prefix when the progress counter states the step. */
export function stageName(label: string): string {
  return label.replace(/^\s*\d+\s*[.、．]\s*/, '');
}
