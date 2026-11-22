/**
 * RN-4 — learning-mode switch: five ways to work on one question.
 *
 * `row`  a capsule segmented control (landing page): a pale grey track with
 *        one ink capsule for the selected mode and its one-line hint below.
 * `menu` a single capsule trigger (next to the composer in a conversation)
 *        that opens the same track inline; picking a mode closes it.
 *
 * Phones scroll the track sideways rather than wrapping it. No motion: the
 * selection changes in place.
 */
import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { dataAttributes } from '../domProps';
import { R, S, focusRing, transition } from '../look';
import { useReducedMotion } from '../turn/parts';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { PillAction } from '../learn/parts';
import { stepLearningMode, type LearningModeId } from './model';

const BUTTON_RESET: CSSProperties = {
  display: 'inline-flex',
  background: 'none',
  border: 0,
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  textAlign: 'inherit',
};

export const LEARNING_MODE_COMPACT_WIDTH = 769;

export interface LearningModeOption {
  id: LearningModeId;
  /** What choosing this option does on the current surface. */
  label: string;
  hint: string;
  /** Short persistent-mode name used by the menu trigger after selection. */
  triggerLabel?: string;
}

export interface LearningModeSwitchProps {
  options: readonly LearningModeOption[];
  /** Selected mode; `null` when none is active yet (Chat mode on the landing page). */
  value: LearningModeId | null;
  onChange: (id: LearningModeId) => void;
  /** Group label ("Learning mode"); also the trigger prefix in `menu`. */
  label: string;
  variant?: 'row' | 'menu';
  /** Show the selected mode's hint under the track. */
  showHint?: boolean;
  /** `menu` only: trigger text, `{mode}` is the selected mode ("Mode: {mode}"). */
  triggerLabel?: string;
  /** `menu` only: start open (used by hosts restoring state). */
  defaultOpen?: boolean;
  testID?: string;
}

function ModeOption({
  option,
  selected,
  tabStop,
  nodeRef,
  onPress,
  onArrow,
}: {
  option: LearningModeOption;
  selected: boolean;
  tabStop: boolean;
  nodeRef: (node: HTMLButtonElement | null) => void;
  onPress: () => void;
  onArrow: (delta: 1 | -1) => void;
}) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { scale, hovered, focused, handlers } = usePressFeedback();
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      onArrow(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      onArrow(-1);
    }
  };
  return (
    <button
      ref={nodeRef}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={option.label}
      data-testid={`learning-mode-${option.id}`}
      onClick={onPress}
      onKeyDown={onKeyDown}
      {...handlers}
      {...dataAttributes({ mode: option.id })}
      tabIndex={tabStop ? undefined : -1}
      style={BUTTON_RESET}
    >
      <span
        className="learning-mode-option"
        style={{
          display: 'flex',
          height: 32,
          borderRadius: R.pill,
          alignItems: 'center',
          justifyContent: 'center',
          /* Site `.ui-seg`: the chosen segment is a white capsule lifted by
             a 6% ring on the grey track; the others are quiet text. */
          backgroundColor: selected ? colors.card : hovered ? colors.fillHover : 'transparent',
          boxShadow: selected
            ? `0 0 0 1px ${colors.hairline}, 0 1px 2px rgb(0 0 0 / 4%)`
            : undefined,
          ...focusRing(colors, focused),
          ...transition('background-color, box-shadow', reduced),
          transform: `scale(${scale})`,
        }}
      >
        <UiText variant="labelSm" tone={selected ? 'ink' : 'secondary'} numberOfLines={1}>
          {option.label}
        </UiText>
      </span>
    </button>
  );
}

function ModeTrack({
  options,
  value,
  onChange,
  label,
  centered,
}: {
  options: readonly LearningModeOption[];
  value: LearningModeId | null;
  onChange: (id: LearningModeId) => void;
  label: string;
  centered: boolean;
}) {
  const { colors } = useUiTheme();
  const optionRefs = useRef(new Map<LearningModeId, HTMLButtonElement>());
  /* Arrow keys only move focus: every mode runs an action (pre-fill, open a
     panel), so selection waits for Enter / Space / a press. */
  const focusMode = (id: LearningModeId) => {
    optionRefs.current.get(id)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid="learning-mode-track"
      className={`learning-mode-track${centered ? ' is-centered' : ''}`}
      style={{
        gap: 2,
        padding: 3,
        borderRadius: R.pill,
        backgroundColor: colors.fill,
      }}
    >
      {options.map((option, index) => (
        <ModeOption
          key={option.id}
          option={option}
          selected={option.id === value}
          tabStop={value === null ? index === 0 : option.id === value}
          nodeRef={(node) => {
            if (node) optionRefs.current.set(option.id, node);
            else optionRefs.current.delete(option.id);
          }}
          onPress={() => onChange(option.id)}
          onArrow={(delta) => focusMode(stepLearningMode(option.id, delta))}
        />
      ))}
    </div>
  );
}

export function LearningModeSwitch({
  options,
  value,
  onChange,
  label,
  variant = 'row',
  triggerLabel = '{mode}',
  showHint = true,
  defaultOpen = false,
  testID = 'learning-mode-switch',
}: LearningModeSwitchProps) {
  const [open, setOpen] = useState(defaultOpen);
  const selected = options.find((option) => option.id === value) ?? null;
  const selectedLabel = selected?.triggerLabel ?? selected?.label;
  const hint =
    showHint && selected ? (
      <UiText
        testID="learning-mode-hint"
        variant="bodySm"
        tone="tertiary"
        align={variant === 'row' ? 'center' : 'left'}
        numberOfLines={2}
      >
        {selected.hint}
      </UiText>
    ) : null;

  if (variant === 'row') {
    return (
      <div
        data-testid={testID}
        style={{ display: 'flex', flexDirection: 'column', gap: S[75] }}
        {...dataAttributes({ mode: value ?? 'none' })}
      >
        <ModeTrack options={options} value={value} onChange={onChange} label={label} centered />
        {hint}
      </div>
    );
  }

  return (
    <div
      data-testid={testID}
      style={{ display: 'flex', flexDirection: 'column', gap: S[75], alignItems: 'flex-start' }}
      {...dataAttributes({ mode: value ?? 'none', open: open ? 'true' : 'false' })}
    >
      <PillAction
        size="sm"
        testID="learning-mode-trigger"
        label={selectedLabel ? triggerLabel.replace('{mode}', selectedLabel) : label}
        accessibilityLabel={selectedLabel ? `${label}, ${selectedLabel}` : label}
        expanded={open}
        chevron
        onPress={() => setOpen((value) => !value)}
      />
      {open ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[75], alignSelf: 'stretch' }}>
          <ModeTrack
            options={options}
            value={value}
            label={label}
            centered={false}
            onChange={(id) => {
              onChange(id);
              setOpen(false);
            }}
          />
          {hint}
        </div>
      ) : null}
    </div>
  );
}
