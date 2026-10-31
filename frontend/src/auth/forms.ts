import { apiFetch, type ApiError } from '../util/api.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { getValue, setValue, setText, setVisible, focusId, setButton, type AuthRoot } from './shell.ts';
import { adoptAuthenticatedUser } from './forms/sessionAdoption.ts';

/** The user record these flows carry between login, /me, and the window. */
interface AuthUser {
  id?: string;
  name?: string;
  email?: string;
  [key: string]: unknown;
}

/** Auth shell actions wired through the auth module. */
interface AuthFormsWindow extends Window {
  setCurrentUser?: (user: unknown) => void;
  markAuthSuccess?: () => void;
  __resetToken?: string | null;
}

/** The parts of a rejected request these handlers branch on. */
interface AuthFailure {
  status: number;
  code: string | null;
  message: string;
}

/* Caught values are `unknown`; normalise once so every handler can read the
   status/code pair the API client attaches without casting at each site. */
function asAuthFailure(error: unknown): AuthFailure {
  const candidate = (error || {}) as Partial<ApiError> & { message?: unknown };
  return {
    status: typeof candidate.status === 'number' ? candidate.status : 0,
    code: typeof candidate.code === 'string' ? candidate.code : null,
    message: typeof candidate.message === 'string' ? candidate.message : String(error ?? ''),
  };
}

/** Auth-shell transitions supplied by index.ts (kept as a factory arg to
 *  avoid a cycle from forms back into the gate controller). */
export interface AuthFormDependencies {
  showGate(root?: AuthRoot): void;
  showAuthView(id: string, root?: AuthRoot): void;
  setAuthError(viewId: string, msg: string, root?: AuthRoot): void;
  clearAuthTabSelection(root?: AuthRoot): void;
  revealAppAndHydrate(onHydrated?: () => void): void;
  translate(key: string): string;
}

type AuthFormUi = AuthFormDependencies & { setText: typeof setText };

function fetchCurrentUser(): Promise<{ user?: AuthUser | null } | null> {
  return apiFetch<{ user?: AuthUser | null } | null>('/api/auth/me', { _authEndpoint: true });
}

function markAuthSuccess(): void {
  const win = window as AuthFormsWindow;
  if (typeof win.markAuthSuccess === 'function') win.markAuthSuccess();
}

function signedIn(root: AuthRoot | undefined, error: AuthFailure, email: string, dependencies: AuthFormUi): void {
  const { showGate, showAuthView, setAuthError, translate } = dependencies;
  showGate(root);
  if (error.status === 403 && error.code === 'UNVERIFIED') {
    setText(root || document, 'authVerifyEmail', email);
    try { setValue(root || document, 'authResendEmail', email); }
    catch (prefillError) { reportSwallow(prefillError, 'auth/forms.signin.prefillResendEmail'); }
    showAuthView('authVerifySentView', root);
    return;
  }
  const message = error.status === 401
    ? translate('auth.wrongCredentials')
    : translate('auth.loginFailedPrefix') + error.message;
  setAuthError('authSigninError', message, root);
}

async function verifyWithApi(token: string, dependencies: AuthFormDependencies): Promise<void> {
  const response = await apiFetch<{ user?: AuthUser | null } | null>('/api/auth/verify?token=' + encodeURIComponent(token));
  markAuthSuccess();
  await adoptAuthenticatedUser<AuthUser>(response && response.user ? response.user : null, {
    fetchMe: fetchCurrentUser,
    setUser: (user) => (window as AuthFormsWindow).setCurrentUser?.(user),
    getCurrentUser: () => window.CURRENT_USER as AuthUser | null,
    retryAfterFailure: true,
    retryOnlyWithCurrentUser: true,
    nullFallback: true,
    report: reportSwallow,
    context: 'auth/forms.verify.recheckMe',
  });
  dependencies.revealAppAndHydrate();
}

function showVerifyFailure(error: AuthFailure, dependencies: AuthFormUi): void {
  const expired = error.status === 400 && error.code === 'EXPIRED';
  const title = dependencies.translate(expired
    ? 'auth.verifyFailedExpiredTitle'
    : 'auth.verifyFailedTitle');
  const message = dependencies.translate('auth.verifyFailedMsg');
  dependencies.setText(document, 'authVerifyFailedTitle', title);
  dependencies.setText(document, 'authVerifyFailedMsg', message);
  dependencies.showAuthView('authVerifyFailedView');
}

