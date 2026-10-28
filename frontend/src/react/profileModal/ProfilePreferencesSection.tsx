import { Label as ShadcnLabel } from '../ui/shadcn/label';
import { Textarea as ShadcnTextarea } from '../ui/shadcn/textarea';
import { ToggleGroup, ToggleGroupItem } from '../ui/shadcn/toggle-group';
import { Switch } from '../ui/shadcn/switch';
import { Field, FieldLabel } from '../ui/shadcn/field';
import { cn } from 'cn';
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
        <ToggleGroup id="profileLangToggle" value={[snapshot.currentLang]} aria-label={profileText('profile.language', 'Language')}
          onValueChange={(values) => { if (values[0] === 'en' || values[0] === 'zh') dispatch.setLang(values[0]); }}>
          <ToggleGroupItem
            type="button"
            className={cn(snapshot.currentLang === 'en' && 'active')}
            value="en"
            id="profileLangEn"
          >
            English
          </ToggleGroupItem>
          <ToggleGroupItem
            type="button"
            className={cn(snapshot.currentLang === 'zh' && 'active')}
            value="zh"
            id="profileLangZh"
          >
            中文
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="profile-toggle-desc">
        {profileText('profile.webSearchDesc', 'Enable web search to include real-time results in questions.')}
      </div>
      <Field orientation="horizontal" className="profile-row">
        <FieldLabel htmlFor="profileWebSearchToggle" className="flex-1">{profileText('profile.webSearch', 'Web search')}</FieldLabel>
        <Switch id="profileWebSearchToggle" checked={snapshot.webSearchOn} onCheckedChange={dispatch.toggleWebSearch} />
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
          onInput={dispatch.onInstChange}
        />
        <ShadcnLabel
          className="profile-instructions-label"
          htmlFor="profileInstAbout"
          style={{ marginTop: 10 }}
        >
          {profileText('profile.whatDoYouKnow', 'What do you know about me?')}
        </ShadcnLabel>
        <ShadcnTextarea
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
