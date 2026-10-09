/** Adopt the canonical /me user while preserving each auth flow's fallback policy. */
async function retryCanonicalUser(fallbackUser, { fetchMe, setUser, wait, report, context }) {
  await wait(150);
  try {
    const me = await fetchMe();
    if (me && me.user) setUser(me.user);
  } catch (retryError) {
    report(retryError, context);
  }
  return fallbackUser;
}

function shouldRetryAfterFailure(retryAfterFailure, retryOnlyWithCurrentUser, getCurrentUser) {
  return retryAfterFailure && (!retryOnlyWithCurrentUser || Boolean(getCurrentUser()));
}

export async function adoptAuthenticatedUser(loginUser, options) {
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
  } catch (_error) {
    setUser(fallbackUser);
  }

  if (!shouldRetryAfterFailure(retryAfterFailure, retryOnlyWithCurrentUser, getCurrentUser)) return fallbackUser;
  return retryCanonicalUser(fallbackUser, { fetchMe, setUser, wait, report, context });
}
