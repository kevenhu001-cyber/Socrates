/**
 * RN-7 — the composer's control rail: tools (+), reasoning effort, dictation
 * and the primary send / stop disc. DOM-free; the web shell renders it
 * through react-native-web inside the composer grid
 * (frontend/src/react/composer-input/ComposerShell.tsx) and another React Native host
 * can reuse it.
 *
 * The component draws and reports; it decides nothing. Every control keeps
 * the id the rest of the app already addresses (`composerToolsBtn`,
 * `effortTrigger`, `composerMicBtn`, `composerPrimaryBtn`) and carries
 * `data-composer-control` so the host grid can place it.
 *
 * Look (site chrome): 36px pill controls, bare glyphs until touched — a 4%
 * fill on hover, 8% while a menu it owns is open — and the send disc, grey
 * when empty and ink once there is something to send. Phones follow the
 * reference instead: the effort control is plain text and the empty send
 * disc is the action colour at half strength. Focus is drawn by the host's
 * focus ring.
 */
import type { ReactNode } from 'react';
import { uiRadius } from '@socrates/theme';
import { dataAttributes } from '../domProps';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { UiIcon } from '../primitives/UiIcon';
import { usePressFeedback } from '../primitives/UiButton';

export const COMPOSER_CONTROL_SIZE = 36;

export interface ComposerToolsControl {
  label: string;
  /** Web 宿主的 i18n 键，输出为 data-i18n-title / data-i18n-aria，切换语言时由宿主重新翻译。 */
  i18nKey?: string;
  expanded: boolean;
  onPress: () => void;
}

export interface ComposerEffortControl {
  /** The pill is only drawn when the host wants it (phones, non-default level). */
  visible: boolean;
  /** "Effort" caption; hidden when `compact`. */
  caption: string;
  /** Current level ("Medium"). */
  value: string;
  /** Raw level id, mirrored to `data-effort`. */
  level: string;
  accessibilityLabel: string;
  expanded: boolean;
  onPress: () => void;
}

export interface ComposerMicControl {
  label: string;
  /** 同 ComposerToolsControl.i18nKey。 */
  i18nKey?: string;
  listening: boolean;
  /** Recording/transcribing glyph state. Omitted by hosts without dictation. */
  phase?: 'idle' | 'recording' | 'transcribing';
  /** Formatted "Recording 0:12" label shown to the left of the control. */
  timerLabel?: string;
  /** Phones hide the timer; the reference does the same. */
  showTimer?: boolean;
  /** Non-secure contexts cannot open the microphone. */
  disabled?: boolean;
  onPress: () => void;
}

export interface ComposerPrimaryControl {
  /** `stop` while a turn streams. */
  mode: 'send' | 'stop';
  label: string;
  /** Something to send (draft or attachment). */
  ready: boolean;
  /** Short beat after a submit, before the stream starts. */
  sending: boolean;
  onPress: () => void;
}

export interface ComposerControlsProps {
  tools: ComposerToolsControl;
  effort: ComposerEffortControl;
  mic: ComposerMicControl;
  primary: ComposerPrimaryControl;
  /** Phone rail: compact effort control. */
  compact?: boolean;
  /** Split the rail around the editor: `leading` draws only the tools
   *  control, `trailing` only effort / timer / mic / send. `all` (default)
   *  keeps the single rail used by the stacked composition. */
  part?: 'all' | 'leading' | 'trailing';
}

function RoundControl({
  id,
  control,
  label,
  i18nKey,
  expanded,
  pressed: ariaPressed,
  haspopup,
  voicePhase,
  filled,
  disabled,
  children,
  onPress,
}: {
  id: string;
  control: string;
  label: string;
  i18nKey?: string;
  expanded?: boolean;
  pressed?: boolean;
  haspopup?: 'menu' | 'dialog';
  voicePhase?: 'idle' | 'recording' | 'transcribing';
  filled?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onPress: () => void;
}) {
  const { colors } = useUiTheme();
  const { pressed, hovered, handlers } = usePressFeedback();
  const active = expanded === true || ariaPressed === true;
  return (
    <button
      type="button"
      id={id}
      aria-label={label}
      aria-expanded={expanded}
      aria-pressed={ariaPressed}
      aria-haspopup={haspopup}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onPress}
      {...handlers}
      {...dataAttributes({
        composerControl: control,
        i18nTitle: i18nKey,
        i18nAria: i18nKey,
        voicePhase,
      })}
      style={{
        display: 'flex',
        width: COMPOSER_CONTROL_SIZE,
        height: COMPOSER_CONTROL_SIZE,
        margin: 0,
        padding: 0,
        border: 0,
        borderRadius: uiRadius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        color: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        backgroundColor: disabled
          ? 'transparent'
          : filled
            ? colors.action
            : pressed
              ? colors.fillPressed
              : active
                ? colors.fillHover
                : hovered
                  ? colors.fillHover
                  : 'transparent',
        transitionProperty: 'background-color, opacity',
        transitionDuration: '150ms',
      }}
    >
      {children}
    </button>
  );
}

