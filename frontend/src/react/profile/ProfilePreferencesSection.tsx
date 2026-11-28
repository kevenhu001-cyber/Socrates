import { Label as ShadcnLabel } from '../ui/v3';
import { SegmentedControl, Switch, Textarea as ShadcnTextarea } from '../ui/v3';
import { Field, FieldLabel } from '../ui/v3';
import { useCallback, useRef } from 'react';
import { SectionCard } from '../ui/page/SectionCard';
import type { ProfileDispatch, ProfileSnapshot } from './types';
import { profileText } from './profileText';

export function ProfilePreferencesSection({
  snapshot,
  dispatch,
  language,
}: {
  snapshot: ProfileSnapshot;
  dispatch: ProfileDispatch;
  language: string;
}) {
  /* The two fields are one saved value, so an edit in either reports both.
     React reads its own fields — the legacy module never reaches into this
     surface for their values. */
  const responseRef = useRef<HTMLTextAreaElement>(null);
  const aboutRef = useRef<HTMLTextAreaElement>(null);
  const handleInstChange = useCallback(() => {
    dispatch.onInstChange(responseRef.current?.value ?? '', aboutRef.current?.value ?? '');
  }, [dispatch]);

  return (
    <SectionCard
      className="profile-section"
      title={profileText('profile.preferences', 'Preferences')}
    >
      <div className="profile-row" id="profileLangToggle">
        <span className="profile-row-label">{profileText('profile.language', 'Language')}</span>
        <SegmentedControl
          size="sm"
          pill
          value={language === 'zh' ? 'zh' : 'en'}
          aria-label={profileText('profile.language', 'Language')}
          onChange={(next) => {
            if (next === 'en' || next === 'zh') dispatch.setLang(next);
          }}
        >
          <SegmentedControl.Option value="en">English</SegmentedControl.Option>
          <SegmentedControl.Option value="zh">中文</SegmentedControl.Option>
        </SegmentedControl>
      </div>

      <Field orientation="horizontal" className="profile-row">
        <div>
          <FieldLabel htmlFor="profileWebSearchToggle">
            {profileText('profile.webSearch', 'Web search')}
          </FieldLabel>
          <div className="profile-toggle-desc" id="profileWebSearchDesc">
            {profileText(
              'profile.webSearchDesc',
              'Enable web search to include real-time results in questions.',
            )}
          </div>
        </div>
        <Switch
          id="profileWebSearchToggle"
          aria-describedby="profileWebSearchDesc"
          checked={snapshot.webSearchOn}
          onCheckedChange={dispatch.toggleWebSearch}
        />
      </Field>

      <div className="profile-instructions">
        <ShadcnLabel className="profile-instructions-label" htmlFor="profileInstResponse">
          {profileText('profile.howShouldIRespond', 'How should I respond?')}
        </ShadcnLabel>
        <ShadcnTextarea
          id="profileInstResponse"
          name="profileInstResponse"
          className="profile-instructions-area"
          maxLength={4000}
          placeholder="e.g. Reply in concise bullet points. Cite sources inline as [1], [2]. Avoid hedging language."
          defaultValue={snapshot.instResponse}
          onInput={handleInstChange}
        />
        <ShadcnLabel className="profile-instructions-label" htmlFor="profileInstAbout">
          {profileText('profile.whatDoYouKnow', 'What do you know about me?')}
        </ShadcnLabel>
        <ShadcnTextarea
          id="profileInstAbout"
          name="profileInstAbout"
          className="profile-instructions-area"
          maxLength={4000}
          placeholder="e.g. I'm a backend engineer working on a payments product. I'm allergic to puns."
          defaultValue={snapshot.instAbout}
          onInput={handleInstChange}
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
    </SectionCard>
  );
}
