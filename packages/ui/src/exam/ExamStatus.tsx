/** Loading / empty / error states. Copy is already baked by the host. */
import { R, S, insetRing } from '../look';
import { UiText } from '../primitives/UiText';
import { useUiTheme } from '../primitives/theme';
import type { ExamScreen } from './model';

type StatusScreen = Extract<ExamScreen, { kind: 'loading' | 'empty' | 'error' }>;

export function ExamStatus({ screen }: { screen: StatusScreen }) {
  const { colors } = useUiTheme();

  if (screen.kind === 'loading') {
    const percent = Math.max(0, Math.min(100, screen.percent));
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
          justifyContent: 'center',
          alignItems: 'center',
          gap: S[100],
          paddingTop: S[500],
          paddingBottom: S[500],
        }}
      >
        <UiText variant="titleSm">{screen.message}</UiText>
        <div
          style={{
            width: '100%',
            height: 3,
            borderRadius: R.pill,
            backgroundColor: colors.subtle,
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${percent}%`, height: '100%', backgroundColor: colors.ink }} />
        </div>
        <UiText variant="bodySm" tone="secondary">
          {screen.step}
        </UiText>
        <UiText variant="bodySm" tone="tertiary">
          {screen.subtitle}
        </UiText>
      </div>
    );
  }

  const isError = screen.kind === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
        gap: S[75],
        padding: S[200],
        borderRadius: R.card,
        backgroundColor: colors.card,
        boxShadow: insetRing(colors.hairlineStrong),
      }}
    >
      <UiText variant="titleSm">{screen.message}</UiText>
      {screen.detail ? (
        <UiText variant="bodySm" tone="secondary">
          {screen.detail}
        </UiText>
      ) : null}
    </div>
  );
}