function createCredentialHandlers(ui: AuthFormUi) {
  const { showAuthView, setAuthError, clearAuthTabSelection, revealAppAndHydrate, translate } = ui;

  async function submitAuthSignin(root?: AuthRoot): Promise<void> {
    const form = root || document;
    const email = getValue(form, 'authSigninEmail').trim();
    const password = getValue(form, 'authSigninPassword');
    setAuthError('authSigninError', '', form);
    if (!email || !password) {
      setAuthError('authSigninError', 'Please enter your email and password.', form);
      return;
    }
    setButton(form, 'authSigninBtn', true, translate('auth.signingIn'));
    try {
      const response = await apiFetch<{ user?: AuthUser | null } | null>('/api/auth/login', {
        method: 'POST', _authEndpoint: true, body: { email, password },
      });
      markAuthSuccess();
      await adoptAuthenticatedUser<AuthUser>(response && response.user ? response.user : null, {
        fetchMe: fetchCurrentUser,
        setUser: (user) => (window as AuthFormsWindow).setCurrentUser?.(user),
        retryAfterFailure: true,
        report: reportSwallow,
        context: 'auth/forms.signin.recheckMe',
      });
      revealAppAndHydrate();
    } catch (error) {
      signedIn(form, asAuthFailure(error), email, ui);
    } finally {
      setButton(form, 'authSigninBtn', false, translate('auth.signIn'));
    }
  }

  async function submitAuthRegister(root?: AuthRoot): Promise<void> {
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
      const failure = asAuthFailure(error);
      const message = failure.status === 409
        ? 'That email is already registered. Try signing in.'
        : failure.message;
      setAuthError('authRegisterError', message, form);
    } finally {
      setButton(form, 'authRegisterBtn', false, translate('auth.sendVerificationLink'));
    }
  }

  async function resendVerification(root?: AuthRoot): Promise<void> {
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
      setAuthError('authVerifyFailedError', asAuthFailure(error).message, form);
    }
  }

  async function submitAuthVerify(token: string): Promise<void> {
    showAuthView('authVerifiedView');
    clearAuthTabSelection();
    try { await verifyWithApi(token, ui); }
    catch (error) { showVerifyFailure(asAuthFailure(error), ui); }
  }

  return { submitAuthSignin, submitAuthRegister, resendVerification, submitAuthVerify };
}

function createPasswordHandlers(ui: AuthFormUi) {
  const { showAuthView, setAuthError, translate } = ui;

  async function submitAuthForgotPassword(root?: AuthRoot): Promise<void> {
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
      setAuthError('authForgotError', asAuthFailure(error).message, form);
    } finally {
      setButton(form, 'authForgotBtn', false, translate('auth.sendResetLink'));
    }
  }

  async function submitAuthResetPassword(root?: AuthRoot): Promise<void> {
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
        method: 'POST', body: { token: (window as AuthFormsWindow).__resetToken, password },
      });
      showAuthView('authResetSuccessView', form);
    } catch (error) {
      setAuthError('authResetError', asAuthFailure(error).message, form);
    } finally {
      setButton(form, 'authResetBtn', false, translate('auth.resetPassword'));
    }
  }

  return { submitAuthForgotPassword, submitAuthResetPassword };
}

function createCodeHandlers(ui: AuthFormUi) {
  const { setAuthError, revealAppAndHydrate, translate } = ui;

  async function submitAuthSendCode(root?: AuthRoot): Promise<void> {
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
      setAuthError('authCodeError', asAuthFailure(error).message, form);
    } finally {
      setButton(form, 'authCodeSendBtn', false, translate('auth.sendCode'));
    }
  }

  async function submitAuthLoginWithCode(root?: AuthRoot): Promise<void> {
    const form = root || document;
    const email = getValue(form, 'authCodeEmail').trim();
    const code = getValue(form, 'authCodeInput').trim().toUpperCase();
    setAuthError('authCodeError', '', form);
    /* Keep the client validator aligned with the server's unambiguous code alphabet. */
    if (!/^[A-HJ-KM-NP-Z2-9]{8}$/.test(code)) {
      return setAuthError('authCodeError', 'Please enter the 8-character code.', form);
    }
    setButton(form, 'authCodeLoginBtn', true, translate('auth.loggingIn'));
    try {
      const response = await apiFetch<{ user?: AuthUser | null } | null>('/api/auth/login-with-code', {
        method: 'POST', _authEndpoint: true, body: { email, code },
      });
      markAuthSuccess();
      await adoptAuthenticatedUser<AuthUser>(response && response.user ? response.user : null, {
        fetchMe: fetchCurrentUser,
        setUser: (user) => (window as AuthFormsWindow).setCurrentUser?.(user),
        report: reportSwallow,
        context: 'auth/forms.codeLogin.recheckMe',
      });
      revealAppAndHydrate();
    } catch (error) {
      setAuthError('authCodeError', asAuthFailure(error).message, form);
    } finally {
      setButton(form, 'authCodeLoginBtn', false, translate('auth.logIn'));
    }
  }

  async function resendAuthCode(root?: AuthRoot): Promise<void> {
    const email = getValue(root || document, 'authCodeEmail').trim();
    if (!email) return;
    try {
      await apiFetch('/api/auth/send-code', { method: 'POST', _authEndpoint: true, body: { email } });
    } catch (error) { reportSwallow(error, 'auth/forms.sendCode'); }
  }

  return { submitAuthSendCode, submitAuthLoginWithCode, resendAuthCode };
}

/** Create form actions with the auth-shell transitions supplied by index.ts. */
export function createAuthFormHandlers(dependencies: AuthFormDependencies) {
  const ui: AuthFormUi = { ...dependencies, setText };
  return {
    ...createCredentialHandlers(ui),
    ...createPasswordHandlers(ui),
    ...createCodeHandlers(ui),
  };
}
