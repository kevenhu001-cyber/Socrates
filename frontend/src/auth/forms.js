import { apiFetch } from '../util/api.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { getValue, isChecked, setValue, setText, setVisible, focusId, setButton } from './shell.ts';
import { adoptAuthenticatedUser } from './forms/sessionAdoption.js';

function fetchCurrentUser() {
  return apiFetch('/api/auth/me', { _authEndpoint: true });
}

function markAuthSuccess() {
  if (typeof window.markAuthSuccess === 'function') window.markAuthSuccess();
}

function setGuestPreference(enabled, context) {
  if (!enabled) return;
  try { localStorage.setItem('socrates-guest', '1'); }
  catch (error) { reportSwallow(error, context); }
}

function signedIn(root, error, email, dependencies) {
  const { showGate, showAuthView, setAuthError, setText, setValue, translate } = dependencies;
  showGate(root);
  if (error.status === 403 && error.code === 'UNVERIFIED') {
    setText(root, 'authVerifyEmail', email);
    try { setValue(root, 'authResendEmail', email); }
    catch (prefillError) { reportSwallow(prefillError, 'auth/forms.signin.prefillResendEmail'); }
    showAuthView('authVerifySentView', root);
    return;
  }
  const message = error.status === 401
    ? translate('auth.wrongCredentials')
    : translate('auth.loginFailedPrefix') + error.message;
  setAuthError('authSigninError', message, root);
}

async function verifyWithApi(token, dependencies) {
  const response = await apiFetch('/api/auth/verify?token=' + encodeURIComponent(token));
  markAuthSuccess();
  await adoptAuthenticatedUser(response && response.user ? response.user : null, {
    fetchMe: fetchCurrentUser,
    setUser: (user) => window.setCurrentUser(user),
    getCurrentUser: () => window.CURRENT_USER,
    retryAfterFailure: true,
    retryOnlyWithCurrentUser: true,
    nullFallback: true,
    report: reportSwallow,
    context: 'auth/forms.verify.recheckMe',
  });
  dependencies.revealAppAndHydrate();
}

function showVerifyFailure(error, dependencies) {
  const expired = error.status === 400 && error.code === 'EXPIRED';
  const title = dependencies.translate(expired
    ? 'auth.verifyFailedExpiredTitle'
    : 'auth.verifyFailedTitle');
  const message = dependencies.translate('auth.verifyFailedMsg');
  dependencies.setText(document, 'authVerifyFailedTitle', title);
  dependencies.setText(document, 'authVerifyFailedMsg', message);
  dependencies.showAuthView('authVerifyFailedView');
}

function createCredentialHandlers(ui) {
  const { showAuthView, setAuthError, clearAuthTabSelection, revealAppAndHydrate, translate } = ui;
  async function submitAuthSignin(root) {
    const form = root || document;
    const email = getValue(form, 'authSigninEmail').trim();
    const password = getValue(form, 'authSigninPassword');
    const isGuest = isChecked(form, 'authGuestCheckbox');
    setAuthError('authSigninError', '', form);
    if (!email || !password) {
      setAuthError('authSigninError', 'Please enter your email and password.', form);
      return;
    }
    setButton(form, 'authSigninBtn', true, translate('auth.signingIn'));
    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST', _authEndpoint: true, body: { email, password },
      });
      setGuestPreference(isGuest, 'auth/forms.signin.markGuest');
      markAuthSuccess();
      await adoptAuthenticatedUser(response && response.user, {
        fetchMe: fetchCurrentUser,
        setUser: (user) => window.setCurrentUser(user),
        retryAfterFailure: true,
        report: reportSwallow,
        context: 'auth/forms.signin.recheckMe',
      });
      revealAppAndHydrate();
    } catch (error) {
      signedIn(form, error, email, ui);
    } finally {
      setButton(form, 'authSigninBtn', false, translate('auth.signIn'));
    }
  }

  async function submitAuthRegister(root) {
    const form = root || document;
    const email = getValue(form, 'authRegisterEmail').trim();
    const password = getValue(form, 'authRegisterPassword');
    setAuthError('authRegisterError', '', form);
    if (!email) return setAuthError('authRegisterError', translate('auth.pleaseEnterEmail'), form);
    if (!password || password.length < 8) {
      return setAuthError('authRegisterError', translate('auth.passwordTooShort'), form);
    }
    setButton(form, 'authRegisterBtn', true, translate('auth.sending'));
    try {
      /* Registration remains pending until the email link is verified; do not
         auto-login from this response. */
      await apiFetch('/api/auth/register', {
        method: 'POST', _authEndpoint: true, body: { email, password },
      });
      setText(form, 'authVerifyEmail', email);
      setValue(form, 'authResendEmail', email);
      showAuthView('authVerifySentView', form);
      clearAuthTabSelection(form);
    } catch (error) {
      const message = error.status === 409
        ? 'That email is already registered. Try signing in.'
        : error.message;
      setAuthError('authRegisterError', message, form);
    } finally {
      setButton(form, 'authRegisterBtn', false, translate('auth.sendVerificationLink'));
    }
  }

  async function resendVerification(root) {
    const form = root || document;
    const email = getValue(form, 'authResendEmail').trim();
    if (!email) return;
    setAuthError('authVerifyFailedError', '', form);
    try {
      /* Resend uses its own endpoint; never route this through /register. */
      await apiFetch('/api/auth/resend-verification', { method: 'POST', body: { email } });
      setText(form, 'authVerifyEmail', email);
      showAuthView('authVerifySentView', form);
    } catch (error) {
      setAuthError('authVerifyFailedError', error.message, form);
    }
  }

  async function submitAuthVerify(token) {
    showAuthView('authVerifiedView');
    clearAuthTabSelection();
    try { await verifyWithApi(token, ui); }
    catch (error) { showVerifyFailure(error, ui); }
  }

  return { submitAuthSignin, submitAuthRegister, resendVerification, submitAuthVerify };
}

