/**
 * The conversation header, drawn in the marketing site's chrome language
 * (site chrome.css nav pills, product.css segmented jump-nav, home-refresh.css
 * `.demo-chat-head`): a quiet bar on the page colour with a hairline under it,
 * ghost 36px pills that take a 4% fill on hover and 8% while their menu is
 * open, and one segmented track (4% fill, white raised thumb) for 聊天 / 辅导.
 *
 * Progress reads as words and a hairline bar, never as dots: the tutor
 * capsule follows the live teaching stage, and practice reads
 * "基础题 已尝试 2 次".
 *
 * React DOM by design (ADR 0027). The web host passes ids, labels and handlers
 * and decides visibility from its own stores; nothing here reads the document.
 */
import type { CSSProperties, ReactNode } from 'react';
import { uiControl, uiMotion, uiRadius, uiShadow, uiStep } from '@socrates/theme';
import { dataAttributes } from '../domProps';
import { domStyle } from '../domStyle';
import { useUiTheme } from '../primitives/theme';
import { usePressFeedback } from '../primitives/UiButton';
import { UiText } from '../primitives/UiText';
import { UiIcon, type UiGlyphName } from '../primitives/UiIcon';

const PILL = uiControl.pill;

const BUTTON_RESET: CSSProperties = {
  appearance: 'none',
  border: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
};

function clamp(lines?: number): CSSProperties | undefined {
  if (!lines || lines < 1) return undefined;
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}

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

