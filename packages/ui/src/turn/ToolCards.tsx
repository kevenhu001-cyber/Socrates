/**
 * Tool cards (RN-2, design R4): one row per call, a collapsible
 * 「使用了 N 个工具」 group, approval and error notices.
 *
 * Copy, icons and behaviour come from the host; these components only draw.
 * Status is spoken as a word (进行中 / 完成 / 失败 / 待审批) — never a dot.
 */
import { Children, createContext, useContext, type ReactNode } from 'react';
import { Animated, Pressable, View, useWindowDimensions } from 'react-native';
import { uiFont } from '@socrates/theme';
import { H, R, S, focusRing, insetRing, shadow, sheets, transition } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { UiButton, usePressFeedback } from '../primitives/UiButton';
import { Chevron, useBreathing, useReducedMotion, useReveal } from './parts';
import type { ToolCardStatus } from './toolCardModel';

type DataSet = Record<string, string | undefined>;

/** RN's types omit RNW's `dataSet`; it still reaches the DOM as data-*. */
function dataProps(dataSet?: DataSet): object {
  return dataSet ? { dataSet } : {};
}

function StatusWord({ status, label, testID }: { status: ToolCardStatus; label: string; testID?: string }) {
  const breathing = useBreathing(status === 'running');
  const tone = status === 'error' || status === 'awaiting' ? 'ink' : 'tertiary';
  return (
    <Animated.View style={{ opacity: breathing, flexShrink: 0 }}>
      <UiText testID={testID} role="status" variant="labelSm" tone={tone} numberOfLines={1} style={{ flexShrink: 0, minWidth: 0, ...(status === 'error' || status === 'awaiting' ? { fontWeight: '500' } : {}) }}>
        {label}
      </UiText>
    </Animated.View>
  );
}

export interface ToolCallRowProps {
  id: string;
  icon?: ReactNode;
  verb: string;
  target?: string;
  status: ToolCardStatus;
  statusLabel: string;
  duration?: string;
  /** Opens the detail drawer / sheet. Omit to render a static row. */
  onPress?: () => void;
  dataSet?: DataSet;
}

/** Rows inside a 「使用了 N 个工具」 sheet sit flush and are ruled by hairlines. */
const InGroup = createContext(false);

/** The tool's glyph in a 24px ringed tile (site `.story-step` index chip). */
function IconTile({ children }: { children?: ReactNode }) {
  const { colors } = useUiTheme();
  return (
    <View
      aria-hidden
      style={{
        width: 24,
        height: 24,
        flexShrink: 0,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.card,
        boxShadow: insetRing(colors.hairline),
      }}
    >
      {children}
    </View>
  );
}

export function ToolCallRow({ id, icon, verb, target, status, statusLabel, duration, onPress, dataSet }: ToolCallRowProps) {
  const { colors } = useUiTheme();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const grouped = useContext(InGroup);
  const { subtle, surface } = sheets(colors);
  const { hovered, focused, handlers } = usePressFeedback();
  const interactive = Boolean(onPress);
  const label = [verb, target, statusLabel, duration].filter(Boolean).join(' · ');
  return (
    <Pressable
      testID={`tool-row-${id}`}
      role={interactive ? 'button' : undefined}
      aria-label={label}
      aria-haspopup={interactive ? 'dialog' : undefined}
      disabled={!interactive}
      onPress={onPress}
      {...handlers}
      {...dataProps(dataSet)}
      style={{
        alignSelf: 'stretch',
        minWidth: 0,
        flexDirection: 'row',
        flexWrap: 'nowrap',
        alignItems: 'center',
        gap: S[100],
        minHeight: width < 768 ? H.head : H.row,
        paddingHorizontal: grouped ? S[200] : S[75],
        marginHorizontal: grouped ? 0 : -S[75],
        borderRadius: grouped ? 0 : R.row,
        backgroundColor: interactive && hovered ? (grouped ? surface : subtle) : 'transparent',
        ...focusRing(colors, focused, grouped ? -2 : 2),
        ...transition('background-color', reduced),
        cursor: interactive ? 'pointer' : 'auto',
      }}
    >
      <IconTile>{icon}</IconTile>
      <UiText testID="tool-row-verb" variant="labelSm" tone="ink" numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1, minWidth: 0, maxWidth: '48%' }}>{verb}</UiText>
      {target ? (
        <UiText testID="tool-row-target" variant="labelSm" tone="secondary" numberOfLines={1} ellipsizeMode="tail" style={{ flex: 1, minWidth: 0, fontWeight: '400' }}>
          {target}
        </UiText>
      ) : <View style={{ flex: 1, minWidth: 0 }} />}
      <StatusWord status={status} label={statusLabel} testID="tool-row-status" />
      {duration ? <UiText testID="tool-row-duration" variant="labelSm" tone="tertiary" numberOfLines={1} style={{ flexShrink: 0, fontWeight: '400', fontVariant: ['tabular-nums'] }}>{duration}</UiText> : null}
      {interactive ? <Chevron /> : null}
    </Pressable>
  );
}

