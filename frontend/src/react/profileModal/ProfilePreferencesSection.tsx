import type { ProfileDispatch, ProfileSnapshot } from './types';
import { profileText } from './profileText';

export function ProfilePreferencesSection({
  snapshot,
  dispatch,
}: {
  snapshot: ProfileSnapshot;
  dispatch: ProfileDispatch;
}) {
  return (
    <div className="profile-section">
      <div className="profile-section-title">{profileText('profile.preferences', 'Preferences')}</div>
      <div className="profile-row">
        <span className="profile-row-label">{profileText('profile.language', 'Language')}</span>
        <div className="profile-lang-toggle" id="profileLangToggle" role="group" aria-label={profileText('profile.language', 'Language')}>
          <button
            type="button"
            className={`profile-lang-option${snapshot.currentLang === 'en' ? ' active' : ''}`}
            id="profileLangEn"
            aria-pressed={snapshot.currentLang === 'en'}
            onClick={() => dispatch.setLang('en')}
          >
            English
          </button>
          <button
            type="button"
            className={`profile-lang-option${snapshot.currentLang === 'zh' ? ' active' : ''}`}
            id="profileLangZh"
            aria-pressed={snapshot.currentLang === 'zh'}
            onClick={() => dispatch.setLang('zh')}
          >
            中文
          </button>
        </div>
      </div>

      <div className="profile-toggle-desc">
        {profileText('profile.webSearchDesc', 'Enable web search to include real-time results in questions.')}
      </div>
      <button
        type="button"
        className="profile-toggle"
        id="profileWebSearchToggle"
        aria-pressed={snapshot.webSearchOn}
        onClick={dispatch.toggleWebSearch}
      >
        <span className="profile-toggle-label">{profileText('profile.webSearch', 'Web search')}</span>
        <div className={`stg-toggle-track${snapshot.webSearchOn ? ' on' : ''}`} id="profileWebSearchTrack">
          <div className="stg-toggle-knob" />
        </div>
      </button>

      <div className="profile-instructions">
        <label className="profile-instructions-label" htmlFor="profileInstResponse">
          {profileText('profile.howShouldIRespond', 'How should I respond?')}
        </label>
        <textarea
          id="profileInstResponse"
          name="profileInstResponse"
          className="profile-instructions-area"
          maxLength={4000}
          placeholder="e.g. Reply in concise bullet points. Cite sources inline as [1], [2]. Avoid hedging language."
          defaultValue={snapshot.instResponse}
          onInput={dispatch.onInstChange}
        />
        <label
          className="profile-instructions-label"
          htmlFor="profileInstAbout"
          style={{ marginTop: 10 }}
        >
          {profileText('profile.whatDoYouKnow', 'What do you know about me?')}
        </label>
        <textarea
          id="profileInstAbout"
          name="profileInstAbout"
          className="profile-instructions-area"
          maxLength={4000}
          placeholder="e.g. I'm a backend engineer working on a payments product. I'm allergic to puns."
          defaultValue={snapshot.instAbout}
          onInput={dispatch.onInstChange}
        />
        <div className="profile-instructions-foot">
          <span
            id="profileInstSaveState"
            className={snapshot.instSaveState?.className ?? 'profile-instructions-state'}
          >
            {snapshot.instSaveState?.text ?? ''}
          </span>
        </div>
      </div>
    </div>
  );
}
