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
import { useState, type CSSProperties, type ReactNode } from 'react';
import { uiType } from '@socrates/theme';
import { dataAttributes } from '../domProps';
import { domStyle } from '../domStyle';
import { UiIcon, type UiGlyphName } from '../primitives';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { H, R, S, insetRing, transition } from '../look';

const BUTTON_RESET: CSSProperties = {
  appearance: 'none',
  margin: 0,
  padding: 0,
  border: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
};

export function ExamLabel({ children }: { children: string }) {
  return (
    <UiText variant="labelSm" tone="secondary">
      {children}
    </UiText>
  );
}

function fieldBox(colors: ReturnType<typeof useUiTheme>['colors'], focused: boolean): object {
  return {
    borderRadius: R.row,
    backgroundColor: colors.card,
    boxShadow: focused ? insetRing(colors.hairlineFocus, 1.5) : insetRing(colors.hairlineStrong),
  };
}

export function ExamTextField({
  id,
  label,
  value,
  placeholder,
  autoComplete,
  onChange,
}: {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[50] }}>
      <ExamLabel>{label}</ExamLabel>
      <input
        id={id}
        type="text"
        aria-label={label}
        autoComplete={autoComplete}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={domStyle({
          ...fieldBox(colors, focused),
          boxSizing: 'border-box',
          width: '100%',
          height: H.row,
          borderWidth: 0,
          outline: 'none',
          paddingLeft: S[100],
          paddingRight: S[100],
          color: colors.ink,
          fontFamily,
          fontSize: Math.round(step.size * typeScale * 10) / 10,
        })}
      />
    </div>
  );
}

export function ExamTextArea({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[50] }}>
      <ExamLabel>{label}</ExamLabel>
      <textarea
        id={id}
        rows={3}
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={domStyle({
          ...fieldBox(colors, focused),
          boxSizing: 'border-box',
          width: '100%',
          minHeight: 88,
          borderWidth: 0,
          outline: 'none',
          resize: 'vertical',
          paddingLeft: S[100],
          paddingRight: S[100],
          paddingTop: S[75],
          paddingBottom: S[75],
          color: colors.ink,
          fontFamily,
          fontSize: Math.round(step.size * typeScale * 10) / 10,
        })}
      />
    </div>
  );
}

function ChoiceButton({
  selected,
  children,
  onPress,
  role,
  checked,
}: {
  selected: boolean;
  children: ReactNode;
  onPress(): void;
  role: 'radio' | 'checkbox';
  checked: boolean;
}) {
  const { colors } = useUiTheme();
  const { hovered, handlers } = usePressFeedback();
  return (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      onClick={onPress}
      {...handlers}
      style={BUTTON_RESET}
    >
      <span
        style={{
          display: 'flex',
          height: H.row,
          paddingLeft: S[200],
          paddingRight: S[200],
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: R.row,
          backgroundColor: selected ? colors.subtle : hovered ? colors.fill : colors.card,
          boxShadow: insetRing(selected ? colors.ink : colors.hairlineStrong, selected ? 1.5 : 1),
          ...transition('background-color, box-shadow', false),
        }}
      >
        <UiText variant="labelSm" tone={selected ? 'ink' : 'secondary'}>
          {children}
        </UiText>
      </span>
    </button>
  );
}

export function ExamSegmented<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id?: string;
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange(value: T): void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[50] }}>
      <ExamLabel>{label}</ExamLabel>
      <div
        id={id}
        role="radiogroup"
        aria-label={label}
        style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: S[50] }}
      >
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
      </div>
    </div>
  );
}

