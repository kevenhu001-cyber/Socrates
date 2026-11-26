import { compileDemonstrationRuntime } from '@socrates/core/demonstration';
import type {
  DemonstrationProgram,
  DemonstrationRuntime,
  DemonstrationView,
} from '@socrates/core/demonstration';
import { errorMessage, fieldExpressions } from './fieldCommon';
import { sampleField } from './sampleField';
import { plotExpressions, samplePlot, type PlotCache } from './samplePlot';
import { sampleScene, sceneExpressions } from './sampleScene';
import type { ViewPatch, ViewSample, WorkerReply, WorkerRequest } from './demonstrationProtocol';

type JobRequest = Extract<WorkerRequest, { id: number }>;
type Job = { request: JobRequest; work: Generator<void, WorkerReply, void> };
type State = {
  runtime: DemonstrationRuntime;
  revision: number;
  staticViews: boolean[];
  curves: Map<number, PlotCache>;
  slowViews: Set<number>;
};
type Card = {
  program: DemonstrationProgram;
  prepare?: ReturnType<typeof compileDemonstrationRuntime>;
  state?: State;
  job?: Job;
};
const cards = new Map<number, Card>();
const pending = new Map<number, Job>();
let timer: ReturnType<typeof setTimeout> | undefined;

function expressions(view: DemonstrationView) {
  switch (view.kind) {
    case 'field':
      return fieldExpressions(view);
    case 'plot':
    case 'trajectory':
      return plotExpressions(view);
    case 'scene':
      return sceneExpressions(view);
    case 'metrics':
      return view.values.map((value) => value.expression);
    case 'controls':
      return [];
  }
}

function* sampleView(
  view: Exclude<DemonstrationView, { kind: 'controls' }>,
  state: State,
  time: number,
  preview: boolean,
  index: number,
): Generator<void, ViewSample, void> {
  const { runtime } = state;
  switch (view.kind) {
    case 'field':
      return { kind: 'field', sample: yield* sampleField(view, runtime, time, preview) };
    case 'plot':
    case 'trajectory': {
      let cache = state.curves.get(index);
      if (!cache) state.curves.set(index, (cache = new Map()));
      return { kind: view.kind, sample: yield* samplePlot(view, runtime, time, preview, cache) };
    }
    case 'scene':
      return { kind: 'scene', sample: yield* sampleScene(view, runtime, time) };
    case 'metrics': {
      runtime.resetBudget();
      const sample = [];
      for (const value of view.values) {
        try {
          sample.push(runtime.evaluate(value.expression, time));
        } catch {
          sample.push(Number.NaN);
        }
        yield;
      }
      return { kind: 'metrics', sample };
    }
  }
}

function calculatePreset(
  card: Card,
  request: Extract<JobRequest, { type: 'preset' }>,
  reply: { card: number; id: number },
): WorkerReply {
  const state = card.state;
  const preset = card.program.presets?.[request.index];
  if (!state || state.revision !== request.revision || !preset)
    return { ...reply, type: 'cancelled' };
  const runtime = state.runtime;
  runtime.resetBudget();
  const values = Object.fromEntries(
    Object.entries(preset.values).map(([key, expression]) => {
      const value = runtime.evaluate(expression);
      const parameter = card.program.parameters?.find((item) => item.id === key);
      if (!parameter || !Number.isFinite(value) || value < parameter.min || value > parameter.max)
        throw Error(`Preset ${key}: value must be finite and within its parameter range`);
      return [key, value];
    }),
  );
  return { ...reply, type: 'preset', values };
}

function* ensureCardState(
  card: Card,
  input: Extract<JobRequest, { type: 'frame' }>['input'],
): Generator<void, NonNullable<Card['state']>, void> {
  let state = card.state;
  if (!state || state.revision !== input.revision) {
    card.prepare ??= compileDemonstrationRuntime(card.program);
    const runtime = yield* card.prepare(input.values);
    state = {
      runtime,
      revision: input.revision,
      staticViews: card.program.views.map(
        (view) => !expressions(view).some((expression) => runtime.dependencies(expression) & 4),
      ),
      curves: new Map(),
      slowViews: new Set(),
    };
    card.state = state;
  }
  return state;
}

