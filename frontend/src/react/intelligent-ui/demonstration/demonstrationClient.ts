import type { DemonstrationProgram } from '@socrates/core/demonstration';
import type {
  FrameInput,
  FrameOutput,
  Problem,
  ViewPatch,
  WorkerReply,
  WorkerRequest,
} from './demonstrationProtocol';

type Request = Omit<FrameInput, 'revision'>;
type Active =
  | { id: number; input: FrameInput; cancelled?: boolean }
  | { id: number; preset: Preset; revision: number };
type Preset = {
  index: number;
  finish: (values: Record<string, number> | null, problem?: Problem) => void;
};
type Receiver = { reply: (message: WorkerReply) => void; fail: (problem: Problem) => void };

let shared: Worker | undefined;
let nextCard = 0;
const receivers = new Map<number, Receiver>();

function openWorker() {
  if (shared) return shared;
  const worker = new Worker(new URL('./demonstration.worker.ts', import.meta.url), {
    type: 'module',
  });
  const fail = (detail: string) => {
    if (shared !== worker) return;
    shared = undefined;
    worker.terminate();
    const targets = [...receivers.values()];
    receivers.clear();
    for (const receiver of targets) receiver.fail({ message: detail, path: '' });
  };
  worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => receivers.get(data.card)?.reply(data);
  worker.onerror = (event) => fail(event.message || 'Demonstration worker could not run');
  worker.onmessageerror = () => fail('Demonstration worker returned an unreadable result');
  shared = worker;
  return worker;
}

export function connectDemonstration(
  program: DemonstrationProgram,
  onFrame: (frame: FrameOutput, input: FrameInput) => void,
  onError: (problem: Problem) => void,
) {
  const worker = openWorker();
  const card = ++nextCard;
  let active: Active | undefined;
  let desired: FrameInput | undefined;
  let completed: FrameInput | undefined;
  let revision = 0;
  let nextId = 0;
  let known: (ViewPatch['quality'] | null)[] = [];
  let queuedPreset: Preset | undefined;
  let closed = false;
  let animated = true;

  const send = (message: WorkerRequest) => worker.postMessage(message);
  const superseded = (input: FrameInput, newest: FrameInput) =>
    input.revision !== newest.revision ||
    (input.time !== newest.time && (!input.playing || !newest.playing)) ||
    (input.playing && !newest.playing);

  function pump() {
    if (closed || active || !desired) return;
    if (queuedPreset && completed?.revision === desired.revision) {
      const preset = queuedPreset;
      queuedPreset = undefined;
      active = { id: ++nextId, preset, revision: desired.revision };
      send({
        type: 'preset',
        card,
        id: active.id,
        revision: desired.revision,
        index: preset.index,
      });
      return;
    }
    if (
      completed &&
      completed.revision === desired.revision &&
      (!animated || completed.time === desired.time) &&
      completed.playing === desired.playing &&
      completed.preview === desired.preview
    )
      return;
    active = { id: ++nextId, input: desired };
    send({ type: 'frame', card, id: active.id, input: desired, known });
  }

  receivers.set(card, {
    reply(message) {
      if (!active || !desired || active.id !== message.id) return;
      const finished = active;
      active = undefined;
      if ('preset' in finished) {
        if (finished.revision === desired.revision)
          finished.preset.finish(
            message.type === 'preset' ? message.values : null,
            message.type === 'error' ? message.problem : undefined,
          );
      } else if (!finished.cancelled && !superseded(finished.input, desired)) {
        if (message.type === 'frame') {
          for (const patch of message.frame.patches) known[patch.index] = patch.quality;
          completed = finished.input;
          animated = message.frame.animated;
          onFrame(message.frame, finished.input);
        } else if (message.type === 'error') {
          const preset = queuedPreset;
          queuedPreset = undefined;
          preset?.finish(null, message.problem);
          completed = desired;
          animated = false;
          onError(message.problem);
        }
      }
      pump();
    },
    fail(problem) {
      closed = true;
      if (active && 'preset' in active) active.preset.finish(null, problem);
      queuedPreset?.finish(null, problem);
      onError(problem);
    },
  });
  send({ type: 'open', card, program });
  return {
    request(input: Request) {
      if (closed) return;
      if (desired?.values !== input.values) {
        revision++;
        known = [];
        queuedPreset = undefined;
      }
      desired = { ...input, revision };
      if (active && 'input' in active && !active.cancelled && superseded(active.input, desired)) {
        active.cancelled = true;
        send({ type: 'cancel', card });
      }
      pump();
    },
    preset(index: number, finish: Preset['finish']) {
      if (closed) return;
      queuedPreset = { index, finish };
      pump();
    },
    close() {
      if (closed) return;
      closed = true;
      receivers.delete(card);
      if (receivers.size) send({ type: 'close', card });
      else {
        worker.terminate();
        shared = undefined;
      }
    },
  };
}
