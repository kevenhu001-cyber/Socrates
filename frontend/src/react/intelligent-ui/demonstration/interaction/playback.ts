import { useCallback, useEffect, useRef, useState } from 'react';
import type { DemonstrationProgram } from '@socrates/core/demonstration';

export function usePlayback(program: DemonstrationProgram | null, visible: boolean) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReduced(media.matches);
      if (media.matches) setPlaying(false);
    };
    update();
    setTime(0);
    setPlaying(!media.matches && Boolean(program?.dynamics?.duration || program?.duration));
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [program]);
  const play = useCallback(
    (duration: number) => {
      if (!playing || !visible || reduced || duration <= 0) return;
      let frame = 0;
      let previous = performance.now();
      const tick = (now: number) => {
        if (now - previous >= 50) {
          const delta = Math.min(0.1, (now - previous) / 1000);
          previous = now;
          setTime((value) => Math.min(duration, value + delta));
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    },
    [playing, visible, reduced],
  );
  return { time, setTime, playing, setPlaying, reduced, play };
}

export function usePreview(visible: boolean) {
  const [preview, setPreview] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestPreview = useCallback(() => {
    clearTimeout(timer.current);
    setPreview(true);
    timer.current = setTimeout(() => setPreview(false), 120);
  }, []);
  useEffect(() => {
    if (visible) requestPreview();
    return () => clearTimeout(timer.current);
  }, [visible, requestPreview]);
  return { preview, requestPreview };
}

