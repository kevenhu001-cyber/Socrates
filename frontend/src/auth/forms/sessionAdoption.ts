/** Adopt the canonical /me user while preserving each auth flow's fallback policy. */

export type AdoptReport = (error: unknown, context: string) => unknown;

export interface AdoptAuthenticatedUserOptions<T> {
  fetchMe: () => Promise<{ user?: T | null } | null | undefined>;
  setUser: (user: T | null) => void;
  getCurrentUser?: () => T | null;
  retryAfterFailure?: boolean;
  retryOnlyWithCurrentUser?: boolean;
  nullFallback?: boolean;
  wait?: (milliseconds: number) => Promise<unknown>;
  report?: AdoptReport;
  context?: string;
}

async function retryCanonicalUser<T>(
  fallbackUser: T | null,
  { fetchMe, setUser, wait, report, context }: Required<Pick<AdoptAuthenticatedUserOptions<T>, 'fetchMe' | 'setUser' | 'wait' | 'report' | 'context'>>,
): Promise<T | null> {
  await wait(150);
  try {
    const me = await fetchMe();
    if (me && me.user) setUser(me.user);
  } catch (retryError) {
    report(retryError, context);
  }
  return fallbackUser;
}

function shouldRetryAfterFailure<T>(
  retryAfterFailure: boolean,
  retryOnlyWithCurrentUser: boolean,
  getCurrentUser: () => T | null,
): boolean {
  return retryAfterFailure && (!retryOnlyWithCurrentUser || Boolean(getCurrentUser()));
}

export async function adoptAuthenticatedUser<T>(
  loginUser: T | null,
  options: AdoptAuthenticatedUserOptions<T>,
): Promise<T | null> {
  const {
    fetchMe,
    setUser,
    getCurrentUser = () => null,
    retryAfterFailure = false,
    retryOnlyWithCurrentUser = false,
    nullFallback = false,
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    report = () => null,
    context = 'auth/forms.recheckMe',
  } = options;
  const fallbackUser = nullFallback ? (loginUser || null) : loginUser;

  try {
    const me = await fetchMe();
    const currentUser = me && me.user ? me.user : fallbackUser;
    setUser(currentUser);
    return currentUser;
  } catch { /* empty-catch: intentional — fall back to the login response below */ setUser(fallbackUser); }

  if (!shouldRetryAfterFailure(retryAfterFailure, retryOnlyWithCurrentUser, getCurrentUser)) return fallbackUser;
  return retryCanonicalUser(fallbackUser, { fetchMe, setUser, wait, report, context });
}
