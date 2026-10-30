/* Auth boot coordinator. URL-only routes, preflight requests, and /me retry
   policy live in ./boot/ so this module only sequences the startup flow. */

import { setBuiltInProviderModel, setServerBuiltInKeyAvailable } from '../config/providerConfig.service.ts';
import { showToast } from '../ui/toast.js';
import { i18n } from '../react/legacy/gateway.ts';
import { openMobileTargetFromUrl } from '../native/mobileWebSessionBridge.ts';
import { captureBrowserLoginRequest } from '../native/browserLoginHandoff.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { publishSidebarChrome } from '../ui/profile.ts';
import { revealAppAndHydrate } from './index.ts';
import { handleAuthUrlRoutes } from './boot/routes.ts';
import {
  readBootPreflight,
  retryAuthMe,
  shouldGateForInitialUnauthorized,
  startAuthRequests,
  lazyCsrfBootstrap,
  type AuthMeResult,
} from './boot/requests.ts';

interface BootLegacyWindow extends Window {
  __i18nReady?: Promise<unknown>;
  isInAuthGraceWindow?: () => boolean;
  setCurrentUser?: (user: unknown) => void;
  markAuthSuccess?: () => void;
  showGate?: () => void;
  showAuthSignin?: () => void;
}

/** What /api/v2/config publishes; only these fields are read here. */
interface ServerConfig {
  hasBeagleKey?: boolean;
  beagleModel?: unknown;
}

/* Let the default locale chunk settle before exposing either authenticated
   content or the auth gate. Bound the wait so a broken chunk cannot stall boot. */
function i18nSettled(): Promise<unknown> {
  try {
    const ready = (window as BootLegacyWindow).__i18nReady;
    return ready ? Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 500))]) : Promise.resolve();
  } catch { return Promise.resolve(); }
}

async function publishServerConfig(configRequest: Promise<unknown>): Promise<void> {
  let hasBuiltInKey = false;
  try {
    const config = await configRequest as ServerConfig | null;
    if (config && config.hasBeagleKey) {
      /* The raw key remains on the server; only the model name is public. */
      if (typeof config.beagleModel === 'string') setBuiltInProviderModel(config.beagleModel);
      hasBuiltInKey = true;
    }
    /* P_model-capability-registry — the built-in provider's capabilities no
       longer come from a coarse boolean here. The server publishes what the
       active model supports alongside the provider list, and the browser
       needs that to know whether Instant is available at all. */
  } catch (error) {
    reportSwallow(error, 'auth/boot.config.fetch');
  }

  setServerBuiltInKeyAvailable(hasBuiltInKey);
}

async function showSigninGate(): Promise<void> {
  await i18nSettled();
  const win = window as BootLegacyWindow;
  if (typeof win.showGate === 'function') win.showGate();
  if (typeof win.showAuthSignin === 'function') win.showAuthSignin();
}

async function finishAuthenticatedBoot(user: unknown, csrfReady: PromiseLike<unknown>): Promise<void> {
  await Promise.all([csrfReady, i18nSettled()]);
  const win = window as BootLegacyWindow;
  if (typeof win.setCurrentUser === 'function') win.setCurrentUser(user);
  else window.CURRENT_USER = user as Record<string, unknown>;
  try {
    if (win.markAuthSuccess) win.markAuthSuccess();
  } catch (error) { reportSwallow(error, 'auth/boot.markAuthSuccess'); }
  /* Consume the allow-listed mobile target after normal hydration. */
  revealAppAndHydrate(openMobileTargetFromUrl);
}

async function finishUnavailableBoot(): Promise<void> {
  await i18nSettled();
  const win = window as BootLegacyWindow;
  if (typeof win.showGate === 'function') win.showGate();
  if (typeof win.showAuthSignin === 'function') win.showAuthSignin();
  try { showToast(i18n('toast.authOffline', "Couldn't reach the server. Check your connection and retry."), 5000); }
  catch (error) { reportSwallow(error, 'auth/boot.offlineToast'); }
  publishSidebarChrome();
}

export async function authBoot(): Promise<void> {
  captureBrowserLoginRequest();
  /* index.html preloads csrf/me/config while the module graph evaluates. */
  const preflight = readBootPreflight();
  const csrfReady = lazyCsrfBootstrap(preflight);
  const params = new URLSearchParams(location.search);
  if (await handleAuthUrlRoutes(params, csrfReady)) return;

  const requests = startAuthRequests(preflight);
  const initialMe: AuthMeResult = await requests.meRequest;
  if (shouldGateForInitialUnauthorized(initialMe, () => (window as BootLegacyWindow).isInAuthGraceWindow?.() ?? false)) {
    await showSigninGate();
    return;
  }

  /* Preserve parallel startup: config began alongside /me and is applied
     before retries decide whether the user can enter the app. */
  await publishServerConfig(requests.configRequest);
  const authResult = await retryAuthMe(initialMe);
  if (authResult.kind === 'unauthorized') {
    await showSigninGate();
    return;
  }
  if (authResult.kind === 'resolved') {
    const me = authResult.me as { user?: unknown } | null | undefined;
    if (me && me.user) {
      await finishAuthenticatedBoot(me.user, csrfReady);
      return;
    }
  }
  await finishUnavailableBoot();
}

/* Keep the page responsive even if an unexpected startup step throws. */
authBoot().catch(() => {
  try {
    const win = window as BootLegacyWindow;
    if (typeof win.showGate === 'function') win.showGate();
    if (typeof win.showAuthSignin === 'function') win.showAuthSignin();
  } catch (error) { reportSwallow(error, 'auth/boot.fallbackGate'); }
});
