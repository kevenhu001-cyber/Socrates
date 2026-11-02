/**
 * RN-7 — the composer's control rail: tools (+), reasoning effort, dictation
 * and the primary send / stop disc. DOM-free; the web shell renders it
 * through react-native-web inside the composer grid
 * (frontend/src/react/composer-input/ComposerShell.tsx) and apps/socrates
 * can reuse it.
 *
 * The component draws and reports; it decides nothing. Every control keeps
 * the id the rest of the app already addresses (`composerToolsBtn`,
 * `effortTrigger`, `composerMicBtn`, `composerPrimaryBtn`) and carries
 * `data-composer-control` so the host grid can place it.
 *
 * Look (site chrome): 36px pill controls, quiet until touched — a 4% fill
 * on hover, 8% while a menu it owns is open — and the send disc, grey when
 * empty and ink once there is something to send. Focus is drawn by the host's focus ring.
 */
import type { ReactNode } from 'react';
import { Pressable, View, type PressableStateCallbackType } from 'react-native';
import { uiRadius } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { UiIcon } from '../primitives/UiIcon';
import { dataSet } from '../learn/parts';

export const COMPOSER_CONTROL_SIZE = 36;

type PressState = PressableStateCallbackType & { hovered?: boolean };

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
  /** Phone rail: tools and mic sit on a pale fill instead of being bare. */
  compact?: boolean;
}

function RoundControl({ id, control, label, i18nKey, expanded, pressed: ariaPressed, haspopup, filled, children, onPress }: {
  id: string;
  control: string;
  label: string;
  i18nKey?: string;
  expanded?: boolean;
  pressed?: boolean;
  haspopup?: 'menu' | 'dialog';
  filled: boolean;
  children: ReactNode;
  onPress: () => void;
}) {
  const { colors } = useUiTheme();
  const active = expanded === true || ariaPressed === true;
  return (
    <Pressable
      nativeID={id}
      role="button"
      aria-label={label}
      aria-expanded={expanded}
      aria-pressed={ariaPressed}
      aria-haspopup={haspopup}
      onPress={onPress}
      {...dataSet({ composerControl: control, i18nTitle: i18nKey, i18nAria: i18nKey })}
      style={({ pressed, hovered }: PressState) => ({
        width: COMPOSER_CONTROL_SIZE,
        height: COMPOSER_CONTROL_SIZE,
        borderRadius: uiRadius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.fillPressed
          : active ? colors.fillHover
            : hovered ? (filled ? colors.fillHover : colors.fill)
              : filled ? colors.fill : 'transparent',
      })}
    >
      {children}
    </Pressable>
  );
}

export function ComposerControls({ tools, effort, mic, primary, compact = false }: ComposerControlsProps) {
  const { colors } = useUiTheme();
  const stop = primary.mode === 'stop';
  const enabled = stop || primary.ready;
  return (
    <>
      <RoundControl
        id="composerToolsBtn"
        control="tools"
        label={tools.label}
        i18nKey={tools.i18nKey}
        expanded={tools.expanded}
        haspopup="menu"
        filled={compact}
        onPress={tools.onPress}
      >
        <UiIcon name="plus" size={20} color={tools.expanded ? colors.ink : colors.inkSecondary} />
      </RoundControl>

      <View style={{ flex: 1, minWidth: 0 }} {...dataSet({ composerSpacer: '' })} />

      <View
        {...dataSet({ composerControl: 'effort', effort: effort.level, visible: effort.visible ? 'true' : 'false' })}
        style={{ display: effort.visible ? 'flex' : 'none', flexDirection: 'row' }}
      >
        <Pressable
          nativeID="effortTrigger"
          role="button"
          aria-label={effort.accessibilityLabel}
          aria-haspopup="dialog"
          aria-expanded={effort.expanded}
          onPress={effort.onPress}
          {...dataSet({ chatConfigTrigger: '' })}
          style={({ pressed, hovered }: PressState) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            height: COMPOSER_CONTROL_SIZE,
            paddingLeft: compact ? 10 : 12,
            paddingRight: 10,
            borderRadius: uiRadius.pill,
            backgroundColor: pressed ? colors.fillPressed
              : hovered || effort.expanded ? colors.fillHover
                : compact ? colors.fill : 'transparent',
          })}
        >
          {compact ? null : <UiText variant="bodySm" numberOfLines={1}>{effort.caption}</UiText>}
          {effort.value ? (
            <UiText
              variant={compact ? 'label' : 'bodySm'}
              numberOfLines={1}
              style={compact ? { fontWeight: '400', lineHeight: 18 } : undefined}
              aria-hidden
              {...dataSet({ effortValue: '' })}
            >
              {effort.value}
            </UiText>
          ) : null}
          <UiIcon name="chevron-down" size={compact ? 14 : 16} color={colors.inkTertiary} />
        </Pressable>
      </View>

      <RoundControl
        id="composerMicBtn"
        control="mic"
        label={mic.label}
        i18nKey={mic.i18nKey}
        pressed={mic.listening}
        filled={compact}
        onPress={mic.onPress}
      >
        <UiIcon name="mic" size={20} color={mic.listening ? colors.ink : colors.inkSecondary} />
      </RoundControl>

      <Pressable
        nativeID="composerPrimaryBtn"
        role="button"
        aria-label={primary.label}
        aria-disabled={!enabled}
        disabled={!enabled}
        onPress={primary.onPress}
        {...dataSet({ composerControl: 'send', stop: stop ? '1' : '0', ready: primary.ready ? 'true' : 'false', sending: primary.sending ? 'true' : 'false' })}
        style={({ pressed, hovered }: PressState) => ({
          width: COMPOSER_CONTROL_SIZE,
          height: COMPOSER_CONTROL_SIZE,
          borderRadius: uiRadius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          /* Site send disc: a quiet grey disc while there is nothing to
             send, the ink disc once there is (and while it means Stop). */
          backgroundColor: enabled
            ? (hovered ? colors.inkHover : colors.ink)
            : colors.fill,
          transform: [{ scale: pressed && enabled ? 0.94 : 1 }],
        })}
      >
        <View nativeID="composerPrimaryBtnContent">
          <UiIcon name={stop ? 'stop' : 'arrow-up'} size={18} color={enabled ? colors.onInk : colors.inkTertiary} />
        </View>
      </Pressable>
    </>
  );
}
