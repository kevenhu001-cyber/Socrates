/**
 * Tool cards (RN-2, design R4): one row per call, a collapsible
 * 「使用了 N 个工具」 group, approval and error notices.
 *
 * Copy, icons and behaviour come from the host; these components only draw.
 * Status is spoken as a word (进行中 / 完成 / 失败 / 待审批) — never a dot.
 */
import { type ReactNode } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { uiFont, uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { UiButton, usePressFeedback } from '../primitives/UiButton';
import { Chevron, useBreathing, useReveal } from './parts';
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
    <Animated.View style={{ opacity: breathing }}>
      <UiText testID={testID} role="status" variant="labelSm" tone={tone} numberOfLines={1} style={status === 'error' || status === 'awaiting' ? { fontWeight: '500' } : undefined}>
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

export function ToolCallRow({ id, icon, verb, target, status, statusLabel, duration, onPress, dataSet }: ToolCallRowProps) {
  const { colors } = useUiTheme();
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: uiSpace[2],
        minHeight: 36,
        paddingHorizontal: uiSpace[2],
        marginHorizontal: -uiSpace[2],
        borderRadius: uiRadius.md,
        backgroundColor: interactive && hovered ? colors.fill : 'transparent',
        outlineStyle: focused ? 'solid' : undefined,
        outlineWidth: focused ? 2 : 0,
        outlineColor: colors.ink,
        cursor: interactive ? 'pointer' : 'auto',
      }}
    >
      <View aria-hidden style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <UiText testID="tool-row-verb" variant="labelSm" tone="ink" numberOfLines={1} style={{ flexShrink: 0 }}>{verb}</UiText>
      {target ? (
        <UiText testID="tool-row-target" variant="labelSm" tone="secondary" numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, fontWeight: '400' }}>
          {target}
        </UiText>
      ) : null}
      <View style={{ flex: 1 }} />
      <StatusWord status={status} label={statusLabel} testID="tool-row-status" />
      {duration ? <UiText testID="tool-row-duration" variant="labelSm" tone="tertiary" style={{ fontWeight: '400', fontVariant: ['tabular-nums'] }}>{duration}</UiText> : null}
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

/** 「使用了 N 个工具」: a single summary row that expands into the calls. */
export function ToolCallGroup({ id, icon, title, status, statusLabel, duration, open, onToggle, bodyId, children }: ToolCallGroupProps) {
  const { colors } = useUiTheme();
  const { hovered, focused, handlers } = usePressFeedback();
  const reveal = useReveal(open);
  return (
    <View testID={`tool-group-${id}`}>
      <Pressable
        testID="tool-group-toggle"
        role="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onPress={onToggle}
        {...handlers}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: uiSpace[2],
          minHeight: 36,
          paddingHorizontal: uiSpace[2],
          marginHorizontal: -uiSpace[2],
          borderRadius: uiRadius.md,
          backgroundColor: hovered ? colors.fill : 'transparent',
          outlineStyle: focused ? 'solid' : undefined,
          outlineWidth: focused ? 2 : 0,
          outlineColor: colors.ink,
          cursor: 'pointer',
        }}
      >
        <View aria-hidden style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <UiText testID="tool-group-title" variant="labelSm" tone="ink" numberOfLines={1}>{title}</UiText>
        <View style={{ flex: 1 }} />
        <StatusWord status={status} label={statusLabel} testID="tool-group-status" />
        {duration ? <UiText variant="labelSm" tone="tertiary" style={{ fontWeight: '400' }}>{duration}</UiText> : null}
        <Chevron open={open} />
      </Pressable>
      <Animated.View
        testID="tool-group-body"
        nativeID={bodyId}
        aria-hidden={!open}
        style={[{
          display: open ? 'flex' : 'none',
          marginLeft: uiSpace[2] - 1,
          paddingLeft: uiSpace[4],
          borderLeftWidth: 1,
          borderLeftColor: colors.hairline,
        }, reveal]}
      >
        {children}
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

export function ToolApprovalCard({ title, description, badge, facts, status, decisions, showControls, onDecide }: ToolApprovalCardProps) {
  const { colors } = useUiTheme();
  return (
    <View
      testID="tool-approval"
      style={{
        gap: uiSpace[3],
        padding: uiSpace[4],
        borderRadius: uiRadius.lg,
        borderWidth: 1,
        borderColor: colors.hairlineStrong,
        backgroundColor: colors.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiSpace[2], flexWrap: 'wrap' }}>
        <View style={{ paddingHorizontal: uiSpace[2], paddingVertical: 1, borderRadius: uiRadius.pill, borderWidth: 1, borderColor: colors.hairlineStrong }}>
          <UiText variant="labelSm" tone="secondary">{badge}</UiText>
        </View>
        <UiText testID="tool-approval-title" variant="label" tone="ink" style={{ flexShrink: 1 }}>{title}</UiText>
      </View>
      <UiText variant="bodySm" tone="secondary">{description}</UiText>
      {facts.length ? (
        <View style={{ gap: uiSpace[1], paddingVertical: uiSpace[2], borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.hairline }}>
          {facts.map((fact) => (
            <View key={fact.label} style={{ flexDirection: 'row', gap: uiSpace[3], alignItems: 'baseline' }}>
              <UiText variant="labelSm" tone="tertiary" style={{ width: 56, fontWeight: '400' }}>{fact.label}</UiText>
              <MonoText style={{ flex: 1 }}>{fact.value}</MonoText>
            </View>
          ))}
        </View>
      ) : null}
      {status ? <UiText testID="tool-approval-status" variant="labelSm" tone="secondary" role="status" aria-live="polite">{status}</UiText> : null}
      {showControls && decisions.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiSpace[2] }}>
          {decisions.map((decision) => (
            <UiButton
              key={decision.id}
              testID={`tool-approval-${decision.id}`}
              label={decision.label}
              variant={decision.variant}
              size="sm"
              onPress={() => onDecide(decision.id)}
              {...dataProps({ approvalAction: decision.id })}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ToolErrorNotice({ message, retryLabel, onRetry }: { message: string; retryLabel?: string; onRetry?: () => void }) {
  const { colors } = useUiTheme();
  return (
    <View
      testID="tool-error"
      role="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: uiSpace[3],
        paddingVertical: uiSpace[2],
        paddingLeft: uiSpace[4],
        paddingRight: uiSpace[2],
        borderRadius: uiRadius.lg,
        borderWidth: 1,
        borderColor: colors.hairlineStrong,
      }}
    >
      <UiText testID="tool-error-message" variant="bodySm" tone="ink" style={{ flex: 1, minWidth: 160 }}>{message}</UiText>
      {retryLabel && onRetry ? <UiButton testID="tool-error-retry" label={retryLabel} variant="secondary" size="sm" onPress={onRetry} /> : null}
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