export function ComposerControls({
  tools,
  effort,
  mic,
  primary,
  compact = false,
  part = 'all',
}: ComposerControlsProps) {
  const { colors } = useUiTheme();
  const effortPress = usePressFeedback();
  const primaryPress = usePressFeedback();
  const stop = primary.mode === 'stop';
  const enabled = stop || primary.ready;
  const leading = part !== 'trailing';
  const trailing = part !== 'leading';
  return (
    <>
      {leading ? (
        <>
          <RoundControl
            id="composerToolsBtn"
            control="tools"
            label={tools.label}
            i18nKey={tools.i18nKey}
            expanded={tools.expanded}
            haspopup="menu"
            onPress={tools.onPress}
          >
            <UiIcon
              name="plus"
              size={20}
              color={tools.expanded ? colors.ink : colors.inkSecondary}
            />
          </RoundControl>

          {part === 'all' ? (
            <div style={{ flex: 1, minWidth: 0 }} {...dataAttributes({ composerSpacer: '' })} />
          ) : null}
        </>
      ) : null}

      {trailing ? (
        <>
          <div
            {...dataAttributes({
              composerControl: 'effort',
              effort: effort.level,
              visible: effort.visible ? 'true' : 'false',
            })}
            style={{ display: effort.visible ? 'flex' : 'none', flexDirection: 'row' }}
          >
            <button
              type="button"
              id="effortTrigger"
              aria-label={effort.accessibilityLabel}
              aria-haspopup="dialog"
              aria-expanded={effort.expanded}
              onClick={effort.onPress}
              {...effortPress.handlers}
              {...dataAttributes({ chatConfigTrigger: '' })}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: compact ? 4 : 6,
                height: COMPOSER_CONTROL_SIZE,
                margin: 0,
                paddingTop: 0,
                paddingBottom: 0,
                paddingLeft: compact ? 10 : 12,
                paddingRight: 10,
                borderRadius: uiRadius.pill,
                borderWidth: compact ? 0 : 1,
                borderStyle: 'solid',
                borderColor:
                  effortPress.hovered || effort.expanded ? colors.hairlineStrong : colors.hairline,
                backgroundColor: effortPress.pressed
                  ? colors.fillPressed
                  : effortPress.hovered || effort.expanded
                    ? colors.fillHover
                    : compact
                      ? 'transparent'
                      : colors.fill,
                color: 'inherit',
                font: 'inherit',
                cursor: 'pointer',
                transitionProperty: 'background-color, border-color',
                transitionDuration: '150ms',
              }}
            >
              {compact ? null : (
                <UiText variant="labelSm" tone="secondary" numberOfLines={1}>
                  {effort.caption}
                </UiText>
              )}
              {effort.value ? (
                <UiText
                  variant={compact ? 'body' : 'labelSm'}
                  tone={compact ? 'tertiary' : 'ink'}
                  numberOfLines={1}
                  style={compact ? { lineHeight: '20px' } : undefined}
                  aria-hidden
                  {...dataAttributes({ effortValue: '' })}
                >
                  {effort.value}
                </UiText>
              ) : null}
              <UiIcon name="chevron-down" size={compact ? 14 : 16} color={colors.inkTertiary} />
            </button>
          </div>

          {mic.phase === 'recording' && mic.showTimer && mic.timerLabel ? (
            <UiText
              variant="eyebrow"
              tone="secondary"
              numberOfLines={1}
              aria-hidden
              {...dataAttributes({ composerVoiceTimer: '' })}
              style={{
                fontVariant: ['tabular-nums'],
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: uiRadius.pill,
                backgroundColor: colors.fill,
              }}
            >
              {mic.timerLabel}
            </UiText>
          ) : null}

          <RoundControl
            id="composerMicBtn"
            control="mic"
            label={mic.label}
            i18nKey={mic.i18nKey}
            pressed={mic.listening}
            voicePhase={mic.phase}
            filled={mic.phase === 'recording'}
            disabled={mic.disabled}
            onPress={mic.onPress}
          >
            <UiIcon
              name="mic"
              size={20}
              color={
                mic.phase === 'recording'
                  ? colors.onAction
                  : mic.disabled
                    ? colors.inkTertiary
                    : mic.listening
                      ? colors.ink
                      : colors.inkSecondary
              }
            />
          </RoundControl>

          <button
            type="button"
            id="composerPrimaryBtn"
            aria-label={primary.label}
            aria-disabled={!enabled}
            disabled={!enabled}
            onClick={primary.onPress}
            {...primaryPress.handlers}
            {...dataAttributes({
              composerControl: 'send',
              stop: stop ? '1' : '0',
              ready: primary.ready ? 'true' : 'false',
              sending: primary.sending ? 'true' : 'false',
            })}
            style={{
              display: 'flex',
              width: COMPOSER_CONTROL_SIZE,
              height: COMPOSER_CONTROL_SIZE,
              margin: 0,
              padding: 0,
              border: 0,
              borderRadius: uiRadius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              /* The primary action is ink, not a colour: a solid disc in the
             text colour reads as the one thing to press in both modes. */
              backgroundColor: colors.ink,
              color: 'inherit',
              cursor: enabled ? 'pointer' : 'default',
              opacity: !enabled
                ? 0.5
                : primaryPress.pressed || primary.sending
                  ? 0.78
                  : primaryPress.hovered
                    ? 0.9
                    : 1,
              transitionProperty: 'background-color, opacity',
              transitionDuration: '150ms',
            }}
          >
            <div id="composerPrimaryBtnContent">
              <UiIcon name={stop ? 'stop' : 'arrow-up'} size={18} color={colors.onInk} />
            </div>
          </button>
        </>
      ) : null}
    </>
  );
}
