import React, { useEffect, useRef, useState } from 'react';
import { getLegacyActions, t as _t } from '../legacy/gateway';
import type { UserInfo } from './types';

export interface ClerkUserButtonProps {
  user: UserInfo;
}

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v && v !== key ? v : fallback;
}

export function ClerkUserButton({ user }: ClerkUserButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="user-btn__root" ref={rootRef}>
      {/* Closed Button / User Row Trigger */}
      <div
        className={`user-row user-btn__trigger${open ? ' user-btn__trigger--active' : ''}`}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={i18n('profile.account', 'Account menu')}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
      >
        <div className="user-avatar user-btn__avatar">{user.initials}</div>
        <div className="user-identity" style={{ flex: 1, minWidth: 0 }}>
          <div
            className="user-name"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {user.displayName}
          </div>
          <div className="user-plan">
            <span className={`tier-badge ${user.tier}`}>{user.tierLabel}</span>
          </div>
        </div>
      </div>

      {/* Expanded Popover Card (Motion Clerk Style) */}
      {open && (
        <div
          className="user-btn__open"
          ref={menuRef}
          role="menu"
          aria-label={i18n('profile.account', 'Account menu')}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Card Header with Large Avatar & User Details */}
          <div className="user-btn__menu-header">
            <div className="user-btn__avatar user-btn__avatar--large">
              {user.initials}
            </div>
            <div className="user-btn__menu-header-content">
              <p className="user-btn__name">{user.displayName || 'Guest'}</p>
              <p className="user-btn__email">{user.email || '—'}</p>
            </div>
          </div>

          {/* Menu Actions */}
          <div className="user-btn__menu-content">
            <button
              type="button"
              className="user-btn__menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                getLegacyActions().navigation.openProfile();
              }}
            >
              <svg className="user-btn__icon" viewBox="0 0 16 16" fill="currentColor">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M6.559 2.536A.667.667 0 0 1 7.212 2h1.574a.667.667 0 0 1 .653.536l.22 1.101c.466.178.9.429 1.287.744l1.065-.36a.667.667 0 0 1 .79.298l.787 1.362a.666.666 0 0 1-.136.834l-.845.742c.079.492.079.994 0 1.486l.845.742a.666.666 0 0 1 .137.833l-.787 1.363a.667.667 0 0 1-.791.298l-1.065-.36c-.386.315-.82.566-1.286.744l-.22 1.101a.666.666 0 0 1-.654.536H7.212a.666.666 0 0 1-.653-.536l-.22-1.101a4.664 4.664 0 0 1-1.287-.744l-1.065.36a.666.666 0 0 1-.79-.298L2.41 10.32a.667.667 0 0 1 .136-.834l.845-.743a4.7 4.7 0 0 1 0-1.485l-.845-.742a.667.667 0 0 1-.137-.833l.787-1.363a.667.667 0 0 1 .791-.298l1.065.36c.387-.315.821-.566 1.287-.744l.22-1.101ZM7.999 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
                />
              </svg>
              <span>{i18n('profile.account', 'Manage account')}</span>
            </button>

            <button
              type="button"
              className="user-btn__menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                try {
                  const el =
                    document.getElementById('openUsageModalBtn') ||
                    document.querySelector('[data-action="openUsage"]');
                  if (el) (el as HTMLElement).click();
                  else getLegacyActions().navigation.openProfile();
                } catch (_) {
                  getLegacyActions().navigation.openProfile();
                }
              }}
            >
              <svg
                className="user-btn__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>{i18n('profile.usage', 'Token usage')}</span>
            </button>

            <button
              type="button"
              className="user-btn__menu-item user-btn__menu-item--danger"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                try {
                  if (typeof (window as any).signOut === 'function') (window as any).signOut();
                  else if (typeof (window as any).logout === 'function') (window as any).logout();
                  else window.location.href = '/login';
                } catch (_) {}
              }}
            >
              <svg className="user-btn__icon" viewBox="0 0 16 16" fill="currentColor">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M2.6 2.604A2.045 2.045 0 0 1 4.052 2h3.417c.544 0 1.066.217 1.45.604.385.387.601.911.601 1.458v.69c0 .413-.334.75-.746.75a.748.748 0 0 1-.745-.75v-.69a.564.564 0 0 0-.56-.562H4.051a.558.558 0 0 0-.56.563v7.875a.564.564 0 0 0 .56.562h3.417a.558.558 0 0 0 .56-.563v-.671c0-.415.333-.75.745-.75s.746.335.746.75v.671c0 .548-.216 1.072-.6 1.459a2.045 2.045 0 0 1-1.45.604H4.05a2.045 2.045 0 0 1-1.45-.604A2.068 2.068 0 0 1 2 11.937V4.064c0-.548.216-1.072.6-1.459Zm8.386 3.116a.743.743 0 0 1 1.055 0l1.74 1.75a.753.753 0 0 1 0 1.06l-1.74 1.75a.743.743 0 0 1-1.055 0 .753.753 0 0 1 0-1.06l.467-.47H5.858A.748.748 0 0 1 5.112 8c0-.414.334-.75.746-.75h5.595l-.467-.47a.753.753 0 0 1 0-1.06Z"
                />
              </svg>
              <span>{i18n('profile.signOut', 'Sign out')}</span>
            </button>
          </div>

          {/* Footer / Credit */}
          <div className="user-btn__footer">
            <span className="user-btn__secured">
              <span>Secured by</span>
              <span className="user-btn__brand-tag">Socrates</span>
            </span>
            <span className={`tier-badge ${user.tier}`}>{user.tierLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClerkUserButton;
