import { useEffect, useState } from 'react';

import {
  clearAdminToken,
  getAdminAuthStatus,
  hasAdminToken,
  logoutAdmin,
  verifyAdminSession,
} from './adminApi';
import { publishAdminPatch } from './adminSnapshot';

export function useAdminSession() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const status = await getAdminAuthStatus();
        if (cancelled) return;
        if (!status.configured) {
          publishAdminPatch({
            loading: false,
            error: null,
            systemModel: null,
            embedding: null,
            isAdmin: false,
            adminGateError: 'ADMIN_PASSWORD is not set on the server — the admin console is disabled.',
          });
          setAuthed(false);
          return;
        }
        if (status.ipAllowed === false) {
          publishAdminPatch({
            loading: false,
            error: null,
            systemModel: null,
            embedding: null,
            isAdmin: false,
            adminGateError: 'This client IP is not on the admin allowlist (ADMIN_IP_ALLOWLIST). Contact the operator to add it.',
          });
          setAuthed(false);
          return;
        }
        if (hasAdminToken()) {
          const valid = await verifyAdminSession();
          if (cancelled) return;
          if (valid) {
            setAuthed(true);
            return;
          }
          clearAdminToken();
        }
        setAuthed(false);
      } catch {
        if (!cancelled) setAuthed(false);
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, []);

  const signOut = async () => {
    await logoutAdmin();
    setAuthed(false);
  };

  return { authed, setAuthed, signOut };
}
