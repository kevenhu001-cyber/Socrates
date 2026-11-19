import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { DemonstrationProgram, DemonstrationWarning } from '@socrates/core/demonstration';
import { connectDemonstration } from './demonstrationClient';
import { errorMessage } from './sampleField';
import type { Problem, ViewSample } from './demonstrationProtocol';

export function useDemonstrationVisibility(host: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let intersecting = typeof IntersectionObserver !== 'function';
    const update = () => setVisible(intersecting && !document.hidden);
    const observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(([entry]) => {
            intersecting = Boolean(entry?.isIntersecting);
            update();
          })
        : undefined;
    if (host.current) observer?.observe(host.current);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [host]);
  return visible;
}

type Snapshot = {
  program: DemonstrationProgram;
  values: Record<string, number>;
  duration: number;
  time: number;
  playing: boolean;
  animated: boolean;
  warnings: DemonstrationWarning[];
  views: (ViewSample | undefined)[];
  preview: boolean;
};
type Failure = { program: DemonstrationProgram; problem: Problem };

export function useDemonstrationFrames(
  program: DemonstrationProgram | null,
  visible: boolean,
  values: Record<string, number>,
  time: number,
  playing: boolean,
  preview: boolean,
) {
  const connection = useRef<ReturnType<typeof connectDemonstration> | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [failure, setFailure] = useState<Failure>();
  useEffect(() => {
    if (!program || !visible) return;
    const onError = (problem: Problem) => setFailure({ program, problem });
    try {
      const client = connectDemonstration(
        program,
        (frame, input) => {
          setFailure(undefined);
          setSnapshot((previous) => {
            const views = previous?.program === program ? previous.views.slice() : [];
            for (const { index, result } of frame.patches) views[index] = result;
            return {
              program,
              values: input.values,
              time: Math.min(input.time, frame.duration),
              playing: input.playing,
              animated: frame.animated,
              duration: frame.duration,
              warnings: frame.warnings,
              views,
              preview: input.preview,
            };
          });
        },
        onError,
      );
      connection.current = client;
      return () => {
        connection.current = null;
        client.close();
      };
    } catch (error) {
      onError({ message: errorMessage(error), path: '' });
    }
  }, [program, visible]);

  const current = snapshot?.program === program ? snapshot : undefined;
  const ready =
    current?.values === values &&
    !current.preview &&
    (playing ||
      (!current.playing &&
        (!current.animated || current.time === Math.min(time, current.duration))));
  useEffect(() => {
    connection.current?.request({ values, time, playing, preview });
  }, [program, visible, values, time, playing, preview]);

  const preset = useCallback(
    (index: number, finish: (values: Record<string, number> | null, problem?: Problem) => void) =>
      connection.current?.preset(index, finish),
    [],
  );
  return {
    snapshot: current,
    ready,
    problem: failure?.program === program ? failure?.problem : undefined,
    preset,
  };
}
