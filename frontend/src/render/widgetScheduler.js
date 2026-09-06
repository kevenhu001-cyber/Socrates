import {
  mountExampleWidget,
  mountDefinitionWidget,
  mountStepList,
  mountFlashcardWidget,
  mountTheoremWidget,
  mountProofWidget,
  mountDerivationWidget,
  mountKeyPointWidget,
  mountPracticeWidget,
  mountQuizWidget,
} from './widgets.js';
import { processPendingMermaid, processPendingViz, processPendingVizActions } from './viz.js';

function mountSlots(items, selector, mount) {
  items.forEach((item) => {
    const slot = document.querySelector(`[${selector}="${item.id}"]`);
    if (slot) mount(slot, item.parsed);
  });
}

/**
 * Mount interactive widgets after their rendered HTML has entered the DOM.
 *
 * Each list holds {id, parsed} placeholder entries collected while scanning
 * the markdown; the DOM mount is deferred so the formatMsg output lands first.
 *
 * @param {object} mounts placeholder lists keyed by widget kind.
 * @param {Array<{id: string, parsed: unknown}>} [mounts.quizPH]
 * @param {Array<{id: string, parsed: unknown}>} [mounts.examplePH]
 * @param {Array<{id: string, parsed: unknown}>} [mounts.practicePH]
 * @param {Array<{id: string, parsed: unknown}>} [mounts.definitionPH]
 * @param {Array<{id: string, parsed: unknown}>} [mounts.stepPH]
 * @param {Array<{id: string, parsed: unknown}>} [mounts.flashcardPH]
 * @param {Array<{id: string, parsed: unknown}>} [mounts.derivationPH]
 * @param {Array<{id: string, parsed: unknown}>} [mounts.proofPH]
 * @param {Array<{id: string, parsed: unknown}>} [mounts.theoremPH]
 * @param {Array<{id: string, parsed: unknown}>} [mounts.keyPointPH]
 */
export function scheduleWidgetMounts({
  quizPH = [],
  examplePH = [],
  practicePH = [],
  definitionPH = [],
  stepPH = [],
  flashcardPH = [],
  derivationPH = [],
  proofPH = [],
  theoremPH = [],
  keyPointPH = [],
}) {
  if (!quizPH.length && !examplePH.length && !practicePH.length && !definitionPH.length
      && !stepPH.length && !flashcardPH.length && !derivationPH.length
      && !proofPH.length && !theoremPH.length && !keyPointPH.length) return;

  setTimeout(() => {
    mountSlots(quizPH, 'data-quiz-id', mountQuizWidget);
    mountSlots(examplePH, 'data-example-id', mountExampleWidget);
    mountSlots(practicePH, 'data-practice-id', mountPracticeWidget);
    mountSlots(definitionPH, 'data-definition-id', mountDefinitionWidget);

    if (stepPH.length) {
      const firstSlot = document.querySelector(`[data-step-id="${stepPH[0].id}"]`);
      if (firstSlot) mountStepList(firstSlot, stepPH.map((step) => step.parsed));
      stepPH.slice(1).forEach((item) => {
        const slot = document.querySelector(`[data-step-id="${item.id}"]`);
        if (slot) slot.remove();
      });
    }

    mountSlots(flashcardPH, 'data-flashcard-id', mountFlashcardWidget);
    mountSlots(derivationPH, 'data-derivation-id', mountDerivationWidget);
    mountSlots(proofPH, 'data-proof-id', mountProofWidget);
    mountSlots(theoremPH, 'data-theorem-id', mountTheoremWidget);
    mountSlots(keyPointPH, 'data-key-point-id', mountKeyPointWidget);

    try { processPendingMermaid(); } catch (_) {}
    try { processPendingViz(); } catch (_) {}
    try { processPendingVizActions(); } catch (_) {}
  }, 0);
}
