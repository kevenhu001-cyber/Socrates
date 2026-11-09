import { openUiLearningMisuse } from '@socrates/core';

export interface OpenUiRepairInput {
  /** The problems the client saw, already joined into one line. */
  problems: string;
  /** The program's own issue list, used to spot a hallucinated component. */
  issues?: readonly string[];
  source: string;
  state: string;
}

const OPENUI_WIRING_ADVICE = ' Every enabled Button needs an explicit action, inputs bind to declared $state, and outputs must update locally. Preserve the requested tool and connect its inputs, actions and results. Use local actions for deterministic calculations, filtering and list edits; use @ToAssistant only for explicitly requesting assistant work.';

const LEARNING_CONTRACT_ADVICE = ' The program calls {components}, which is not an OpenUI component. Render the card as a native learning node instead: {id,type:"learning",kind:"quiz",q:"Question",options:[{letter:"A",text:"First",explanation:"Why"},{letter:"B",text:"Second",explanation:"Why"}],correct:"A"}. Other kinds: practice needs problem; definition needs body; flashcard needs front/back. Never invent an answer.';

/**
 * The model-facing repair prompt for a broken OpenUI view.
 *
 * A hallucinated learning component is not a wiring problem: the generic
 * advice would send the model back into chart/program repair, so it gets the
 * learning contract instead.
 */
export function buildOpenUiRepairPrompt({ problems, issues = [], source, state }: OpenUiRepairInput): string {
  const misuse = openUiLearningMisuse(issues);
  const advice = misuse.length
    ? LEARNING_CONTRACT_ADVICE.replace('{components}', misuse.join(', '))
    : OPENUI_WIRING_ADVICE;
  return `Repair this OpenUI view with render_intelligent_ui. Problems: ${problems}.${advice}\n\n${source}\n\nCurrent local state: ${state}`;
}
