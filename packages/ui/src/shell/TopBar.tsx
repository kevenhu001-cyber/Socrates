/**
 * RN-7 — the conversation header, drawn in the marketing site's chrome
 * language (site chrome.css nav pills, product.css segmented jump-nav,
 * home-refresh.css `.demo-chat-head`): a quiet bar on the page colour with
 * a hairline under it, ghost 36px pills that take a 4% fill on hover and
 * 8% while their menu is open, and one segmented track (4% fill, white
 * raised thumb) for 聊天 / 辅导.
 *
 * Progress reads as words and a hairline bar, never as dots: the tutor
 * capsule follows the live teaching stage, and practice reads
 * "基础题 已尝试 2 次".
 *
 * DOM-free: the web host passes ids (`nativeID`), labels and handlers and
 * decides visibility from its own stores; nothing here reads the document.
 */
import type { ReactNode } from 'react';
import { Pressable, Text, View, type PressableStateCallbackType } from 'react-native';
import { uiControl, uiMotion, uiRadius, uiShadow, uiStep } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { UiIcon, type UiGlyphName } from '../primitives/UiIcon';
import { dataSet } from '../learn/parts';

type PressState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

const PILL = uiControl.pill;

/* ── Icon action (find, share, new chat, incognito) ──────────────────── */

export interface TopBarActionProps {
  id: string;
  icon: UiGlyphName;
  label: string;
  /** Visible caption next to the glyph (desktop share keeps icon-only). */
  caption?: string;
  pressed?: boolean;
  visible?: boolean;
  /** Phones: the 44px touch rung instead of the 36px pill. */
  touch?: boolean;
  /** Glyph size; defaults to the reference's 20px on phones, 18px otherwise. */
  iconSize?: number;
  part?: string;
  onPress: () => void;
}

export function TopBarAction({ id, icon, label, caption, pressed, visible = true, touch = false, iconSize, part, onPress }: TopBarActionProps) {
  const { colors } = useUiTheme();
  const size = touch ? uiControl.hit : PILL;
  return (
    <Pressable
      nativeID={id}
      role="button"
      aria-label={label}
      aria-pressed={pressed}
      onPress={onPress}
      {...dataSet({ topbarAction: part ?? id, visible: visible ? 'true' : 'false' })}
      style={({ pressed: down, hovered }: PressState) => ({
        display: visible ? 'flex' : 'none',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: uiStep[75] - 2,
        height: size,
        minWidth: size,
        paddingHorizontal: caption ? uiControl.padNav : 0,
        borderRadius: uiRadius.pill,
        backgroundColor: down ? colors.fillPressed : pressed ? colors.fillHover : hovered ? colors.fill : 'transparent',
        transitionProperty: 'background-color',
        transitionDuration: `${uiMotion.fast}ms`,
      } as object)}
    >
      <UiIcon name={icon} size={iconSize ?? (touch ? 20 : 18)} color={pressed ? colors.ink : colors.inkSecondary} />
      {caption ? <UiText variant="bodySm" numberOfLines={1}>{caption}</UiText> : null}
    </Pressable>
  );
}

/* ── Model switcher ──────────────────────────────────────────────────── */

export interface TopBarModelSwitcherProps {
  brand: string;
  model: string;
  accessibilityLabel: string;
  expanded: boolean;
  /** Phones: a chip that names the model only (the brand would run under the mode switch). */
  compact: boolean;
  /** Phones under 360px: a narrower chip without the caret. */
  narrow?: boolean;
  visible: boolean;
  onPress: () => void;
}

