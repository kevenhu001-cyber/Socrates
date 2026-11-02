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
import { useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { PillAction, dataSet } from '../learn/parts';
import { stepLearningMode, type LearningModeId } from './model';

export const LEARNING_MODE_COMPACT_WIDTH = 769;

export interface LearningModeOption {
  id: LearningModeId;
  label: string;
  hint: string;
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

function ModeOption({ option, selected, tabStop, nodeRef, onPress, onArrow }: { option: LearningModeOption; selected: boolean; tabStop: boolean; nodeRef: (node: View | null) => void; onPress: () => void; onArrow: (delta: 1 | -1) => void }) {
  const { colors } = useUiTheme();
  const { scale, hovered, focused, handlers } = usePressFeedback();
  return (
    <Pressable
      ref={nodeRef}
      role="radio"
      aria-checked={selected}
      aria-label={option.label}
      testID={`learning-mode-${option.id}`}
      onPress={onPress}
      {...handlers}
      {...dataSet({ mode: option.id })}
      focusable={tabStop}
      {...{
        onKeyDown: (event: { key?: string; nativeEvent?: { key?: string }; preventDefault?: () => void }) => {
          const key = event.key ?? event.nativeEvent?.key;
          if (key === 'ArrowRight' || key === 'ArrowDown') { event.preventDefault?.(); onArrow(1); }
          else if (key === 'ArrowLeft' || key === 'ArrowUp') { event.preventDefault?.(); onArrow(-1); }
        },
      }}
    >
      <Animated.View
        style={{
          height: 32,
          paddingHorizontal: uiSpace[3],
          borderRadius: uiRadius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? colors.ink : hovered ? colors.fillHover : 'transparent',
          outlineStyle: focused ? 'solid' : undefined,
          outlineWidth: focused ? 2 : 0,
          outlineColor: colors.ink,
          outlineOffset: 2,
          transform: [{ scale }],
        }}
      >
        <UiText variant="labelSm" tone={selected ? 'onInk' : 'secondary'} numberOfLines={1}>{option.label}</UiText>
      </Animated.View>
    </Pressable>
  );
}

function ModeTrack({ options, value, onChange, label, centered }: { options: readonly LearningModeOption[]; value: LearningModeId | null; onChange: (id: LearningModeId) => void; label: string; centered: boolean }) {
  const { colors } = useUiTheme();
  const { width } = useWindowDimensions();
  const compact = width < LEARNING_MODE_COMPACT_WIDTH;
  const optionRefs = useRef(new Map<LearningModeId, View>());
  /* Arrow keys only move focus: every mode runs an action (pre-fill, open a
     panel), so selection waits for Enter / Space / a press. */
  const focusMode = (id: LearningModeId) => {
    (optionRefs.current.get(id) as unknown as { focus?: () => void } | undefined)?.focus?.();
  };
  const track = (
    <View
      role="radiogroup"
      aria-label={label}
      testID="learning-mode-track"
      style={{
        flexDirection: 'row',
        alignSelf: centered && !compact ? 'center' : 'flex-start',
        gap: 2,
        padding: 3,
        borderRadius: uiRadius.pill,
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
    </View>
  );
  if (!compact) return track;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: uiSpace[2] }}>
      {track}
    </ScrollView>
  );
}

export function LearningModeSwitch({ options, value, onChange, label, variant = 'row', triggerLabel = '{mode}', showHint = true, defaultOpen = false, testID = 'learning-mode-switch' }: LearningModeSwitchProps) {
  const [open, setOpen] = useState(defaultOpen);
  const selected = options.find((option) => option.id === value) ?? null;
  const hint = showHint && selected ? (
    <UiText testID="learning-mode-hint" variant="bodySm" tone="tertiary" align={variant === 'row' ? 'center' : 'left'} numberOfLines={2}>
      {selected.hint}
    </UiText>
  ) : null;

  if (variant === 'row') {
    return (
      <View testID={testID} style={{ gap: uiSpace[2] }} {...dataSet({ mode: value ?? 'none' })}>
        <ModeTrack options={options} value={value} onChange={onChange} label={label} centered />
        {hint}
      </View>
    );
  }

  return (
    <View testID={testID} style={{ gap: uiSpace[2], alignItems: 'flex-start' }} {...dataSet({ mode: value ?? 'none', open: open ? 'true' : 'false' })}>
      <PillAction
        testID="learning-mode-trigger"
        label={selected ? triggerLabel.replace('{mode}', selected.label) : label}
        accessibilityLabel={selected ? `${label}, ${selected.label}` : label}
        expanded={open}
        chevron
        onPress={() => setOpen((value) => !value)}
      />
      {open ? (
        <View style={{ gap: uiSpace[2], alignSelf: 'stretch' }}>
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
        </View>
      ) : null}
    </View>
  );
}
