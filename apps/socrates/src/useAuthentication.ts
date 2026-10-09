import { useCallback, useState } from 'react';
import { persistUser, useAuthStore } from '@socrates/auth';
import { api } from './runtime';
import { storage } from './storage';
import { appStringsNow } from './strings';

type AuthAction = () => Promise<unknown>;

/** Own the auth-gate actions and their transient pending/error/notice state. */
export function useAuthentication(syncLibrary: () => Promise<void>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(async (
    action: AuthAction,
    fallbackError: () => string,
    successNotice?: () => string,
  ) => {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (successNotice) setNotice(successNotice());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallbackError());
    } finally {
      setPending(false);
    }
  }, []);

  const login = useCallback((email: string, password: string) => run(async () => {
    const user = await api.auth.login(email, password);
    await persistUser(storage, user);
    useAuthStore.getState().setUser(user);
    void syncLibrary();
  }, () => appStringsNow().signInFailed), [run, syncLibrary]);

  const loginWithCode = useCallback((email: string, code: string) => run(async () => {
    const user = await api.auth.loginWithCode(email, code);
    await persistUser(storage, user);
    useAuthStore.getState().setUser(user);
    void syncLibrary();
  }, () => appStringsNow().codeSignInFailed), [run, syncLibrary]);

  const sendCode = useCallback((email: string) => run(
    () => api.auth.sendCode(email),
    () => appStringsNow().codeSendFailed,
    () => appStringsNow().codeSent,
  ), [run]);

  const register = useCallback((email: string, password: string) => run(
    () => api.auth.register(email, password),
    () => appStringsNow().registerFailed,
    () => appStringsNow().registered,
  ), [run]);

  const resendVerification = useCallback((email: string) => run(
    () => api.auth.resendVerification(email),
    () => appStringsNow().resendFailed,
    () => appStringsNow().resent,
  ), [run]);

  const forgotPassword = useCallback((email: string) => run(
    () => api.auth.forgotPassword(email),
    () => appStringsNow().resetSendFailed,
    () => appStringsNow().resetSent,
  ), [run]);

  const continueAsGuest = useCallback(() => {
    useAuthStore.getState().setUser({ id: 'guest', email: '', displayName: 'Guest', isGuest: true });
  }, []);

  const signOut = useCallback(() => {
    void useAuthStore.getState().signOut(storage, () => api.auth.logout());
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  return {
    pending,
    error,
    notice,
    clearNotice,
    login,
    loginWithCode,
    sendCode,
    register,
    resendVerification,
    forgotPassword,
    continueAsGuest,
    signOut,
  };
}