export function TopBarModelSwitcher({ brand, model, accessibilityLabel, expanded, compact, narrow = false, visible, onPress }: TopBarModelSwitcherProps) {
  const { colors, fontFamily, typeScale } = useUiTheme();
  /* The desktop lockup keeps the header's 18/28 step; the phone chip the 14/22 one. */
  const size = Math.round((compact ? 14 : 18) * typeScale * 10) / 10;
  const line = Math.round((compact ? 22 : 28) * typeScale * 10) / 10;
  const showSettings = compact && !model;
  return (
    <Pressable
      nativeID="topModelSwitcher"
      role="button"
      aria-label={accessibilityLabel}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onPress={onPress}
      {...dataSet({ chatConfigTrigger: '', topbarModel: compact ? 'chip' : 'lockup', visible: visible ? 'true' : 'false' })}
      style={({ pressed, hovered }: PressState) => ({
        display: visible ? 'flex' : 'none',
        flexDirection: 'row',
        alignItems: 'center',
        gap: uiStep[50] + (compact ? 0 : 2),
        flexShrink: 1,
        minWidth: 0,
        maxWidth: narrow ? 68 : compact ? 76 : 360,
        height: PILL,
        paddingLeft: showSettings ? 0 : compact ? uiStep[100] - 2 : uiControl.padNav,
        paddingRight: showSettings ? 0 : uiStep[75] + (compact ? 0 : 2),
        width: showSettings ? PILL : undefined,
        justifyContent: showSettings ? 'center' : 'flex-start',
        borderRadius: uiRadius.pill,
        backgroundColor: pressed ? colors.fillPressed : expanded ? colors.fillHover : hovered ? colors.fill : 'transparent',
        transitionProperty: 'background-color',
        transitionDuration: `${uiMotion.fast}ms`,
      } as object)}
    >
      {showSettings ? (
        <View {...dataSet({ part: 'model-settings' })}><UiIcon name="sliders" size={18} color={colors.inkSecondary} /></View>
      ) : null}
      {compact ? null : (
        <Text {...dataSet({ part: 'model-brand' })} numberOfLines={1} style={{ fontFamily, fontSize: size, lineHeight: line, fontWeight: '500', color: colors.ink }}>{brand}</Text>
      )}
      <Text
        nativeID="topModelSwitcherModel"
        {...dataSet({ part: 'model-name' })}
        numberOfLines={1}
        style={{
          display: model ? 'flex' : 'none',
          flexShrink: 1,
          minWidth: 0,
          fontFamily,
          fontSize: size,
          lineHeight: line,
          fontWeight: compact ? '500' : '400',
          color: compact ? colors.ink : colors.inkSecondary,
        }}
      >
        {model}
      </Text>
      {showSettings || narrow ? null : <UiIcon name="chevron-down" size={compact ? 12 : 16} color={colors.inkTertiary} />}
    </Pressable>
  );
}

/* ── 聊天 / 辅导 segmented control ───────────────────────────────────── */

export interface TopBarModeOption {
  id: string;
  mode: string;
  label: string;
}

export interface TopBarModeSwitchProps {
  value: string;
  options: readonly [TopBarModeOption, TopBarModeOption];
  accessibilityLabel: string;
  visible: boolean;
  compact: boolean;
  /** Phones under 360px: narrower options. */
  narrow?: boolean;
  reducedMotion: boolean;
  /** Web passes `var(--ui-elevation-raised)` so the active mode decides. */
  thumbShadow?: string;
  onSelect: (mode: string) => void;
}

/**
 * One 4%-fill track with a white raised thumb that slides to the selected
 * option (site product jump-nav). The options are tabs; the host wires the
 * arrow keys because roving focus needs the DOM.
 */
