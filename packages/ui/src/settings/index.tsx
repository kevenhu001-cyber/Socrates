import { uiRadius, uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';

export function AccountPageTitle({ id, title }: { id: string; title: string }) {
  return (
    <UiText nativeID={id} role="heading" variant="title" tabIndex={-1}>
      {title}
    </UiText>
  );
}

export function ProfileIdentity({ initials, email }: { initials: string; email: string }) {
  const { colors } = useUiTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: uiSpace[4] }}>
      <div
        aria-hidden
        style={{
          width: 56,
          height: 56,
          borderRadius: uiRadius.pill,
          backgroundColor: colors.fill,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <UiText variant="titleSm">{initials}</UiText>
      </div>
      <UiText nativeID="profileEmail" variant="body" tone="secondary" style={{ flexShrink: 1 }}>
        {email}
      </UiText>
    </div>
  );
}