function createPasswordHandlers(ui) {
  const { showAuthView, setAuthError, translate } = ui;

  async function submitAuthForgotPassword(root) {
    const form = root || document;
    const email = getValue(form, 'authForgotEmail').trim();
    setAuthError('authForgotError', '', form);
    if (!email) return setAuthError('authForgotError', translate('auth.pleaseEnterEmail'), form);
    setButton(form, 'authForgotBtn', true, translate('auth.sending'));
    try {
      await apiFetch('/api/auth/forgot-password', {
        method: 'POST', _authEndpoint: true, body: { email },
      });
      setText(form, 'authForgotSentEmail', email);
      showAuthView('authForgotSentView', form);
    } catch (error) {
      setAuthError('authForgotError', error.message, form);
    } finally {
      setButton(form, 'authForgotBtn', false, translate('auth.sendResetLink'));
    }
  }

  async function submitAuthResetPassword(root) {
    const form = root || document;
    const password = getValue(form, 'authResetPassword');
    const confirm = getValue(form, 'authResetConfirm');
    setAuthError('authResetError', '', form);
    if (!password || password.length < 8) {
      return setAuthError('authResetError', translate('auth.passwordTooShort'), form);
    }
    if (password !== confirm) {
      return setAuthError('authResetError', translate('auth.passwordsDontMatch'), form);
    }
    setButton(form, 'authResetBtn', true, translate('auth.resetting'));
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST', body: { token: window.__resetToken, password },
      });
      showAuthView('authResetSuccessView', form);
    } catch (error) {
      setAuthError('authResetError', error.message, form);
    } finally {
      setButton(form, 'authResetBtn', false, translate('auth.resetPassword'));
    }
  }

  return { submitAuthForgotPassword, submitAuthResetPassword };
}

function createCodeHandlers(ui) {
  const { setAuthError, revealAppAndHydrate, translate } = ui;

  async function submitAuthSendCode(root) {
    const form = root || document;
    const email = getValue(form, 'authCodeEmail').trim();
    setAuthError('authCodeError', '', form);
    if (!email) return setAuthError('authCodeError', translate('auth.pleaseEnterEmail'), form);
    setButton(form, 'authCodeSendBtn', true, translate('auth.sending'));
    try {
      await apiFetch('/api/auth/send-code', {
        method: 'POST', _authEndpoint: true, body: { email },
      });
      setVisible(form, 'authCodeCodeWrap', true);
      setText(form, 'authCodeSentEmail', email);
      setVisible(form, 'authCodeSentMsg', true);
      setVisible(form, 'authCodeSendBtn', false);
      setVisible(form, 'authCodeLoginBtn', true);
      setVisible(form, 'authCodeResendWrap', true);
      focusId(form, 'authCodeInput');
    } catch (error) {
      setAuthError('authCodeError', error.message, form);
    } finally {
      setButton(form, 'authCodeSendBtn', false, translate('auth.sendCode'));
    }
  }

  async function submitAuthLoginWithCode(root) {
    const form = root || document;
    const email = getValue(form, 'authCodeEmail').trim();
    const code = getValue(form, 'authCodeInput').trim().toUpperCase();
    const isGuest = isChecked(form, 'authCodeGuestCheckbox');
    setAuthError('authCodeError', '', form);
    /* Keep the client validator aligned with the server's unambiguous code alphabet. */
    if (!/^[A-HJ-KM-NP-Z2-9]{8}$/.test(code)) {
      return setAuthError('authCodeError', 'Please enter the 8-character code.', form);
    }
    setButton(form, 'authCodeLoginBtn', true, translate('auth.loggingIn'));
    try {
      const response = await apiFetch('/api/auth/login-with-code', {
        method: 'POST', _authEndpoint: true, body: { email, code },
      });
      markAuthSuccess();
      await adoptAuthenticatedUser(response && response.user, {
        fetchMe: fetchCurrentUser,
        setUser: (user) => window.setCurrentUser(user),
        report: reportSwallow,
        context: 'auth/forms.codeLogin.recheckMe',
      });
      setGuestPreference(isGuest, 'auth/forms.codeLogin.markGuest');
      revealAppAndHydrate();
    } catch (error) {
      setAuthError('authCodeError', error.message, form);
    } finally {
      setButton(form, 'authCodeLoginBtn', false, translate('auth.logIn'));
    }
  }

  async function resendAuthCode(root) {
    const email = getValue(root || document, 'authCodeEmail').trim();
    if (!email) return;
    try {
      await apiFetch('/api/auth/send-code', { method: 'POST', _authEndpoint: true, body: { email } });
    } catch (error) { reportSwallow(error, 'auth/forms.sendCode'); }
  }

  return { submitAuthSendCode, submitAuthLoginWithCode, resendAuthCode };
}

/** Create form actions with the auth-shell transitions supplied by index.js. */
export function createAuthFormHandlers(dependencies) {
  const ui = { ...dependencies, setText };
  return {
    ...createCredentialHandlers(ui),
    ...createPasswordHandlers(ui),
    ...createCodeHandlers(ui),
  };
}
