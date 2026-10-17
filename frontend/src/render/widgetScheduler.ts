import { processPendingMermaid, processPendingViz, processPendingVizActions } from './vizStubs.js';

export interface WidgetPlaceholder {
  id: string;
  parsed: unknown;
}

export interface WidgetMountLists {
  quizPH?: WidgetPlaceholder[];
  examplePH?: WidgetPlaceholder[];
  practicePH?: WidgetPlaceholder[];
  definitionPH?: WidgetPlaceholder[];
  stepPH?: WidgetPlaceholder[];
  flashcardPH?: WidgetPlaceholder[];
  derivationPH?: WidgetPlaceholder[];
  proofPH?: WidgetPlaceholder[];
  theoremPH?: WidgetPlaceholder[];
  keyPointPH?: WidgetPlaceholder[];
}

type WidgetsModule = typeof import('./widgets.js');

/* widgets.js (quiz/practice/example/… card mounts) stays out of the entry
 * chunk: the mount functions are only needed when a session actually
 * contains widget placeholders. The scheduler collects the placeholders
 * eagerly (they are produced inside formatMsg's synchronous HTML), then
 * pulls the chunk on the first non-empty pass and mounts everything that
 * accumulated while it was in flight. */
let _widgetsModule: WidgetsModule | null = null;
let _widgetsImport: Promise<WidgetsModule> | null = null;
let _widgetRuntimeConfig: unknown = null;

export function loadWidgets(): Promise<WidgetsModule> {
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
export function configureWidgetRuntimeEarly(cfg: unknown): void {
  _widgetRuntimeConfig = cfg;
  if (_widgetsModule) _widgetsModule.configureWidgetRuntime(cfg);
}

export function mountQuizWidget(slot: Element, parsed: unknown): unknown {
  if (_widgetsModule) return _widgetsModule.mountQuizWidget(slot, parsed);
  return loadWidgets().then(function (m) { return m.mountQuizWidget(slot, parsed); });
}

export function mountPracticeWidget(slot: Element, parsed: unknown): unknown {
  if (_widgetsModule) return _widgetsModule.mountPracticeWidget(slot, parsed);
  return loadWidgets().then(function (m) { return m.mountPracticeWidget(slot, parsed); });
}

export function handleQuizPick(
  card: unknown,
  options: unknown,
  feedback: unknown,
  buttons: unknown,
  picked: unknown,
  parsed: unknown,
): unknown {
  if (_widgetsModule) return _widgetsModule.handleQuizPick(card, options, feedback, buttons, picked, parsed);
  return loadWidgets().then(function (m) {
    return m.handleQuizPick(card, options, feedback, buttons, picked, parsed);
  });
}

function mountSlots(
  items: WidgetPlaceholder[],
  selector: string,
  mount: (slot: Element, parsed: unknown) => unknown,
): number {
  let mounted = 0;
  items.forEach((item) => {
    const slot = document.querySelector(`[${selector}="${item.id}"]`);
    if (slot) {
      mount(slot, item.parsed);
      mounted += 1;
    }
  });
  return mounted;
}

const _raf: (cb: () => void) => void = typeof requestAnimationFrame === 'function'
  ? function (cb) { requestAnimationFrame(cb); }
  : function (cb) { setTimeout(cb, 0); };

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
}: WidgetMountLists = {}): void {
  const total = quizPH.length + examplePH.length + practicePH.length + definitionPH.length
    + stepPH.length + flashcardPH.length + derivationPH.length
    + proofPH.length + theoremPH.length + keyPointPH.length;
  if (!total) return;

  let tries = 0;
  function attempt(): void {
    const widgets = _widgetsModule;
    if (!widgets) {
      /* Don't burn retries while the chunk is on the wire — retry once it lands. */
      loadWidgets().then(attempt);
      return;
    }
    tries += 1;
    let mounted = 0;
    mounted += mountSlots(quizPH, 'data-quiz-id', widgets.mountQuizWidget);
    mounted += mountSlots(examplePH, 'data-example-id', widgets.mountExampleWidget);
    mounted += mountSlots(practicePH, 'data-practice-id', widgets.mountPracticeWidget);
    mounted += mountSlots(definitionPH, 'data-definition-id', widgets.mountDefinitionWidget);
    if (stepPH.length) {
      const firstSlot = document.querySelector(`[data-step-id="${stepPH[0].id}"]`);
      /* The step list folds every <step> slot into the first one — only run
         the fold once the host actually exists, or the extras would be
         removed while the list itself never mounted. */
      if (firstSlot) {
        widgets.mountStepList(firstSlot, stepPH.map((step) => step.parsed));
        mounted += stepPH.length;
        stepPH.slice(1).forEach((item) => {
          const slot = document.querySelector(`[data-step-id="${item.id}"]`);
          if (slot) slot.remove();
        });
      }
    }
    mounted += mountSlots(flashcardPH, 'data-flashcard-id', widgets.mountFlashcardWidget);
    mounted += mountSlots(derivationPH, 'data-derivation-id', widgets.mountDerivationWidget);
    mounted += mountSlots(proofPH, 'data-proof-id', widgets.mountProofWidget);
    mounted += mountSlots(theoremPH, 'data-theorem-id', widgets.mountTheoremWidget);
    mounted += mountSlots(keyPointPH, 'data-key-point-id', widgets.mountKeyPointWidget);

    try { processPendingMermaid(); } catch { /* empty-catch: intentional — best-effort drain */ }
    try { processPendingViz(); } catch { /* empty-catch: intentional — best-effort drain */ }
    try { processPendingVizActions(); } catch { /* empty-catch: intentional — best-effort drain */ }

    if (mounted < total && tries < 4) _raf(attempt);
  }
  _raf(attempt);
}
