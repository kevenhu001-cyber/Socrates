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
  var mounted = 0;
  items.forEach((item) => {
    const slot = document.querySelector(`[${selector}="${item.id}"]`);
    if (slot) {
      mount(slot, item.parsed);
      mounted += 1;
    }
  });
  return mounted;
}

var _raf = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : function (cb) { return setTimeout(cb, 0); };

/**
 * Mount interactive widgets after their rendered HTML has entered the DOM.
 *
 * Each list holds {id, parsed} placeholder entries collected while scanning
 * the markdown; the DOM mount is deferred so the formatMsg output lands first.
 *
 * Mounting runs on the next animation frame rather than setTimeout(0): the
 * React commit that inserts the slot divs lands before the frame's paint, so
 * the widget mounts in the same frame the slot becomes visible — no empty
 * "slot for a beat, widget pops in later" flash at stream finish. If the
 * commit is delayed past the first frame, a bounded retry catches it.
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
  const total = quizPH.length + examplePH.length + practicePH.length + definitionPH.length
    + stepPH.length + flashcardPH.length + derivationPH.length
    + proofPH.length + theoremPH.length + keyPointPH.length;
  if (!total) return;

  var tries = 0;
  function attempt() {
    tries += 1;
    var mounted = 0;
    mounted += mountSlots(quizPH, 'data-quiz-id', mountQuizWidget);
    mounted += mountSlots(examplePH, 'data-example-id', mountExampleWidget);
    mounted += mountSlots(practicePH, 'data-practice-id', mountPracticeWidget);
    mounted += mountSlots(definitionPH, 'data-definition-id', mountDefinitionWidget);

    if (stepPH.length) {
      const firstSlot = document.querySelector(`[data-step-id="${stepPH[0].id}"]`);
      /* The step list folds every <step> slot into the first one — only run
         the fold once the host actually exists, or the extras would be
         removed while the list itself never mounted. */
      if (firstSlot) {
        mountStepList(firstSlot, stepPH.map((step) => step.parsed));
        mounted += stepPH.length;
        stepPH.slice(1).forEach((item) => {
          const slot = document.querySelector(`[data-step-id="${item.id}"]`);
          if (slot) slot.remove();
        });
      }
    }

    mounted += mountSlots(flashcardPH, 'data-flashcard-id', mountFlashcardWidget);
    mounted += mountSlots(derivationPH, 'data-derivation-id', mountDerivationWidget);
    mounted += mountSlots(proofPH, 'data-proof-id', mountProofWidget);
    mounted += mountSlots(theoremPH, 'data-theorem-id', mountTheoremWidget);
    mounted += mountSlots(keyPointPH, 'data-key-point-id', mountKeyPointWidget);

    try { processPendingMermaid(); } catch (_) {}
    try { processPendingViz(); } catch (_) {}
    try { processPendingVizActions(); } catch (_) {}

    if (mounted < total && tries < 4) _raf(attempt);
  }
  _raf(attempt);
}