export interface ToolCallGroupProps {
  id: string;
  icon?: ReactNode;
  title: string;
  status: ToolCardStatus;
  statusLabel: string;
  duration?: string;
  open: boolean;
  onToggle(): void;
  bodyId: string;
  children: ReactNode;
}

/**
 * 「使用了 N 个工具」: a tinted sheet (site `.story-step`, #f9f9f9 + hairline
 * ring, 16px radius) whose 44px head expands into the calls, one per
 * hairline-ruled row.
 */
export function ToolCallGroup({ id, icon, title, status, statusLabel, duration, open, onToggle, bodyId, children }: ToolCallGroupProps) {
  const { colors } = useUiTheme();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { subtle, surface } = sheets(colors);
  const { hovered, focused, handlers } = usePressFeedback();
  const reveal = useReveal(open);
  return (
    <View
      testID={`tool-group-${id}`}
      style={{ width: '100%', minWidth: 0, borderRadius: R.card, backgroundColor: subtle, boxShadow: insetRing(colors.hairline), overflow: 'hidden' }}
    >
      <Pressable
        testID="tool-group-toggle"
        role="button"
        aria-expanded={open}
        aria-controls={bodyId}
        accessibilityLabel={[title, statusLabel, duration].filter(Boolean).join(' · ')}
        onPress={onToggle}
        {...handlers}
        style={{
          alignSelf: 'stretch',
          width: '100%',
          minWidth: 0,
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'center',
          gap: S[100],
          minHeight: H.head,
          paddingHorizontal: S[200],
          backgroundColor: hovered ? surface : 'transparent',
          ...focusRing(colors, focused, -2),
          ...transition('background-color', reduced),
          cursor: 'pointer',
        }}
      >
        <IconTile>{icon}</IconTile>
        <UiText testID="tool-group-title" variant="labelSm" tone="ink" numberOfLines={1} ellipsizeMode="tail" style={{ flex: 1, minWidth: 0 }}>{title}</UiText>
        <StatusWord status={status} label={statusLabel} testID="tool-group-status" />
        {duration && width >= 360 ? <UiText variant="labelSm" tone="tertiary" numberOfLines={1} style={{ flexShrink: 0, fontWeight: '400', fontVariant: ['tabular-nums'] }}>{duration}</UiText> : null}
        <Chevron open={open} />
      </Pressable>
      <Animated.View
        testID="tool-group-body"
        nativeID={bodyId}
        aria-hidden={!open}
        style={[{
          display: open ? 'flex' : 'none',
          borderTopWidth: 1,
          borderTopColor: colors.hairline,
          backgroundColor: colors.card,
          width: '100%',
          minWidth: 0,
        }, reveal]}
      >
        <InGroup.Provider value>
          {Children.map(children, (child, index) => (
            <View style={{ width: '100%', minWidth: 0, borderTopWidth: index ? 1 : 0, borderTopColor: colors.hairline }}>{child}</View>
          ))}
        </InGroup.Provider>
      </Animated.View>
    </View>
  );
}

export interface ApprovalDecisionView {
  id: string;
  label: string;
  variant: 'primary' | 'secondary' | 'ghost';
}

export interface ToolApprovalCardProps {
  title: string;
  description: string;
  badge: string;
  facts: ReadonlyArray<{ label: string; value: string }>;
  status: string;
  decisions: ReadonlyArray<ApprovalDecisionView>;
  /** Controls hidden (share view, already decided, request in flight). */
  showControls: boolean;
  onDecide(id: string): void;
}

