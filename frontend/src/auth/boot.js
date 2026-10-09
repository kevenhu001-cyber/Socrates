/* Auth boot coordinator. URL-only routes, preflight requests, and /me retry
   policy live in ./boot/ so this module only sequences the startup flow. */

import { setBuiltInProviderModel } from '../config/providerConfig.service.ts';
import { showToast } from '../ui/toast.js';
import { openMobileTargetFromUrl } from '../native/mobileWebSessionBridge.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { renderUserFooter } from '../ui/profile.js';
import { revealAppAndHydrate } from './index.js';
import { handleAuthUrlRoutes } from './boot/routes.js';
import {
  readBootPreflight,
  retryAuthMe,
  shouldGateForInitialUnauthorized,
  startAuthRequests,
  startCsrfBootstrap,
} from './boot/requests.js';

/* Let the default locale chunk settle before exposing either authenticated
   content or the auth gate. Bound the wait so a broken chunk cannot stall boot. */
function i18nSettled() {
  try {
    const ready = window.__i18nReady;
    return ready ? Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 500))]) : Promise.resolve();
  } catch (_) {
    return Promise.resolve();
  }
}

/* This live binding is consumed by providerConfig.service.ts and mirrored to
   window after config resolves, since windowExports captures it at import. */
export var SERVER_HAS_BEAGLE_KEY = false;

async function publishServerConfig(configRequest) {
  let hasBuiltInKey = false;
  try {
    const config = await configRequest;
    if (config && config.hasBeagleKey) {
      /* The raw key remains on the server; only the model name is public. */
      if (typeof config.beagleModel === 'string') setBuiltInProviderModel(config.beagleModel);
      hasBuiltInKey = true;
    }
    try { window.BEAGLE_IS_REASONING = config && config.isReasoning === true; }
    catch (error) { reportSwallow(error, 'auth/boot.config.setReasoningFlag'); }
  } catch (error) {
    reportSwallow(error, 'auth/boot.config.fetch');
  }

  SERVER_HAS_BEAGLE_KEY = hasBuiltInKey;
  try { window.SERVER_HAS_BEAGLE_KEY = hasBuiltInKey; }
  catch (error) { reportSwallow(error, 'auth/boot.config.rebridgeServerHasKey'); }
}

async function showSigninGate() {
  await i18nSettled();
  if (typeof window.showGate === 'function') window.showGate();
  if (typeof window.showAuthSignin === 'function') window.showAuthSignin();
}

async function finishAuthenticatedBoot(user, csrfReady) {
  await Promise.all([csrfReady, i18nSettled()]);
  if (typeof window.setCurrentUser === 'function') window.setCurrentUser(user);
  else window.CURRENT_USER = user;
  try {
    if (window.markAuthSuccess) window.markAuthSuccess();
  } catch (error) { reportSwallow(error, 'auth/boot.markAuthSuccess'); }
  /* Consume the allow-listed mobile target after normal hydration. */
  revealAppAndHydrate(openMobileTargetFromUrl);
}

async function finishUnavailableBoot() {
  await i18nSettled();
  if (typeof window.showGate === 'function') window.showGate();
  if (typeof window.showAuthSignin === 'function') window.showAuthSignin();
  try { showToast("Couldn't reach the server. Check your connection and retry.", 5000); }
  catch (error) { reportSwallow(error, 'auth/boot.offlineToast'); }
  if (typeof renderUserFooter === 'function') renderUserFooter();
}

export async function authBoot() {
  /* index.html preloads csrf/me/config while the module graph evaluates. */
  const preflight = readBootPreflight();
  const csrfReady = startCsrfBootstrap(preflight);
  const params = new URLSearchParams(location.search);
  if (await handleAuthUrlRoutes(params, csrfReady)) return;

  const requests = startAuthRequests(preflight);
  const initialMe = await requests.meRequest;
  if (shouldGateForInitialUnauthorized(initialMe, () => window.isInAuthGraceWindow?.())) {
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
  if (authResult.kind === 'resolved' && authResult.me && authResult.me.user) {
    await finishAuthenticatedBoot(authResult.me.user, csrfReady);
    return;
  }
  await finishUnavailableBoot();
}

/* Keep the page responsive even if an unexpected startup step throws. */
authBoot().catch(() => {
  try {
    if (typeof window.showGate === 'function') window.showGate();
    if (typeof window.showAuthSignin === 'function') window.showAuthSignin();
  } catch (error) { reportSwallow(error, 'auth/boot.fallbackGate'); }
});
