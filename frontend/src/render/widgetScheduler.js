import { processPendingMermaid, processPendingViz, processPendingVizActions } from './vizStubs.js';

/* widgets.js (quiz/practice/example/… card mounts) stays out of the entry
 * chunk: the mount functions are only needed when a session actually
 * contains widget placeholders. The scheduler collects the placeholders
 * eagerly (they are produced inside formatMsg's synchronous HTML), then
 * pulls the chunk on the first non-empty pass and mounts everything that
 * accumulated while it was in flight. */
var _widgetsModule = null;
var _widgetsImport = null;
var _widgetRuntimeConfig = null;

export function loadWidgets() {
  if (!_widgetsImport) {
    _widgetsImport = import('./widgets.js').then(function (m) {
      _widgetsModule = m;
      if (_widgetRuntimeConfig) m.configureWidgetRuntime(_widgetRuntimeConfig);
      return m;
    });
    _widgetsImport.catch(function (err) {
      _widgetsImport = null;
      console.error('[widgets] failed to load', err);
    });
  }
  return _widgetsImport;
}

/* widgetSetup hands over the dependency bag at boot; widgets.js reads it
 * lazily, so the config is stashed here and applied once the chunk lands
 * (or immediately when it is already warm). */
export function configureWidgetRuntimeEarly(cfg) {
  _widgetRuntimeConfig = cfg;
  if (_widgetsModule) _widgetsModule.configureWidgetRuntime(cfg);
}

export function mountQuizWidget(slot, parsed) {
  if (_widgetsModule) return _widgetsModule.mountQuizWidget(slot, parsed);
  return loadWidgets().then(function (m) { return m.mountQuizWidget(slot, parsed); });
}

export function mountPracticeWidget(slot, parsed) {
  if (_widgetsModule) return _widgetsModule.mountPracticeWidget(slot, parsed);
  return loadWidgets().then(function (m) { return m.mountPracticeWidget(slot, parsed); });
}

export function handleQuizPick(card, options, feedback, buttons, picked, parsed) {
  if (_widgetsModule) return _widgetsModule.handleQuizPick(card, options, feedback, buttons, picked, parsed);
  return loadWidgets().then(function (m) {
    return m.handleQuizPick(card, options, feedback, buttons, picked, parsed);
  });
}

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
    if (!_widgetsModule) {
      /* Don't burn retries while the chunk is on the wire — retry once it lands. */
      loadWidgets().then(attempt);
      return;
    }
    tries += 1;
    var mounted = 0;
    mounted += mountSlots(quizPH, 'data-quiz-id', _widgetsModule.mountQuizWidget);
    mounted += mountSlots(examplePH, 'data-example-id', _widgetsModule.mountExampleWidget);
    mounted += mountSlots(practicePH, 'data-practice-id', _widgetsModule.mountPracticeWidget);
    mounted += mountSlots(definitionPH, 'data-definition-id', _widgetsModule.mountDefinitionWidget);
    if (stepPH.length) {
      const firstSlot = document.querySelector(`[data-step-id="${stepPH[0].id}"]`);
      /* The step list folds every <step> slot into the first one — only run
         the fold once the host actually exists, or the extras would be
         removed while the list itself never mounted. */
      if (firstSlot) {
        _widgetsModule.mountStepList(firstSlot, stepPH.map((step) => step.parsed));
        mounted += stepPH.length;
        stepPH.slice(1).forEach((item) => {
          const slot = document.querySelector(`[data-step-id="${item.id}"]`);
          if (slot) slot.remove();
        });
      }
    }
    mounted += mountSlots(flashcardPH, 'data-flashcard-id', _widgetsModule.mountFlashcardWidget);
    mounted += mountSlots(derivationPH, 'data-derivation-id', _widgetsModule.mountDerivationWidget);
    mounted += mountSlots(proofPH, 'data-proof-id', _widgetsModule.mountProofWidget);
    mounted += mountSlots(theoremPH, 'data-theorem-id', _widgetsModule.mountTheoremWidget);
    mounted += mountSlots(keyPointPH, 'data-key-point-id', _widgetsModule.mountKeyPointWidget);

    try { processPendingMermaid(); } catch (_) {}
    try { processPendingViz(); } catch (_) {}
    try { processPendingVizActions(); } catch (_) {}

    if (mounted < total && tries < 4) _raf(attempt);
  }
  _raf(attempt);
}