/**
 * Approval: a white card on the site lift (shadow-1), the badge as a 24px
 * tag, the call's facts in a tinted inset sheet, decisions as capsules.
 */
export function ToolApprovalCard({ title, description, badge, facts, status, decisions, showControls, onDecide }: ToolApprovalCardProps) {
  const { colors } = useUiTheme();
  const { width } = useWindowDimensions();
  const { subtle } = sheets(colors);
  return (
    <View
      testID="tool-approval"
      style={{
        gap: S[200],
        padding: S[300],
        borderRadius: R.card,
        backgroundColor: colors.card,
        boxShadow: shadow(colors, 'raised'),
      }}
    >
      <View style={{ gap: S[75] }}>
        <View style={{ alignSelf: 'flex-start', height: H.tag, justifyContent: 'center', paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: colors.fill }}>
          <UiText variant="labelSm" tone="secondary" style={{ fontWeight: '400' }}>{badge}</UiText>
        </View>
        <UiText testID="tool-approval-title" variant="label" tone="ink">{title}</UiText>
        <UiText variant="bodySm" tone="secondary">{description}</UiText>
      </View>
      {facts.length ? (
        <View style={{ gap: S[75], padding: S[200], borderRadius: R.row, backgroundColor: subtle, boxShadow: insetRing(colors.hairline) }}>
          {facts.map((fact) => (
            <View key={fact.label} style={{ flexDirection: 'row', gap: S[100], alignItems: 'baseline' }}>
              <UiText variant="labelSm" tone="tertiary" style={{ width: 56, fontWeight: '400' }}>{fact.label}</UiText>
              <MonoText style={{ flex: 1 }}>{fact.value}</MonoText>
            </View>
          ))}
        </View>
      ) : null}
      {status ? <UiText testID="tool-approval-status" variant="labelSm" tone="secondary" role="status" aria-live="polite">{status}</UiText> : null}
      {showControls && decisions.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S[75] }}>
          {decisions.map((decision) => (
            <UiButton
              key={decision.id}
              testID={`tool-approval-${decision.id}`}
              label={decision.label}
              variant={decision.variant}
              size={width < 768 ? 'lg' : 'sm'}
              onPress={() => onDecide(decision.id)}
              {...dataProps({ approvalAction: decision.id })}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Failed call: a tinted sheet with a ringed ✕ mark, the message and a retry capsule. */
export function ToolErrorNotice({ message, retryLabel, onRetry }: { message: string; retryLabel?: string; onRetry?: () => void }) {
  const { colors } = useUiTheme();
  const { width } = useWindowDimensions();
  const { subtle } = sheets(colors);
  return (
    <View
      testID="tool-error"
      role="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: S[100],
        minHeight: H.option,
        paddingVertical: S[75],
        paddingLeft: S[100],
        paddingRight: S[75],
        borderRadius: R.row,
        backgroundColor: subtle,
        boxShadow: insetRing(colors.hairlineStrong),
      }}
    >
      <View aria-hidden style={{ width: 20, height: 20, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', boxShadow: insetRing(colors.hairlineStrong, 1.5) }}>
        <UiText variant="labelSm" tone="secondary" style={{ fontSize: 11, lineHeight: 20 }}>✕</UiText>
      </View>
      <UiText testID="tool-error-message" variant="bodySm" tone="ink" style={{ flex: 1, minWidth: 160 }}>{message}</UiText>
      {retryLabel && onRetry ? <UiButton testID="tool-error-retry" label={retryLabel} variant="secondary" size={width < 768 ? 'lg' : 'sm'} onPress={onRetry} /> : null}
    </View>
  );
}

export function MonoText({ children, style, testID }: { children: ReactNode; style?: object; testID?: string }) {
  const { colors } = useUiTheme();
  return (
    <UiText testID={testID} variant="labelSm" tone="ink" selectable style={[{ fontFamily: monoFamily, fontWeight: '400', color: colors.ink }, style]}>
      {children}
    </UiText>
  );
}

export const monoFamily = uiFont.mono;