export function ExamTypeCards({
  id,
  label,
  selection,
  options,
  onChange,
}: {
  id?: string;
  label: string;
  selection: { mc: boolean; fb: boolean; sa: boolean };
  options: readonly { id: 'mc' | 'fb' | 'sa'; title: string; hint: string }[];
  onChange(next: { mc: boolean; fb: boolean; sa: boolean }): void;
}) {
  const { colors } = useUiTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[50] }}>
      <ExamLabel>{label}</ExamLabel>
      <div
        id={id}
        role="group"
        aria-label={label}
        style={{ display: 'flex', flexDirection: 'column', gap: S[50] }}
      >
        {options.map((option) => {
          const selected = selection[option.id];
          return (
            <button
              key={option.id}
              type="button"
              role="checkbox"
              aria-checked={selected}
              onClick={() => {
                const next = { ...selection, [option.id]: !selected };
                if (!next.mc && !next.fb && !next.sa) return;
                onChange(next);
              }}
              style={BUTTON_RESET}
            >
              <span
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: S[100],
                  paddingLeft: S[100],
                  paddingRight: S[100],
                  paddingTop: S[75],
                  paddingBottom: S[75],
                  borderRadius: R.row,
                  backgroundColor: selected ? colors.subtle : colors.card,
                  boxShadow: insetRing(
                    selected ? colors.ink : colors.hairlineStrong,
                    selected ? 1.5 : 1,
                  ),
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    width: 18,
                    height: 18,
                    flexShrink: 0,
                    borderRadius: 5,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? colors.ink : 'transparent',
                    boxShadow: selected ? undefined : insetRing(colors.hairlineStrong, 1.5),
                  }}
                >
                  {selected ? (
                    <UiText variant="labelSm" tone="onInk" style={{ fontSize: 11, lineHeight: 16 }}>
                      ✓
                    </UiText>
                  ) : null}
                </span>
                <span
                  style={{ display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column', gap: 2 }}
                >
                  <UiText variant="labelSm">{option.title}</UiText>
                  <UiText variant="bodySm" tone="tertiary">
                    {option.hint}
                  </UiText>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ExamIconButton({
  label,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  icon: UiGlyphName;
  onPress(): void;
  disabled?: boolean;
}) {
  const { colors } = useUiTheme();
  const { hovered, handlers } = usePressFeedback();
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onPress}
      {...handlers}
      style={{ ...BUTTON_RESET, cursor: disabled ? 'default' : 'pointer' }}
    >
      <span
        style={{
          display: 'flex',
          width: 32,
          height: 32,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: R.row,
          backgroundColor: hovered && !disabled ? colors.fill : colors.card,
          boxShadow: insetRing(colors.hairlineStrong),
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <UiIcon name={icon} size={16} color={colors.inkSecondary} />
      </span>
    </button>
  );
}

export function ExamStepper({
  valueId,
  value,
  min,
  max,
  fewerLabel,
  moreLabel,
  onChange,
}: {
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
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: S[75] }}>
      <ExamIconButton
        label={fewerLabel}
        icon="minus"
        disabled={value <= min}
        onPress={() => onChange(clamp(value - 1))}
      />
      <UiText
        nativeID={valueId}
        variant="body"
        style={{ minWidth: 24, textAlign: 'center', color: colors.ink }}
      >
        {String(value)}
      </UiText>
      <ExamIconButton
        label={moreLabel}
        icon="plus"
        disabled={value >= max}
        onPress={() => onChange(clamp(value + 1))}
      />
    </div>
  );
}

export function ExamSelect({
  id,
  label,
  value,
  placeholder,
  options,
  emptyLabel,
  onChange,
}: {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[50] }}>
      <ExamLabel>{label}</ExamLabel>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        {...handlers}
        {...dataAttributes({ examModelTrigger: 1 })}
        style={{ ...BUTTON_RESET, width: '100%' }}
      >
        <span
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: S[75],
            height: H.row,
            paddingLeft: S[100],
            paddingRight: S[100],
            borderRadius: R.row,
            backgroundColor: hovered ? colors.fill : colors.card,
            boxShadow: insetRing(
              open ? colors.hairlineFocus : colors.hairlineStrong,
              open ? 1.5 : 1,
            ),
          }}
        >
          <UiText tone={selected ? 'ink' : 'tertiary'} numberOfLines={1} style={{ flex: 1 }}>
            {selected ? selected.label : placeholder}
          </UiText>
          <UiIcon name="chevron-down" size={16} color={colors.inkSecondary} />
        </span>
      </button>
      {open ? (
        <div
          role="list"
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderRadius: R.row,
            backgroundColor: colors.card,
            boxShadow: insetRing(colors.hairlineStrong),
            padding: S[50],
            gap: 2,
          }}
        >
          {options.length ? (
            options.map((option) => {
              const active = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setOpen(false);
                    onChange(option.id);
                  }}
                  {...dataAttributes({ examModelOption: option.id })}
                  style={BUTTON_RESET}
                >
                  <span
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: S[75],
                      paddingLeft: S[75],
                      paddingRight: S[75],
                      paddingTop: S[50],
                      paddingBottom: S[50],
                      borderRadius: R.row - 4,
                      backgroundColor: active ? colors.subtle : 'transparent',
                    }}
                  >
                    <UiText variant="bodySm" numberOfLines={1} style={{ flex: 1 }}>
                      {option.label}
                    </UiText>
                    {active ? (
                      <UiText variant="labelSm" tone="secondary">
                        ✓
                      </UiText>
                    ) : null}
                  </span>
                </button>
              );
            })
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                paddingLeft: S[75],
                paddingRight: S[75],
                paddingTop: S[50],
                paddingBottom: S[50],
              }}
            >
              <UiText variant="bodySm" tone="tertiary">
                {emptyLabel}
              </UiText>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ExamChoiceRow({
  letter,
  selected,
  disabled,
  verdict,
  onPress,
  children,
}: {
  letter: string;
  selected: boolean;
  disabled: boolean;
  verdict?: 'correct' | 'wrong';
  onPress?(): void;
  children: ReactNode;
}) {
  const { colors } = useUiTheme();
  const { hovered, handlers } = usePressFeedback();
  const ring =
    verdict === 'correct'
      ? colors.ink
      : verdict === 'wrong'
        ? colors.inkSecondary
        : selected
          ? colors.ink
          : colors.hairlineStrong;
  return (
    <button
      type="button"
      role={disabled ? undefined : 'radio'}
      aria-checked={disabled ? undefined : selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onPress}
      {...handlers}
      style={{ ...BUTTON_RESET, cursor: disabled ? 'default' : 'pointer' }}
    >
      <span
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: S[75],
          minHeight: H.option,
          paddingLeft: S[100],
          paddingRight: S[100],
          paddingTop: S[75],
          paddingBottom: S[75],
          borderRadius: R.row,
          backgroundColor:
            selected || verdict === 'correct'
              ? colors.subtle
              : hovered && !disabled
                ? colors.fill
                : colors.card,
          boxShadow: insetRing(ring, selected || verdict ? 1.5 : 1),
        }}
      >
        <UiText variant="labelSm" tone="secondary" style={{ width: 20 }}>
          {letter}
        </UiText>
        <span style={{ display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column' }}>
          {children}
        </span>
        {verdict === 'correct' ? (
          <UiText variant="labelSm" tone="secondary">
            ✓
          </UiText>
        ) : null}
        {verdict === 'wrong' ? (
          <UiText variant="labelSm" tone="secondary">
            ✕
          </UiText>
        ) : null}
      </span>
    </button>
  );
}

