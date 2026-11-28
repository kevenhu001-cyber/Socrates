import { Label as ShadcnLabel } from '../ui/shadcn/label';
import { Textarea as ShadcnTextarea } from '../ui/v3';
import { ToggleGroup, ToggleGroupItem } from '../ui/shadcn/toggle-group';
import { Switch } from '../ui/v3';
import { Field, FieldLabel } from '../ui/shadcn/field';
import { useCallback, useRef } from 'react';
import { cn } from 'cn';
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
      <div className="profile-row">
        <span className="profile-row-label">{profileText('profile.language', 'Language')}</span>
        <ToggleGroup
          id="profileLangToggle"
          value={[language]}
          aria-label={profileText('profile.language', 'Language')}
          onValueChange={(values) => {
            if (values[0] === 'en' || values[0] === 'zh') dispatch.setLang(values[0]);
          }}
        >
          <ToggleGroupItem
            type="button"
            className={cn(language === 'en' && 'active')}
            value="en"
            id="profileLangEn"
          >
            English
          </ToggleGroupItem>
          <ToggleGroupItem
            type="button"
            className={cn(language === 'zh' && 'active')}
            value="zh"
            id="profileLangZh"
          >
            中文
          </ToggleGroupItem>
        </ToggleGroup>
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
