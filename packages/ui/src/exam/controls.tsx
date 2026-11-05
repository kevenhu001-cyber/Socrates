/**
 * Exam form and answer controls.
 *
 * @internal — these are exam-specific. If the settings surface needs the same
 * inputs, promote them to `primitives/` with native a11y review first.
 *
 * Grammar: hairline inset rings, `R.row` corners, the `H.row` 36px rung and
 * `look.ts` tokens only. Selection is a deeper ink ring plus the subtle fill;
 * no hue, no dots.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { uiType } from '@socrates/theme';
import { UiIcon, type UiGlyphName } from '../primitives';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { dataSet } from '../learn/parts';
import { H, R, S, insetRing, transition } from '../look';

export function ExamLabel({ children }: { children: string }) {
  return <UiText variant="labelSm" tone="secondary">{children}</UiText>;
}

function fieldBox(colors: ReturnType<typeof useUiTheme>['colors'], focused: boolean): object {
  return {
    borderRadius: R.row,
    backgroundColor: colors.card,
    boxShadow: focused ? insetRing(colors.hairlineFocus, 1.5) : insetRing(colors.hairlineStrong),
  };
}

export function ExamTextField({ id, label, value, placeholder, autoComplete, onChange }: {
  id?: string;
  label: string;
  value: string;
  placeholder?: string;
  autoComplete?: 'off' | 'name' | 'url' | 'email';
  onChange(value: string): void;
}) {
  const { colors, fontFamily, typeScale } = useUiTheme();
  const [focused, setFocused] = useState(false);
  const step = uiType.body;
  return (
    <View style={{ gap: S[50] }}>
      <ExamLabel>{label}</ExamLabel>
      <TextInput
        nativeID={id}
        aria-label={label}
        autoComplete={autoComplete}
        value={value}
        placeholder={placeholder}
        placeholderTextColor={colors.inkTertiary}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          ...fieldBox(colors, focused),
          height: H.row,
          paddingHorizontal: S[100],
          color: colors.ink,
          fontFamily,
          fontSize: Math.round(step.size * typeScale * 10) / 10,
        }}
      />
    </View>
  );
}

export function ExamTextArea({ id, label, value, placeholder, onChange }: {
  id?: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange(value: string): void;
}) {
  const { colors, fontFamily, typeScale } = useUiTheme();
  const [focused, setFocused] = useState(false);
  const step = uiType.body;
  return (
    <View style={{ gap: S[50] }}>
      <ExamLabel>{label}</ExamLabel>
      <TextInput
        nativeID={id}
        aria-label={label}
        multiline
        numberOfLines={3}
        value={value}
        placeholder={placeholder}
        placeholderTextColor={colors.inkTertiary}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          ...fieldBox(colors, focused),
          minHeight: 88,
          paddingHorizontal: S[100],
          paddingVertical: S[75],
          color: colors.ink,
          fontFamily,
          fontSize: Math.round(step.size * typeScale * 10) / 10,
          textAlignVertical: 'top',
        }}
      />
    </View>
  );
}

function ChoiceButton({ selected, children, onPress, role, checked }: {
  selected: boolean;
  children: ReactNode;
  onPress(): void;
  role: 'radio' | 'checkbox';
  checked: boolean;
}) {
  const { colors } = useUiTheme();
  const { hovered, handlers } = usePressFeedback();
  return (
    <Pressable role={role} aria-checked={checked} onPress={onPress} {...handlers}>
      <View
        style={{
          height: H.row,
          paddingHorizontal: S[200],
          justifyContent: 'center',
          borderRadius: R.row,
          backgroundColor: selected ? colors.subtle : hovered ? colors.fill : colors.card,
          boxShadow: insetRing(selected ? colors.ink : colors.hairlineStrong, selected ? 1.5 : 1),
          ...transition('background-color, box-shadow', false),
        }}
      >
        <UiText variant="labelSm" tone={selected ? 'ink' : 'secondary'}>{children}</UiText>
      </View>
    </Pressable>
  );
}

export function ExamSegmented<T extends string>({ id, label, value, options, onChange }: {
  id?: string;
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange(value: T): void;
}) {
  return (
    <View style={{ gap: S[50] }}>
      <ExamLabel>{label}</ExamLabel>
      <View nativeID={id} role="radiogroup" aria-label={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S[50] }}>
        {options.map((option) => (
          <ChoiceButton
            key={option.id}
            role="radio"
            checked={option.id === value}
            selected={option.id === value}
            onPress={() => onChange(option.id)}
          >
            {option.label}
          </ChoiceButton>
        ))}
      </View>
    </View>
  );
}

export function ExamTypeCards({ id, label, selection, options, onChange }: {
  id?: string;
  label: string;
  selection: { mc: boolean; fb: boolean; sa: boolean };
  options: readonly { id: 'mc' | 'fb' | 'sa'; title: string; hint: string }[];
  onChange(next: { mc: boolean; fb: boolean; sa: boolean }): void;
}) {
  const { colors } = useUiTheme();
  return (
    <View style={{ gap: S[50] }}>
      <ExamLabel>{label}</ExamLabel>
      <View nativeID={id} role="group" aria-label={label} style={{ gap: S[50] }}>
        {options.map((option) => {
          const selected = selection[option.id];
          return (
            <Pressable
              key={option.id}
              role="checkbox"
              aria-checked={selected}
              onPress={() => {
                const next = { ...selection, [option.id]: !selected };
                if (!next.mc && !next.fb && !next.sa) return;
                onChange(next);
              }}
            >
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: S[100],
                paddingHorizontal: S[100],
                paddingVertical: S[75],
                borderRadius: R.row,
                backgroundColor: selected ? colors.subtle : colors.card,
                boxShadow: insetRing(selected ? colors.ink : colors.hairlineStrong, selected ? 1.5 : 1),
              }}>
                <View style={{
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? colors.ink : 'transparent',
                  boxShadow: selected ? undefined : insetRing(colors.hairlineStrong, 1.5),
                }}>
                  {selected ? <UiText variant="labelSm" tone="onInk" style={{ fontSize: 11, lineHeight: 16 }}>✓</UiText> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <UiText variant="labelSm">{option.title}</UiText>
                  <UiText variant="bodySm" tone="tertiary">{option.hint}</UiText>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ExamIconButton({ label, icon, onPress, disabled }: {
  label: string;
  icon: UiGlyphName;
  onPress(): void;
  disabled?: boolean;
}) {
  const { colors } = useUiTheme();
  const { hovered, handlers } = usePressFeedback();
  return (
    <Pressable role="button" aria-label={label} aria-disabled={disabled || undefined} disabled={disabled} onPress={onPress} {...handlers}>
      <View style={{
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: R.row,
        backgroundColor: hovered && !disabled ? colors.fill : colors.card,
        boxShadow: insetRing(colors.hairlineStrong),
        opacity: disabled ? 0.4 : 1,
      }}>
        <UiIcon name={icon} size={16} color={colors.inkSecondary} />
      </View>
    </Pressable>
  );
}

export function ExamStepper({ valueId, value, min, max, fewerLabel, moreLabel, onChange }: {
  valueId?: string;
  value: number;
  min: number;
  max: number;
  fewerLabel: string;
  moreLabel: string;
  onChange(value: number): void;
}) {
  const { colors } = useUiTheme();
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: S[75] }}>
      <ExamIconButton label={fewerLabel} icon="minus" disabled={value <= min} onPress={() => onChange(clamp(value - 1))} />
      <UiText nativeID={valueId} variant="body" style={{ minWidth: 24, textAlign: 'center', color: colors.ink }}>{String(value)}</UiText>
      <ExamIconButton label={moreLabel} icon="plus" disabled={value >= max} onPress={() => onChange(clamp(value + 1))} />
    </View>
  );
}

export function ExamSelect({ id, label, value, placeholder, options, emptyLabel, onChange }: {
  id?: string;
  label: string;
  value: string;
  placeholder: string;
  options: readonly { id: string; label: string }[];
  emptyLabel: string;
  onChange(id: string): void;
}) {
  const { colors } = useUiTheme();
  const [open, setOpen] = useState(false);
  const { hovered, handlers } = usePressFeedback();
  const selected = options.find((option) => option.id === value);
  return (
    <View style={{ gap: S[50] }}>
      <ExamLabel>{label}</ExamLabel>
      <Pressable
        nativeID={id}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        onPress={() => setOpen((current) => !current)}
        {...handlers}
        {...dataSet({ examModelTrigger: 1 })}
      >
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S[75],
          height: H.row,
          paddingHorizontal: S[100],
          borderRadius: R.row,
          backgroundColor: hovered ? colors.fill : colors.card,
          boxShadow: insetRing(open ? colors.hairlineFocus : colors.hairlineStrong, open ? 1.5 : 1),
        }}>
          <UiText tone={selected ? 'ink' : 'tertiary'} numberOfLines={1} style={{ flex: 1 }}>
            {selected ? selected.label : placeholder}
          </UiText>
          <UiIcon name="chevron-down" size={16} color={colors.inkSecondary} />
        </View>
      </Pressable>
      {open ? (
        <View role="list" style={{
          borderRadius: R.row,
          backgroundColor: colors.card,
          boxShadow: insetRing(colors.hairlineStrong),
          padding: S[50],
          gap: 2,
        }}>
          {options.length ? options.map((option) => {
            const active = option.id === value;
            return (
              <Pressable
                key={option.id}
                role="option"
                aria-selected={active}
                onPress={() => {
                  setOpen(false);
                  onChange(option.id);
                }}
                {...dataSet({ examModelOption: option.id })}
              >
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: S[75],
                  paddingHorizontal: S[75],
                  paddingVertical: S[50],
                  borderRadius: R.row - 4,
                  backgroundColor: active ? colors.subtle : 'transparent',
                }}>
                  <UiText variant="bodySm" numberOfLines={1} style={{ flex: 1 }}>{option.label}</UiText>
                  {active ? <UiText variant="labelSm" tone="secondary">✓</UiText> : null}
                </View>
              </Pressable>
            );
          }) : (
            <View style={{ paddingHorizontal: S[75], paddingVertical: S[50] }}>
              <UiText variant="bodySm" tone="tertiary">{emptyLabel}</UiText>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

export function ExamChoiceRow({ letter, selected, disabled, verdict, onPress, children }: {
  letter: string;
  selected: boolean;
  disabled: boolean;
  verdict?: 'correct' | 'wrong';
  onPress?(): void;
  children: ReactNode;
}) {
  const { colors } = useUiTheme();
  const { hovered, handlers } = usePressFeedback();
  const ring = verdict === 'correct' ? colors.ink : verdict === 'wrong' ? colors.inkSecondary : selected ? colors.ink : colors.hairlineStrong;
  return (
    <Pressable
      role={disabled ? undefined : 'radio'}
      aria-checked={disabled ? undefined : selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onPress={onPress}
      {...handlers}
    >
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: S[75],
        minHeight: H.option,
        paddingHorizontal: S[100],
        paddingVertical: S[75],
        borderRadius: R.row,
        backgroundColor: selected || verdict === 'correct' ? colors.subtle : hovered && !disabled ? colors.fill : colors.card,
        boxShadow: insetRing(ring, selected || verdict ? 1.5 : 1),
      }}>
        <UiText variant="labelSm" tone="secondary" style={{ width: 20 }}>{letter}</UiText>
        <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
        {verdict === 'correct' ? <UiText variant="labelSm" tone="secondary">✓</UiText> : null}
        {verdict === 'wrong' ? <UiText variant="labelSm" tone="secondary">✕</UiText> : null}
      </View>
    </Pressable>
  );
}

export function ExamSection({ index, title, help, children }: {  index: string;
  title: string;
  help: string;
  children: ReactNode;
}) {
  const { colors } = useUiTheme();
  return (
    <View style={{
      gap: S[200],
      padding: S[200],
      borderRadius: R.card,
      backgroundColor: colors.card,
      boxShadow: insetRing(colors.hairlineStrong),
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: S[100] }}>
        <View style={{
          minWidth: 28,
          height: 22,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: R.pill,
          backgroundColor: colors.subtle,
        }}>
          <UiText variant="labelSm" tone="tertiary">{index}</UiText>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <UiText variant="titleSm">{title}</UiText>
          <UiText variant="bodySm" tone="tertiary">{help}</UiText>
        </View>
      </View>
      {children}
    </View>
  );
}

/** Answer input inside a question card: aria-label only, no visible label. */
export function ExamAnswerField({ label, value, placeholder, multiline, data, onChange }: {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  data?: Record<string, string | number | undefined>;
  onChange(value: string): void;
}) {
  const { colors, fontFamily, typeScale } = useUiTheme();
  const [focused, setFocused] = useState(false);
  const step = uiType.body;
  return (
    <TextInput
      aria-label={label}
      multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
      value={value}
      placeholder={placeholder}
      placeholderTextColor={colors.inkTertiary}
      onChangeText={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...dataSet(data ?? {})}
      style={{
        ...fieldBox(colors, focused),
        minHeight: multiline ? 88 : H.row,
        paddingHorizontal: S[100],
        paddingVertical: multiline ? S[75] : 0,
        color: colors.ink,
        fontFamily,
        fontSize: Math.round(step.size * typeScale * 10) / 10,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}

/** Read-only answer (results page and the share view). */
export function ExamAnswerDisplay({ value, data }: {
  value: string;
  data?: Record<string, string | number | undefined>;
}) {
  const { colors } = useUiTheme();
  return (
    <View
      {...dataSet(data ?? {})}
      style={{
        minHeight: H.row,
        justifyContent: 'center',
        paddingHorizontal: S[100],
        paddingVertical: S[75],
        borderRadius: R.row,
        backgroundColor: colors.subtle,
        boxShadow: insetRing(colors.hairlineStrong),
      }}
    >
      <UiText variant="body">{value}</UiText>
    </View>
  );
}

