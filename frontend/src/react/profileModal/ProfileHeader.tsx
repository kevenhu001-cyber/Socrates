import { Input as ShadcnInput } from '../ui/shadcn/input';
import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';

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

  const handleNameBlur = useCallback((event: FocusEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    if (value === confirmed.current) return;
    void onSaveName(value).then((saved) => {
      if (!saved) setDraft(confirmed.current);
    });
  }, [onSaveName]);

  return (
    <div className="profile-header">
      <div className="profile-avatar" id="profileAvatar">{user.initials}</div>
      <ShadcnInput
        className="profile-name-input"
        id="profileName"
        type="text"
        maxLength={50}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={handleNameBlur}
        onKeyDown={handleNameKeyDown}
      />
      <div className="profile-email" id="profileEmail">{user.email}</div>
    </div>
  );
}
