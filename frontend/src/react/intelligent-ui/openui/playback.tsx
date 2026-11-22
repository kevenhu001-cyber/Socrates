import { defineComponent, reactive, useIsStreaming, useStateField } from '@openuidev/react-lang';
import { VisualStepFrame } from '@socrates/ui/visual-components';
import { useEffect, useState } from 'react';
import { z } from 'zod/v4';
import { i18n } from '../../legacy/gateway';
import { MathText } from '../../rn/useInlineMath';
import { Button } from '../../ui/Button';
import { NativeControl } from '../../ui/NativeControl';
import { Glyph } from './glyph';

export const StepPlayer = defineComponent({
  name: 'StepPlayer',
  props: z.object({
    index: reactive(z.number()),
    steps: z.array(z.string()).min(2).max(32),
    label: z.string(),
    intervalMs: z.number().min(400).max(10000).optional(),
  }),
  description:
    'Navigate a worked example frame by frame, or play it once. Bind index to a zero-based numeric $state variable initialized to 0. Use that variable to select data for a separate chart, metric or explanation.',
  component: function StepPlayerView({ props, statementId }) {
    const { value, setValue } = useStateField(statementId ?? props.label, props.index);
    const isStreaming = useIsStreaming();
    const steps = (props.steps ?? []).slice(0, 32);
    const last = Math.max(0, steps.length - 1);
    const index = normalizeStepIndex(value, last);
    const interval = clampStepInterval(props.intervalMs);
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
      if (!playing || isStreaming || index >= last) return;
      const timer = setTimeout(() => {
        setValue(index + 1);
        if (index + 1 >= last) setPlaying(false);
      }, interval);
      return () => clearTimeout(timer);
    }, [playing, isStreaming, index, last, interval, setValue]);

    if (!steps.length) return null;
    const disabled = isStreaming || last === 0;
    const active = playing && !disabled && index < last;
    const position = `${index + 1} / ${steps.length}`;
    const select = (next: number) => {
      setPlaying(false);
      setValue(next);
    };
    const play = () => {
      if (!active && index >= last) setValue(0);
      setPlaying(!active);
    };
    const { label: playLabel, glyph: playGlyph } = resolvePlayButtonConfig(
      active,
      index === last,
      disabled,
    );

    return (
      <section className="iui-step-player" aria-label={props.label}>
        <VisualStepFrame
          label={<MathText text={props.label} />}
          position={position}
          playing={active}
        >
          <MathText text={steps[index]} />
        </VisualStepFrame>
        <NativeControl
          className="iui-step-range"
          type="range"
          min={0}
          max={last}
          step={1}
          value={index}
          disabled={disabled}
          aria-label={i18n('intui.stepPosition', 'Step position')}
          aria-valuetext={`${position} · ${steps[index]}`}
          onChange={(event) => select(Number(event.currentTarget.value))}
        />
        <div className="iui-step-actions">
          <Button
            className="iui-button iui-button-outline iui-button-sm"
            disabled={disabled || index === 0}
            onClick={() => select(index - 1)}
          >
            {i18n('intui.stepPrevious', 'Previous')}
          </Button>
          <Button
            className="iui-button iui-button-solid iui-button-sm"
            disabled={disabled}
            onClick={play}
          >
            <Glyph name={playGlyph} size={14} />
            {playLabel}
          </Button>
          <Button
            className="iui-button iui-button-outline iui-button-sm"
            disabled={disabled || index === last}
            onClick={() => select(index + 1)}
          >
            {i18n('intui.stepNext', 'Next')}
          </Button>
        </div>
      </section>
    );
  },
});

function normalizeStepIndex(value: unknown, last: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(last, Math.round(value as number)));
}

function clampStepInterval(intervalMs?: number): number {
  return Math.min(10000, Math.max(400, intervalMs ?? 1200));
}

function resolvePlayButtonConfig(
  active: boolean,
  isLast: boolean,
  disabled: boolean,
): { label: string; glyph: 'pause' | 'rotate-ccw' | 'play' } {
  if (active) {
    return { label: i18n('intui.simPause', 'Pause'), glyph: 'pause' };
  }
  if (isLast && !disabled) {
    return { label: i18n('intui.stepReplay', 'Replay'), glyph: 'rotate-ccw' };
  }
  return { label: i18n('intui.simPlay', 'Play'), glyph: 'play' };
}