export function TopBarModeSwitch({ value, options, accessibilityLabel, visible, compact, narrow = false, reducedMotion, thumbShadow, onSelect }: TopBarModeSwitchProps) {
  const { colors } = useUiTheme();
  const index = Math.max(0, options.findIndex((option) => option.mode === value));
  /* Phones (reference): a 186×36 control whose thumb is the full 36px height
     and sits flush on a track drawn 1.5px shorter top and bottom. */
  const optionWidth = narrow ? 64 : compact ? 93 : 96;
  const inset = compact ? 0 : uiStep[50] - 1;
  const trackInset = compact ? 1.5 : 0;
  const height = PILL;
  return (
    <View
      nativeID="topModeSwitch"
      role="tablist"
      aria-label={accessibilityLabel}
      aria-hidden={!visible}
      {...dataSet({ active: value, topbarModes: '' })}
      style={{
        display: visible ? 'flex' : 'none',
        flexDirection: 'row',
        alignItems: 'center',
        padding: inset,
        height,
        borderRadius: uiRadius.pill,
        backgroundColor: compact ? 'transparent' : colors.fill,
        position: 'relative',
      }}
    >
      {compact ? (
        <View
          aria-hidden
          {...dataSet({ part: 'mode-track' })}
          style={{ position: 'absolute', left: 0, right: 0, top: trackInset, bottom: trackInset, borderRadius: uiRadius.pill, backgroundColor: colors.fill }}
        />
      ) : null}
      <View
        aria-hidden
        {...dataSet({ part: 'mode-thumb' })}
        style={{
          position: 'absolute',
          top: inset,
          bottom: inset,
          left: inset,
          width: optionWidth,
          borderRadius: uiRadius.pill,
          backgroundColor: colors.card,
          boxShadow: thumbShadow ?? uiShadow.light.raised,
          transform: [{ translateX: index * optionWidth }],
          transitionProperty: reducedMotion ? 'none' : 'transform',
          transitionDuration: reducedMotion ? '0ms' : `${uiMotion.medium}ms`,
          transitionTimingFunction: uiMotion.easeOut,
        } as object}
      />
      {options.map((option) => {
        const selected = option.mode === value;
        return (
          <Pressable
            key={option.mode}
            nativeID={option.id}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onPress={() => onSelect(option.mode)}
            {...dataSet({ mode: option.mode })}
            style={{
              width: optionWidth,
              height: height - inset * 2,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: uiRadius.pill,
            }}
          >
            {({ hovered }: PressState) => (
              <UiText
                /* The reference sets the segments at 14px (glyph advance 13.7). */
                variant="bodySm"
                tone={selected || hovered ? 'ink' : 'secondary'}
                numberOfLines={1}
                style={{ fontWeight: selected ? '500' : '400', transitionProperty: 'color', transitionDuration: `${uiMotion.fast}ms` } as object}
              >
                {option.label}
              </UiText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Progress capsules ───────────────────────────────────────────────── */

function Capsule({ id, label, role = 'status', children, part }: { id: string; label?: string; role?: 'status'; children: ReactNode; part: string }) {
  const { colors } = useUiTheme();
  return (
    <View
      nativeID={id}
      role={role}
      aria-label={label}
      {...dataSet({ part })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: uiStep[75],
        height: 28,
        paddingHorizontal: uiStep[100] - 2,
        borderRadius: uiRadius.pill,
        backgroundColor: colors.fill,
        flexShrink: 0,
      }}
    >
      {children}
    </View>
  );
}

export interface TopBarStageProgressProps {
  /** Stage name without its number ("探索提问"). */
  stage: string;
  step: number;
  total: number;
  /** The current teaching stage and total, used in the accessible name. */
  progressLabel: string;
  /** "苏格拉底认知进阶" */
  title: string;
}

/** Tutor stage: its name and a 40px hairline bar filled to step / total. */
export function TopBarStageProgress({ stage, step, total, progressLabel, title }: TopBarStageProgressProps) {
  const { colors } = useUiTheme();
  const fraction = total > 0 ? Math.min(1, Math.max(0, step / total)) : 0;
  return (
    <Capsule id="tutorMasteryPill" label={`${title} · ${stage} · ${progressLabel}`} part="stage-progress">
      <UiText variant="labelSm" numberOfLines={1} nativeID="tutorMasteryStageLabel">{stage}</UiText>
      <View
        aria-hidden
        {...dataSet({ part: 'stage-bar', step, total })}
        style={{ width: 40, height: 3, borderRadius: uiRadius.pill, backgroundColor: colors.hairlineStrong, overflow: 'hidden' }}
      >
        <View style={{ width: `${fraction * 100}%`, height: '100%', borderRadius: uiRadius.pill, backgroundColor: colors.ink }} />
      </View>
      <UiText variant="labelSm" tone="tertiary" numberOfLines={1} aria-hidden style={{ fontVariant: ['tabular-nums'], fontWeight: '400' }}>
        {`${step}/${total}`}
      </UiText>
    </Capsule>
  );
}

export interface TopBarPracticeProgressProps {
  phase: string;
  attempts: string;
}

/** Practice: "基础题  已尝试 2 次" — two words, no separator glyph. */
export function TopBarPracticeProgress({ phase, attempts }: TopBarPracticeProgressProps) {
  return (
    <Capsule id="practiceProgressChip" part="practice-progress">
      <UiText variant="labelSm" numberOfLines={1}>{phase}</UiText>
      <UiText variant="labelSm" tone="tertiary" numberOfLines={1} style={{ fontWeight: '400' }}>{attempts}</UiText>
    </Capsule>
  );
}
