import { useEffect } from 'react';
import { Settings2Icon } from 'lucide-react';
import { Button } from '../ui/shadcn/button';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import { useNavigationStore } from '../../sidebar/navigation.store';
import { useLocaleRefresh, WebUiTheme } from '../rn/WebUiTheme';
import { getCurrentLang } from '../../ui/legacyI18n.ts';
import { AccountPageHeader } from '../settings/AccountPageHeader';
import { openSettings } from '../settings/settings.service';
import { useProfileDispatch, useProfileSnapshot } from './profile.store';
import { ProfileAccountSection, ProfileSubscriptionSection } from './ProfileAccountSections';
import { ProfileDataSection } from './ProfileDataSection';
import { ProfileHeader } from './ProfileHeader';
import { ProfilePreferencesSection } from './ProfilePreferencesSection';
import { profileText } from './profileText';

function ProfilePage() {
  useLocaleRefresh();
  const active = useNavigationStore((state) => state.activeDestination === 'profile');
  const snapshot = useProfileSnapshot();
  const dispatch = useProfileDispatch();

  useEffect(() => {
    if (active) document.getElementById('profileTitle')?.focus({ preventScroll: true });
  }, [active]);

  const language = getCurrentLang();
  const label = (zh: string, en: string) => (language === 'zh' ? zh : en);

  return (
    <WebUiTheme>
      <div className="profile-page account-page-content">
        <AccountPageHeader
          titleId="profileTitle"
          title={label('个人资料', 'Profile')}
          backLabel={label('返回', 'Back')}
          backId="profileBackBtn"
          onBack={dispatch.close}
        >
          <Button variant="ghost" onClick={() => openSettings({ section: 'account' })}>
            <Settings2Icon aria-hidden />
            {label('账户设置', 'Account settings')}
          </Button>
        </AccountPageHeader>
        <div className="profile-page-body">
          {snapshot.user.userId !== '—' && snapshot.user.userId ? (
            <>
              <ProfileHeader user={snapshot.user} onSaveName={dispatch.saveName} />
              <ProfileAccountSection user={snapshot.user} />
              <ProfileSubscriptionSection user={snapshot.user} />
              <ProfilePreferencesSection
                snapshot={snapshot}
                dispatch={dispatch}
                language={language}
              />
              <ProfileDataSection dispatch={dispatch} />
            </>
          ) : (
            <p role="status">
              {profileText(
                'profile.signInToView',
                label('请登录后查看个人资料。', 'Sign in to view your profile.'),
              )}
            </p>
          )}
        </div>
      </div>
    </WebUiTheme>
  );
}

export function mountProfilePage(): void {
  const host = document.getElementById('profilePage');
  if (host) mountOwnedRoot(host, 'profile-page', <ProfilePage />);
}
