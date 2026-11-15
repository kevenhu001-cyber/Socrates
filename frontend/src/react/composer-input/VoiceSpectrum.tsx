import { useEffect, useRef, useState } from 'react';

/* The reference's live spectrum: 2px bars, 3px gaps, log-spaced across the
   100–4000 Hz vocal band. Heights are written straight to `transform` from
   the animation frame, so a live meter never re-renders React. */

const BAR_WIDTH = 2;
const BAR_GAP = 3;
const BAR_MIN = 4;
const BAR_MAX = 26;
const MAX_BARS = 60;
const FREQ_LOW = 100;
const FREQ_HIGH = 4000;
const DB_FLOOR = -80;
const DB_CEIL = -25;
const TILT_DB_PER_OCTAVE = 4;

interface SpectrumRange {
  from: number;
  to: number;
  center: number;
}

function buildRanges(count: number, binWidth: number, binCount: number): SpectrumRange[] {
  const ranges: SpectrumRange[] = [];
  const ratio = FREQ_HIGH / FREQ_LOW;
  for (let index = 0; index < count; index += 1) {
    const low = FREQ_LOW * ratio ** (index / count);
    const high = FREQ_LOW * ratio ** ((index + 1) / count);
    const from = Math.min(binCount - 1, Math.floor(low / binWidth));
    const to = Math.min(binCount, Math.max(from + 1, Math.ceil(high / binWidth)));
    ranges.push({ from, to, center: Math.sqrt(low * high) / binWidth });
  }
  return ranges;
}

export function VoiceSpectrum({ analyser }: { analyser: AnalyserNode | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const fit = Math.floor((entry.contentRect.width + BAR_GAP) / (BAR_WIDTH + BAR_GAP));
      setCount(Math.min(MAX_BARS, Math.max(0, fit)));
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || count < 1) return undefined;
    const bars = Array.from(root.children) as HTMLElement[];
    const levels = new Float32Array(count);
    const targets = new Float32Array(count);
    const tilts = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      tilts[index] = TILT_DB_PER_OCTAVE * Math.log2(FREQ_HIGH / FREQ_LOW) * (index / count);
    }
    let data = new Float32Array(0);
    let ranges: SpectrumRange[] = [];
    let rangeKey = '';
    let frame = 0;

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const usable = Boolean(
        analyser
        && typeof analyser.getFloatFrequencyData === 'function'
        && analyser.context
        && analyser.frequencyBinCount > 0,
      );
      if (analyser && usable) {
        if (data.length !== analyser.frequencyBinCount) {
          data = new Float32Array(analyser.frequencyBinCount);
        }
        const key = `${analyser.context.sampleRate}:${analyser.fftSize}`;
        if (key !== rangeKey) {
          rangeKey = key;
          ranges = buildRanges(count, analyser.context.sampleRate / analyser.fftSize, data.length);
        }
        try {
          analyser.getFloatFrequencyData(data);
        } catch (_) {
          /* empty-catch: intentional — the analyser can close between two
             animation frames while dictation is stopping. */
        }
      }
      for (let index = 0; index < count; index += 1) {
        let target = 0;
        if (analyser && usable) {
          const range = ranges[index];
          let peak = -Infinity;
          if (range) {
            if (range.to - range.from <= 1) {
              const base = Math.min(data.length - 2, Math.floor(range.center));
              const weight = range.center - base;
              peak = data[base] * (1 - weight) + data[base + 1] * weight;
            } else {
              for (let bin = range.from; bin < range.to; bin += 1) {
                peak = Math.max(peak, data[bin]);
              }
            }
            const db = peak + tilts[index];
            target = Math.min(1, Math.max(0, (db - DB_FLOOR) / (DB_CEIL - DB_FLOOR)));
          }
        }
        targets[index] = target;
      }
      for (let index = 0; index < count; index += 1) {
        const prev = targets[Math.max(0, index - 1)];
        const next = targets[Math.min(count - 1, index + 1)];
        const target = (prev + targets[index] * 2 + next) / 4;
        /* Rise almost immediately, fall slower: no flicker, no long tail. */
        levels[index] += (target - levels[index]) * (target > levels[index] ? 0.8 : 0.35);
        const height = BAR_MIN + (BAR_MAX - BAR_MIN) * levels[index];
        const bar = bars[index];
        if (bar) bar.style.transform = `scaleY(${height / BAR_MIN})`;
      }
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [count, analyser]);

  return (
    <div ref={rootRef} className="composer-voice-spectrum" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