export function TopBarAction({
  id,
  icon,
  label,
  caption,
  pressed,
  visible = true,
  touch = false,
  iconSize,
  part,
  onPress,
}: TopBarActionProps) {
  const { colors } = useUiTheme();
  const { pressed: down, hovered, handlers } = usePressFeedback();
  const size = touch ? uiControl.hit : PILL;
  return (
    <button
      type="button"
      id={id}
      role="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onPress}
      {...dataAttributes({ topbarAction: part ?? id, visible: visible ? 'true' : 'false' })}
      {...handlers}
      style={domStyle([
        BUTTON_RESET,
        {
          display: visible ? 'flex' : 'none',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: uiStep[75] - 2,
          height: size,
          minWidth: size,
          paddingTop: 0,
          paddingBottom: 0,
          paddingLeft: caption ? uiControl.padNav : 0,
          paddingRight: caption ? uiControl.padNav : 0,
          borderRadius: uiRadius.pill,
          backgroundColor: down
            ? colors.fillPressed
            : pressed
              ? colors.fillHover
              : hovered
                ? colors.fill
                : 'transparent',
          transitionProperty: 'background-color',
          transitionDuration: `${uiMotion.fast}ms`,
        },
      ])}
    >
      <UiIcon
        name={icon}
        size={iconSize ?? (touch ? 20 : 18)}
        color={pressed ? colors.ink : colors.inkSecondary}
      />
      {caption ? (
        <UiText variant="bodySm" numberOfLines={1}>
          {caption}
        </UiText>
      ) : null}
    </button>
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

export function TopBarModelSwitcher({
  brand,
  model,
  accessibilityLabel,
  expanded,
  compact,
  narrow = false,
  visible,
  onPress,
}: TopBarModelSwitcherProps) {
  const { colors, fontFamily, typeScale } = useUiTheme();
  const { pressed, hovered, handlers } = usePressFeedback();
  /* Desktop: a 15px wordmark beside a 14px model name on one 22px line. The
     old 18px lockup read as a page title and crowded the centred mode switch;
     the phone chip keeps its 14/22 step. */
  const brandSize = Math.round((compact ? 14 : 15) * typeScale * 10) / 10;
  const brandLine = Math.round(22 * typeScale * 10) / 10;
  const modelSize = Math.round(14 * typeScale * 10) / 10;
  const showSettings = compact && !model;
  return (
    <button
      type="button"
      id="topModelSwitcher"
      role="button"
      aria-label={accessibilityLabel}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={onPress}
      {...dataAttributes({
        chatConfigTrigger: '',
        topbarModel: compact ? 'chip' : 'lockup',
        visible: visible ? 'true' : 'false',
      })}
      {...handlers}
      style={domStyle([
        BUTTON_RESET,
        {
          display: visible ? 'flex' : 'none',
          flexDirection: 'row',
          alignItems: 'center',
          gap: uiStep[50] + (compact ? 0 : 2),
          flexShrink: 1,
          minWidth: 0,
          maxWidth: narrow ? 68 : compact ? 76 : 360,
          height: PILL,
          paddingTop: 0,
          paddingBottom: 0,
          paddingLeft: showSettings ? 0 : compact ? uiStep[100] - 2 : uiControl.padNav,
          paddingRight: showSettings ? 0 : uiStep[75] + (compact ? 0 : 2),
          width: showSettings ? PILL : undefined,
          justifyContent: showSettings ? 'center' : 'flex-start',
          borderRadius: uiRadius.pill,
          backgroundColor: pressed
            ? colors.fillPressed
            : expanded
              ? colors.fillHover
              : hovered
                ? colors.fill
                : 'transparent',
          transitionProperty: 'background-color',
          transitionDuration: `${uiMotion.fast}ms`,
        },
      ])}
    >
      {showSettings ? (
        <div {...dataAttributes({ part: 'model-settings' })}>
          <UiIcon name="sliders" size={18} color={colors.inkSecondary} />
        </div>
      ) : null}
      {compact ? null : (
        <span
          {...dataAttributes({ part: 'model-brand' })}
          style={domStyle([
            {
              fontFamily,
              fontSize: brandSize,
              lineHeight: `${brandLine}px`,
              fontWeight: '600',
              color: colors.ink,
            },
            clamp(1),
          ])}
        >
          {brand}
        </span>
      )}
      <span
        id="topModelSwitcherModel"
        {...dataAttributes({ part: 'model-name' })}
        style={domStyle([
          {
            display: model ? 'block' : 'none',
            flexShrink: 1,
            minWidth: 0,
            fontFamily,
            fontSize: modelSize,
            lineHeight: `${brandLine}px`,
            fontWeight: compact ? '500' : '400',
            color: compact ? colors.ink : colors.inkSecondary,
          },
          clamp(1),
        ])}
      >
        {model}
      </span>
      {showSettings || narrow ? null : (
        <UiIcon name="chevron-down" size={compact ? 12 : 14} color={colors.inkTertiary} />
      )}
    </button>
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

function ModeOptionButton({
  option,
  selected,
  width,
  height,
  onSelect,
}: {
  option: TopBarModeOption;
  selected: boolean;
  width: number;
  height: number;
  onSelect: (mode: string) => void;
}) {
  const { hovered, handlers } = usePressFeedback();
  return (
    <button
      type="button"
      id={option.id}
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={() => onSelect(option.mode)}
      {...dataAttributes({ mode: option.mode })}
      {...handlers}
      style={domStyle([
        BUTTON_RESET,
        {
          width,
          height,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: uiRadius.pill,
          background: 'transparent',
        },
      ])}
    >
      <UiText
        /* The reference sets the segments at 14px (glyph advance 13.7). */
        variant="bodySm"
        tone={selected || hovered ? 'ink' : 'secondary'}
        numberOfLines={1}
        style={{
          fontWeight: selected ? '500' : '400',
          transitionProperty: 'color',
          transitionDuration: `${uiMotion.fast}ms`,
        }}
      >
        {option.label}
      </UiText>
    </button>
  );
}

/**
 * One 4%-fill track with a white raised thumb that slides to the selected
 * option (site product jump-nav). The options are tabs; the host wires the
 * arrow keys because roving focus needs the DOM.
 */
export function TopBarModeSwitch({
  value,
  options,
  accessibilityLabel,
  visible,
  compact,
  narrow = false,
  reducedMotion,
  thumbShadow,
  onSelect,
}: TopBarModeSwitchProps) {
  const { colors } = useUiTheme();
  const index = Math.max(
    0,
    options.findIndex((option) => option.mode === value),
  );
  /* Phones (reference): a 186×36 control whose thumb is the full 36px height
     and sits flush on a track drawn 1.5px shorter top and bottom. */
  const optionWidth = narrow ? 64 : compact ? 93 : 96;
  const inset = compact ? 0 : uiStep[50] - 1;
  const trackInset = compact ? 1.5 : 0;
  const height = PILL;
  return (
    <div
      id="topModeSwitch"
      role="tablist"
      aria-label={accessibilityLabel}
      aria-hidden={!visible}
      {...dataAttributes({ active: value, topbarModes: '' })}
      style={domStyle([
        {
          display: visible ? 'flex' : 'none',
          flexDirection: 'row',
          alignItems: 'center',
          padding: inset,
          height,
          borderRadius: uiRadius.pill,
          backgroundColor: compact ? 'transparent' : colors.fill,
          position: 'relative',
        },
      ])}
    >
      {compact ? (
        <div
          aria-hidden
          {...dataAttributes({ part: 'mode-track' })}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: trackInset,
            bottom: trackInset,
            borderRadius: uiRadius.pill,
            backgroundColor: colors.fill,
          }}
        />
      ) : null}
      <div
        aria-hidden
        {...dataAttributes({ part: 'mode-thumb' })}
        style={{
          position: 'absolute',
          top: inset,
          bottom: inset,
          left: inset,
          width: optionWidth,
          borderRadius: uiRadius.pill,
          backgroundColor: colors.card,
          boxShadow: thumbShadow ?? uiShadow.light.raised,
          transform: `translateX(${index * optionWidth}px)`,
          transitionProperty: reducedMotion ? 'none' : 'transform',
          transitionDuration: reducedMotion ? '0ms' : `${uiMotion.medium}ms`,
          transitionTimingFunction: uiMotion.easeOut,
        }}
      />
      {options.map((option) => (
        <ModeOptionButton
          key={option.mode}
          option={option}
          selected={option.mode === value}
          width={optionWidth}
          height={height - inset * 2}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

/* ── Progress capsules ───────────────────────────────────────────────── */

function Capsule({
  id,
  label,
  role = 'status',
  children,
  part,
}: {
  id: string;
  label?: string;
  role?: 'status';
  children: ReactNode;
  part: string;
}) {
  const { colors } = useUiTheme();
  return (
    <div
      id={id}
      role={role}
      aria-label={label}
      {...dataAttributes({ part })}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: uiStep[75],
        height: 28,
        paddingLeft: uiStep[100] - 2,
        paddingRight: uiStep[100] - 2,
        borderRadius: uiRadius.pill,
        backgroundColor: colors.fill,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
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
export function TopBarStageProgress({
  stage,
  step,
  total,
  progressLabel,
  title,
}: TopBarStageProgressProps) {
  const { colors } = useUiTheme();
  const fraction = total > 0 ? Math.min(1, Math.max(0, step / total)) : 0;
  return (
    <Capsule
      id="tutorMasteryPill"
      label={`${title} · ${stage} · ${progressLabel}`}
      part="stage-progress"
    >
      <UiText variant="labelSm" numberOfLines={1} nativeID="tutorMasteryStageLabel">
        {stage}
      </UiText>
      <div
        aria-hidden
        {...dataAttributes({ part: 'stage-bar', step, total })}
        style={{
          width: 40,
          height: 3,
          borderRadius: uiRadius.pill,
          backgroundColor: colors.hairlineStrong,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${fraction * 100}%`,
            height: '100%',
            borderRadius: uiRadius.pill,
            backgroundColor: colors.ink,
          }}
        />
      </div>
      <UiText
        variant="labelSm"
        tone="tertiary"
        numberOfLines={1}
        aria-hidden
        style={{ fontVariant: ['tabular-nums'], fontWeight: '400' }}
      >
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
      <UiText variant="labelSm" numberOfLines={1}>
        {phase}
      </UiText>
      <UiText variant="labelSm" tone="tertiary" numberOfLines={1} style={{ fontWeight: '400' }}>
        {attempts}
      </UiText>
    </Capsule>
  );
}
