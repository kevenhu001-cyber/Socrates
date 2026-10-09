import { useCallback, useState } from 'react';
import type { AccountUsage } from '@socrates/contracts';
import { useAuthStore } from '@socrates/auth';
import { api } from './runtime';
import { appStringsNow } from './strings';

type RefCell<T> = { current: T };

/** Loads the signed-in account's settings usage snapshot with account-switch protection. */
export function useAccountUsage(accountEpoch: RefCell<number>) {
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setUsage(null);
    setLoading(false);
    setError(null);
  }, []);

  const loadUsage = useCallback(async () => {
    const owner = useAuthStore.getState().user;
    if (!owner || owner.isGuest) {
      setUsage(null);
      setError(null);
      return;
    }
    const epoch = accountEpoch.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api.account.usage();
      if (epoch === accountEpoch.current) setUsage(result);
    } catch (cause) {
      if (epoch === accountEpoch.current) setError(cause instanceof Error ? cause.message : appStringsNow().couldNotLoadUsage);
    } finally {
      if (epoch === accountEpoch.current) setLoading(false);
    }
  }, [accountEpoch]);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    await api.auth.changePassword(oldPassword, newPassword);
  }, []);

  return { usage, loading, error, loadUsage, changePassword, reset };
}