function* sampleViewWithTiming(
  view: Exclude<Card['program']['views'][number], { kind: 'controls' }>,
  state: NonNullable<Card['state']>,
  time: number,
  preview: boolean,
  index: number,
): Generator<void, ViewSample, void> {
  try {
    const iterator = sampleView(view, state, time, preview, index);
    let elapsed = 0;
    for (;;) {
      const started = performance.now();
      const step = iterator.next();
      elapsed += performance.now() - started;
      if (step.done) {
        if (!preview && elapsed > 24) state.slowViews.add(index);
        return step.value;
      }
      yield;
    }
  } catch (error) {
    return { kind: 'error', problem: errorMessage(error) };
  }
}

function* calculate(card: Card, request: JobRequest): Generator<void, WorkerReply, void> {
  const reply = { card: request.card, id: request.id };
  if (request.type === 'preset') {
    return calculatePreset(card, request, reply);
  }

  const { input, known } = request;
  const state = yield* ensureCardState(card, input);
  const patches: ViewPatch[] = [];
  const { duration, warnings, diagnostics } = state.runtime;
  const time = Math.min(duration, input.time);
  for (const [index, view] of card.program.views.entries()) {
    if (view.kind === 'controls') continue;
    const coarse = view.kind === 'field' || view.kind === 'plot' || view.kind === 'trajectory';
    const fixed = state.staticViews[index];
    const preview =
      coarse && (input.preview || (input.playing && !fixed && state.slowViews.has(index)));
    const quality = preview ? 'preview' : 'full';
    if (fixed && (known[index] === 'full' || known[index] === quality)) continue;
    const result = yield* sampleViewWithTiming(view, state, time, preview, index);
    patches.push({ index, result, quality });
    yield;
  }
  return {
    ...reply,
    type: 'frame',
    frame: { duration, warnings, diagnostics: card.program.diagnostics ? diagnostics : undefined, patches, animated: state.staticViews.includes(false) },
  };
}

function reply(message: WorkerReply) {
  const buffers =
    message.type === 'frame'
      ? message.frame.patches.flatMap(({ result }) =>
          result.kind === 'field' ? [result.sample.pixels] : [],
        )
      : [];
  self.postMessage(message, { transfer: buffers });
}

function schedule() {
  if (timer === undefined && pending.size) timer = setTimeout(tick, 0);
}

// A card gets one slice, then goes to the back of the queue. Yielding to
// the worker event loop also lets cancellation cut short a grid or RK4 run.
function tick() {
  timer = undefined;
  const next = pending.entries().next();
  if (next.done) return;
  const [id, job] = next.value;
  pending.delete(id);
  const card = cards.get(id);
  if (!card) return schedule();
  const deadline = performance.now() + 8;
  try {
    do {
      const step = job.work.next();
      if (step.done) {
        card.job = undefined;
        reply(step.value);
        return;
      }
    } while (performance.now() < deadline);
    pending.set(id, job);
  } catch (error) {
    card.job = undefined;
    const path = (error as { path?: unknown } | null)?.path;
    reply({
      type: 'error',
      card: id,
      id: job.request.id,
      problem: { message: errorMessage(error), path: typeof path === 'string' ? path : '' },
    });
  } finally {
    schedule();
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const id = request.card;
  if (request.type === 'open') {
    cards.set(id, { program: request.program });
    return;
  }
  const card = cards.get(id);
  if (!card) return;
  if (request.type === 'close' || request.type === 'cancel') {
    pending.delete(id);
    if (request.type === 'close') cards.delete(id);
    else if (card.job) reply({ type: 'cancelled', card: id, id: card.job.request.id });
    card.job = undefined;
    if (!pending.size && timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    return;
  }
  if (request.type === 'frame' || request.type === 'preset') {
    const job = { request, work: calculate(card, request) };
    card.job = job;
    pending.set(id, job);
    schedule();
  }
});