export function ExamSection({
  index,
  title,
  help,
  children,
}: {
  index: string;
  title: string;
  help: string;
  children: ReactNode;
}) {
  const { colors } = useUiTheme();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: S[200],
        padding: S[200],
        borderRadius: R.card,
        backgroundColor: colors.card,
        boxShadow: insetRing(colors.hairlineStrong),
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: S[100] }}>
        <div
          style={{
            display: 'flex',
            minWidth: 28,
            height: 22,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: R.pill,
            backgroundColor: colors.subtle,
          }}
        >
          <UiText variant="labelSm" tone="tertiary">
            {index}
          </UiText>
        </div>
        <div style={{ display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column', gap: 2 }}>
          <UiText variant="titleSm">{title}</UiText>
          <UiText variant="bodySm" tone="tertiary">
            {help}
          </UiText>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Answer input inside a question card: aria-label only, no visible label. */
export function ExamAnswerField({
  label,
  value,
  placeholder,
  multiline,
  data,
  onChange,
}: {
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
  const style: CSSProperties = domStyle({
    ...fieldBox(colors, focused),
    boxSizing: 'border-box',
    width: '100%',
    minHeight: multiline ? 88 : H.row,
    borderWidth: 0,
    outline: 'none',
    resize: multiline ? 'vertical' : 'none',
    paddingLeft: S[100],
    paddingRight: S[100],
    paddingTop: multiline ? S[75] : 0,
    paddingBottom: multiline ? S[75] : 0,
    color: colors.ink,
    fontFamily,
    fontSize: Math.round(step.size * typeScale * 10) / 10,
  });
  const shared = {
    'aria-label': label,
    value,
    placeholder,
    onChange: (event: { currentTarget: { value: string } }) => onChange(event.currentTarget.value),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    ...dataAttributes(data ?? {}),
    style,
  };
  return multiline ? <textarea rows={3} {...shared} /> : <input type="text" {...shared} />;
}

/** Read-only answer (results page and the share view). */
export function ExamAnswerDisplay({
  value,
  data,
}: {
  value: string;
  data?: Record<string, string | number | undefined>;
}) {
  const { colors } = useUiTheme();
  return (
    <div
      {...dataAttributes(data ?? {})}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: H.row,
        justifyContent: 'center',
        paddingLeft: S[100],
        paddingRight: S[100],
        paddingTop: S[75],
        paddingBottom: S[75],
        borderRadius: R.row,
        backgroundColor: colors.subtle,
        boxShadow: insetRing(colors.hairlineStrong),
      }}
    >
      <UiText variant="body">{value}</UiText>
    </div>
  );
}
