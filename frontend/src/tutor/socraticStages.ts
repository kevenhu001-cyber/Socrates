/**
 * The four Socratic stages the tutor header reports. Pure data, so the top
 * bar can derive the stage from the session store without loading the
 * tutor runtime (socraticMastery.ts) into the first paint.
 */
export interface SocraticStage {
  readonly step: number;
  readonly labelKey: string;
  readonly defaultLabel: string;
}

export const SOCRATIC_STAGES: readonly SocraticStage[] = [
  { step: 1, labelKey: 'tutor.mastery.step1', defaultLabel: '1. 探索提问' },
  { step: 2, labelKey: 'tutor.mastery.step2', defaultLabel: '2. 反思辨析' },
  { step: 3, labelKey: 'tutor.mastery.step3', defaultLabel: '3. 归纳洞察' },
  { step: 4, labelKey: 'tutor.mastery.step4', defaultLabel: '4. 融会贯通' },
];

export function getActiveSocraticStage(turnCount: number): SocraticStage {
  if (turnCount <= 2) return SOCRATIC_STAGES[0];
  if (turnCount <= 4) return SOCRATIC_STAGES[1];
  if (turnCount <= 6) return SOCRATIC_STAGES[2];
  return SOCRATIC_STAGES[3];
}

/** "1. 探索提问" → "探索提问": the header states the number separately. */
export function stageName(label: string): string {
  return label.replace(/^\s*\d+\s*[.、．]\s*/, '');
}
