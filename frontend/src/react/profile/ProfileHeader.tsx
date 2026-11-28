import { profileText } from './profileText';
import { Label } from '../ui/shadcn/label';
import { Input as ShadcnInput } from '../ui/v3';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';

import type { ProfileUserSnapshot } from './types';

export function ProfileHeader({
  user,
  onSaveName,
}: {
  user: ProfileUserSnapshot;
  onSaveName: (name: string) => Promise<boolean>;
}) {
  /* The field is a draft until the server confirms it: a rejected rename
     restores the confirmed name instead of leaving the rejected text in
     the input. */
  const suggestedName = user.email.split('@')[0];
  const [draft, setDraft] = useState(user.displayName);
  const confirmed = useRef(user.displayName);

  useEffect(() => {
    if (user.displayName === confirmed.current) return;
    confirmed.current = user.displayName;
    setDraft(user.displayName);
  }, [user.displayName]);

  const handleNameKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  }, []);

  const handleNameBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      const value = event.currentTarget.value;
      if (value === confirmed.current) return;
      void onSaveName(value).then((saved) => {
        if (!saved) setDraft(confirmed.current);
      });
    },
    [onSaveName],
  );

  return (
    <div className="profile-header">
      <div className="profile-identity">
        <span className="profile-avatar" aria-hidden="true">
          {user.initials}
        </span>
        <div className="profile-identity-copy">
          <strong>{user.displayName || suggestedName}</strong>
          <span id="profileEmail">{user.email}</span>
        </div>
      </div>
      <div className="profile-display-name">
        <Label htmlFor="profileName">{profileText('profile.displayName', 'Display name')}</Label>
        <ShadcnInput
          className="profile-name-input"
          id="profileName"
          type="text"
          maxLength={50}
          autoComplete="nickname"
          placeholder={suggestedName}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={handleNameKeyDown}
        />
      </div>
    </div>
  );
}
