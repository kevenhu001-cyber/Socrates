/**
 * Shared turn surfaces (RN-2, design R4): approval and error notices.
 *
 * Copy, icons and behaviour come from the host; these components only draw.
 * Status is spoken as a word (进行中 / 完成 / 失败 / 待审批) — never a dot.
 */
import { type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { uiFont } from '@socrates/theme';
import { H, R, S, insetRing, shadow, sheets } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { UiButton } from '../primitives/UiButton';

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
              {...{ dataSet: { approvalAction: decision.id } }}
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
