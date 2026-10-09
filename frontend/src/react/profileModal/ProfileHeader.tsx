import { useCallback, type KeyboardEvent } from 'react';

import type { ProfileUserSnapshot } from './types';

export function ProfileHeader({
  user,
  onSaveName,
}: {
  user: ProfileUserSnapshot;
  onSaveName: (name: string) => void;
}) {
  const handleNameKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  }, []);

  return (
    <div className="profile-header">
      <div className="profile-avatar" id="profileAvatar">{user.initials}</div>
      <input
        className="profile-name-input"
        id="profileName"
        type="text"
        maxLength={50}
        defaultValue={user.displayName}
        onBlur={(event) => onSaveName(event.target.value)}
        onKeyDown={handleNameKeyDown}
      />
      <div className="profile-email" id="profileEmail">{user.email}</div>
    </div>
  );
}
