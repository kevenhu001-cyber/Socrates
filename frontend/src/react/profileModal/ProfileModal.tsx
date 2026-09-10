import { clearHostMounted, hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { useCallback } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { t as _t } from '../legacy/gateway';
import {
  installProfileBridge,
  useProfileDispatch,
  useProfileSnapshot,
} from './profileModal.bridge';

const OVERLAY_ID = 'profileOverlay';

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v !== key ? v : fallback;
}

function ProfileModal() {
  const snap = useProfileSnapshot();
  const dispatch = useProfileDispatch();
  const user = snap.user;

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  return (
    <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
      <div className="profile-header">
        <div className="profile-avatar" id="profileAvatar">{user.initials}</div>
        <input
          className="profile-name-input"
          id="profileName"
          type="text"
          maxLength={50}
          defaultValue={user.displayName}
          onBlur={(e) => dispatch.saveName(e.target.value)}
          onKeyDown={handleNameKeyDown}
        />
        <div className="profile-email" id="profileEmail">{user.email}</div>
      </div>
      <div className="profile-body" id="profileBody">
        {/* Account section */}
        <div className="profile-section">
          <div className="profile-section-title">{i18n('profile.account', 'Account')}</div>
          <div className="profile-row">
            <span className="profile-row-label">{i18n('profile.joined', 'Joined')}</span>
            <span className="profile-row-value" id="profileJoined">{user.joinedAt}</span>
          </div>
          <div className="profile-row">
            <span className="profile-row-label">{i18n('profile.emailVerified', 'Email verified')}</span>
            <span
              className={`profile-row-value${user.verifiedAt ? ' profile-status-badge yes' : ' profile-status-badge no'}`}
              id="profileVerified"
            >
              {user.verifiedAt ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="profile-row">
            <span className="profile-row-label">{i18n('profile.userId', 'User ID')}</span>
            <span className="profile-row-value" id="profileUserId">
              <span className="profile-id-text">{user.userId}</span>
            </span>
          </div>
        </div>

        {/* Subscription section */}
        <div className="profile-section">
          <div className="profile-section-title">{i18n('profile.subscription', 'Subscription')}</div>
          <div className="profile-row">
            <span className="profile-row-label">{i18n('profile.currentPlan', 'Current plan')}</span>
            <span
              className={`profile-row-value tier-badge tier-${user.tier}`}
              id="profileTier"
              style={{ fontSize: 'calc(13px * var(--app-font-scale, 1))' }}
            >
              {user.tier.charAt(0).toUpperCase() + user.tier.slice(1)}
            </span>
          </div>
          <div
            className="profile-row"
            id="profileSubEndRow"
            style={{ display: user.subEnd || user.tier !== 'diophantus' ? 'flex' : 'none' }}
          >
            <span className="profile-row-label">{i18n('profile.renewal', 'Renewal')}</span>
            <span className="profile-row-value" id="profileSubEnd">
              {user.subEnd || '—'}
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            <a
              href="https://topodrive.top/pricing"
              className="profile-btn close-btn"
              style={{ textAlign: 'center', display: 'block', fontSize: 'calc(12px * var(--app-font-scale, 1))', padding: '8px 0' }}
            >
              {i18n('profile.comparePlans', 'Compare plans')}
            </a>
          </div>
        </div>

        {/* Preferences section */}
        <div className="profile-section">
          <div className="profile-section-title">{i18n('profile.preferences', 'Preferences')}</div>

          <div className="profile-row">
            <span className="profile-row-label">{i18n('profile.language', 'Language')}</span>
            <div className="profile-lang-toggle" id="profileLangToggle" role="group" aria-label={i18n('profile.language', 'Language')}>
              <button
                type="button"
                className={`profile-lang-option${snap.currentLang === 'en' ? ' active' : ''}`}
                id="profileLangEn"
                aria-pressed={snap.currentLang === 'en'}
                onClick={() => dispatch.setLang('en')}
              >
                English
              </button>
              <button
                type="button"
                className={`profile-lang-option${snap.currentLang === 'zh' ? ' active' : ''}`}
                id="profileLangZh"
                aria-pressed={snap.currentLang === 'zh'}
                onClick={() => dispatch.setLang('zh')}
              >
                中文
              </button>
            </div>
          </div>

          <div className="profile-toggle-desc">{i18n('profile.webSearchDesc', 'Enable web search to include real-time results in questions.')}</div>
          <button
            type="button"
            className="profile-toggle"
            id="profileWebSearchToggle"
            aria-pressed={snap.webSearchOn}
            onClick={() => dispatch.toggleWebSearch()}
          >
            <span className="profile-toggle-label">{i18n('profile.webSearch', 'Web search')}</span>
            <div
              className={`stg-toggle-track${snap.webSearchOn ? ' on' : ''}`}
              id="profileWebSearchTrack"
            >
              <div className="stg-toggle-knob" />
            </div>
          </button>

          <div className="profile-instructions">
            <label className="profile-instructions-label" htmlFor="profileInstResponse">
              {i18n('profile.howShouldIRespond', 'How should I respond?')}
            </label>
            <textarea
              id="profileInstResponse"
              name="profileInstResponse"
              className="profile-instructions-area"
              maxLength={4000}
              placeholder="e.g. Reply in concise bullet points. Cite sources inline as [1], [2]. Avoid hedging language."
              defaultValue={snap.instResponse}
              onInput={() => dispatch.onInstChange()}
            />
            <label
              className="profile-instructions-label"
              htmlFor="profileInstAbout"
              style={{ marginTop: 10 }}
            >
              {i18n('profile.whatDoYouKnow', 'What do you know about me?')}
            </label>
            <textarea
              id="profileInstAbout"
              name="profileInstAbout"
              className="profile-instructions-area"
              maxLength={4000}
              placeholder="e.g. I'm a backend engineer working on a payments product. I'm allergic to puns."
              defaultValue={snap.instAbout}
              onInput={() => dispatch.onInstChange()}
            />
            <div className="profile-instructions-foot">
              <span
                id="profileInstSaveState"
                className={snap.instSaveState?.className ?? 'profile-instructions-state'}
              >
                {snap.instSaveState?.text ?? ''}
              </span>
            </div>
          </div>
        </div>

        {/* Data section */}
        <div className="profile-section">
          <div className="profile-section-title">{i18n('profile.data', 'Data')}</div>

          <div className="profile-action-row">
            <div>
              <div className="profile-action-label">{i18n('profile.usage', 'Token usage')}</div>
              <div className="profile-action-desc">{i18n('profile.usage.desc', 'View daily token usage heatmap and monthly breakdown.')}</div>
            </div>
            <button
              type="button"
              className="profile-btn"
              onClick={() => dispatch.openUsage()}
              style={{ width: 'auto', padding: '6px 14px', flexShrink: 0 }}
            >
              {i18n('profile.view', 'View')}
            </button>
          </div>

          <div className="profile-action-row">
            <div>
              <div className="profile-action-label">{i18n('profile.archivedSessions', 'Archived sessions')}</div>
              <div className="profile-action-desc">{i18n('profile.archivedSessionsDesc', 'Sessions you deleted are kept here for 30 days before being permanently erased.')}</div>
            </div>
            <button
              type="button"
              className="profile-btn"
              onClick={() => dispatch.openStorage()}
              style={{ width: 'auto', padding: '6px 14px', flexShrink: 0 }}
            >
              {i18n('profile.manage', 'Manage')}
            </button>
          </div>

          <div className="profile-action-row">
            <div>
              <div className="profile-action-label">{i18n('profile.promptTemplates', 'Prompt templates')}</div>
              <div className="profile-action-desc">{i18n('profile.promptTemplatesDesc', 'Reusable prompts you can fire from the chat with /shortcut.')}</div>
            </div>
            <button
              type="button"
              className="profile-btn"
              onClick={() => dispatch.openPromptTemplates()}
              style={{ width: 'auto', padding: '6px 14px', flexShrink: 0 }}
            >
              {i18n('profile.manage', 'Manage')}
            </button>
          </div>

          <div className="profile-action-row">
            <div>
              <div className="profile-action-label">{i18n('profile.clearConversations', 'Clear conversations')}</div>
              <div className="profile-action-desc">{i18n('profile.clearConversationsDesc', 'Remove all local chat history.')}</div>
            </div>
            <button
              type="button"
              className="profile-btn warning"
              onClick={() => dispatch.clearCache()}
              style={{ width: 'auto', padding: '6px 14px', flexShrink: 0 }}
            >
              {i18n('profile.clear', 'Clear')}
            </button>
          </div>

          <div className="profile-action-row">
            <div>
              <div className="profile-action-label">{i18n('profile.clearApiSettings', 'Clear API settings')}</div>
              <div className="profile-action-desc">{i18n('profile.clearApiSettingsDesc', 'Remove all configured API providers and keys.')}</div>
            </div>
            <button
              type="button"
              className="profile-btn warning"
              onClick={() => dispatch.clearSettings()}
              style={{ width: 'auto', padding: '6px 14px', flexShrink: 0 }}
            >
              {i18n('profile.clear', 'Clear')}
            </button>
          </div>
        </div>

        {/* Danger zone section */}
        <div className="profile-section" style={{ display: 'none' }}>
          <div className="profile-section-title" style={{ color: 'hsl(0 60% 55%)' }}>
            {i18n('profile.dangerZone', 'Danger zone')}
          </div>
          <div className="profile-action-row">
            <div>
              <div className="profile-action-label">{i18n('profile.signOut', 'Sign out')}</div>
              <div className="profile-action-desc">{i18n('profile.signOutDesc', 'End your session on this device.')}</div>
            </div>
            <button
              type="button"
              className="profile-btn signout"
              onClick={() => { dispatch.signOut(); dispatch.close(); }}
              style={{ width: 'auto', padding: '6px 14px', flexShrink: 0 }}
            >
              {i18n('profile.signOut', 'Sign out')}
            </button>
          </div>
          <div className="profile-action-row">
            <div>
              <div className="profile-action-label" style={{ color: 'hsl(0 60% 55%)' }}>
                {i18n('profile.deleteAccount', 'Delete account')}
              </div>
              <div className="profile-action-desc">{i18n('profile.deleteAccountDesc', 'Permanently delete your account and all data.')}</div>
            </div>
            <button
              type="button"
              className="profile-btn danger"
              onClick={() => dispatch.deleteAccount()}
              style={{ width: 'auto', padding: '6px 14px', flexShrink: 0 }}
            >
              {i18n('profile.deleteAccount', 'Delete')}
            </button>
          </div>
        </div>
      </div>

      <div className="profile-actions" style={{ borderTop: '0.5px solid hsl(var(--border-300)/0.08)', paddingTop: 12 }}>
        <button
          type="button"
          className="profile-btn close-btn"
          data-initial-focus
          onClick={() => dispatch.close()}
        >
          {i18n('common.close', 'Close')}
        </button>
      </div>
    </div>
  );
}

export interface ProfileModalHandle {
  overlay: HTMLElement;
  root: Root;
  destroy: () => void;
}

export function hydrateProfileModal(): ProfileModalHandle | null {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return null;
  if (hostIsMountedBy(overlay, 'profile-modal')) {
    throw new Error('Profile modal React runtime was initialized more than once.');
  }

  installProfileBridge();

  const root = createRoot(overlay);
  root.render(<ProfileModal />);
  markHostMountedBy(overlay, 'profile-modal');
  return {
    overlay,
    root,
    destroy: () => {
      root.unmount();
      clearHostMounted(overlay);
    },
  };
}
