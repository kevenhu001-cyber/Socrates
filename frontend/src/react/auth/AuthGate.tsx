import { useEffect, useSyncExternalStore, type ComponentProps, type FormEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Button } from '../ui/shadcn/button';
import { Input } from '../ui/shadcn/input';
import { Label } from '../ui/shadcn/label';
import {
  focusAuthTab,
  resendAuthCode,
  resendVerification,
  showAuthCodeLogin,
  showAuthForgotPassword,
  showAuthRegister,
  showAuthSignin,
  submitAuthForgotPassword,
  submitAuthLoginWithCode,
  submitAuthRegister,
  submitAuthResetPassword,
  submitAuthSendCode,
  submitAuthSignin,
} from '../../auth/index.ts';
import {
  getAuthUiState,
  setAuthField,
  subscribeAuthUi,
  type AuthUiState,
} from '../../auth/uiState.ts';

function useAuthUi<T>(select: (state: AuthUiState) => T): T {
  return useSyncExternalStore(
    subscribeAuthUi,
    () => select(getAuthUiState()),
    () => select(getAuthUiState()),
  );
}

function useAuthViewClass(id: string): string {
  const visible = useAuthUi((state) => state.view === id);
  return `auth-view${visible ? '' : ' hidden'}`;
}

function AuthInput(props: ComponentProps<typeof Input> & { id: string }) {
  const value = useAuthUi((state) => state.fields[props.id] || '');
  return <Input {...props} value={value} onChange={(event) => setAuthField(props.id, event.currentTarget.value)} />;
}

function AuthStatusButton(props: ComponentProps<typeof Button> & { id: string }) {
  const status = useAuthUi((state) => state.buttons[props.id]);
  return (
    <Button {...props} disabled={status?.disabled ?? props.disabled}>
      {status?.label ?? props.children}
    </Button>
  );
}

function AuthError({ id }: { id: string }) {
  const message = useAuthUi((state) => state.errors[id] || '');
  return <div className="auth-error" id={id} role="alert">{message}</div>;
}

function AuthText({ id }: { id: string }) {
  return <>{useAuthUi((state) => state.text[id] || '')}</>;
}

function useAuthVisible(id: string, defaultVisible: boolean): boolean {
  return useAuthUi((state) => state.visibility[id] ?? defaultVisible);
}

function handleAuthSubmit(event: FormEvent<HTMLFormElement>, action: () => Promise<void>): void {
  event.preventDefault();
  void action();
}

function handleAuthLink(event: ReactMouseEvent<HTMLAnchorElement>, action: () => void): void {
  event.preventDefault();
  action();
}

/** React owns auth view state, form values, validation feedback, and actions. */
export function AuthGate() {
  const focusRequest = useAuthUi((state) => state.focusRequest);
  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.id)?.focus();
  }, [focusRequest]);

  const activeTab = useAuthUi((state) => state.activeTab);
  return (
    <>
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.png" width={22} height={22} alt="" className="logo-img" />
          <span>Socrates</span>
        </div>

        <div
          className="auth-tabs"
          id="authTabs"
          role="tablist"
          aria-label="Account access"
          data-i18n-aria="chrome.accountAccess"
        >
          <Button
            variant="ghost"
            type="button"
            className={`auth-tab${activeTab === 'signin' ? ' active' : ''}`}
            id="authSigninTab"
            role="tab"
            aria-controls="authSigninView"
            aria-selected={activeTab === 'signin'}
            tabIndex={activeTab === 'signin' ? 0 : -1}
            data-tab="signin"
            data-i18n-key="auth.signIn"
            onClick={() => showAuthSignin()}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => focusAuthTab(event.currentTarget, event.nativeEvent)}
          >
            Sign in
          </Button>
          <Button
            variant="ghost"
            type="button"
            className={`auth-tab${activeTab === 'register' ? ' active' : ''}`}
            id="authRegisterTab"
            role="tab"
            aria-controls="authRegisterView"
            aria-selected={activeTab === 'register'}
            tabIndex={activeTab === 'register' ? 0 : -1}
            data-tab="register"
            data-i18n-key="auth.createAccount"
            onClick={() => showAuthRegister()}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => focusAuthTab(event.currentTarget, event.nativeEvent)}
          >
            Create account
          </Button>
        </div>

        <div className="auth-views">
          <SigninView />
          <RegisterView />
          <VerifySentView />
          <VerifyFailedView />
          <VerifiedView />
          <ForgotPasswordView />
          <ForgotSentView />
          <ResetPasswordView />
          <ResetSuccessView />
          <CodeLoginView />
        </div>
      </div>
      <div className="auth-footnote" data-i18n-key="auth.footnote">
        Socrates asks questions to help you think. It does not judge your answers.
      </div>
    </>
  );
}

function FieldLabel({ htmlFor, labelKey, text }: { htmlFor: string; labelKey?: string; text: string }) {
  return (
    <Label className="auth-label" htmlFor={htmlFor} data-i18n-key={labelKey}>
      {text}
    </Label>
  );
}

function SigninView() {
  const className = useAuthViewClass('authSigninView');
  return (
    <form className={className} id="authSigninView" onSubmit={(event) => handleAuthSubmit(event, submitAuthSignin)}>
      <FieldLabel htmlFor="authSigninEmail" labelKey="auth.email" text="Email" />
      <AuthInput
        className="auth-input"
        id="authSigninEmail"
        name="authSigninEmail"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />
      <FieldLabel htmlFor="authSigninPassword" labelKey="auth.password" text="Password" />
      <AuthInput
        className="auth-input"
        id="authSigninPassword"
        name="authSigninPassword"
        type="password"
        autoComplete="current-password"
        required
        placeholder="••••••••"
      />
      <a className="auth-inline-link auth-inline-link-right" href="#" data-i18n-key="auth.forgotPassword" onClick={(event) => handleAuthLink(event, showAuthForgotPassword)}>
        Forgot password?
      </a>
      <AuthError id="authSigninError" />
      <AuthStatusButton className="auth-btn primary" id="authSigninBtn" type="submit" data-i18n-key="auth.signIn">
        Sign in
      </AuthStatusButton>
      <div className="auth-view-separator" data-i18n-key="auth.or">or</div>
      <a
        className="auth-btn secondary auth-github-btn"
        id="authGithubBtn"
        href="/api/auth/oauth/github/start?return_to=/"
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.1.79-.25.79-.56v-2.16c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.39.97.1-.76.4-1.27.74-1.56-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.28 1.2-3.09-.12-.3-.52-1.49.11-3.1 0 0 .98-.31 3.2 1.18a11.2 11.2 0 015.84 0c2.22-1.49 3.2-1.18 3.2-1.18.63 1.61.23 2.8.11 3.1.75.81 1.2 1.83 1.2 3.09 0 4.43-2.7 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
        </svg>
        <span data-i18n-key="auth.continueGithub">Continue with GitHub</span>
      </a>
      <a className="auth-inline-link auth-code-login-link" href="#" data-i18n-key="auth.codeLoginLink" onClick={(event) => handleAuthLink(event, showAuthCodeLogin)}>
        Login with verification code
      </a>
      <div className="auth-foot">
        <span data-i18n-key="auth.noAccount">No account?</span>{' '}
          <a href="#" data-i18n-key="auth.createOne" onClick={(event) => handleAuthLink(event, showAuthRegister)}>Create one</a>
      </div>
    </form>
  );
}

function RegisterView() {
  const className = useAuthViewClass('authRegisterView');
  return (
    <form className={className} id="authRegisterView" onSubmit={(event) => handleAuthSubmit(event, submitAuthRegister)}>
      <p className="auth-lede" data-i18n-key="auth.registerLede">
        Sign up with your email. We&apos;ll send a verification link — no codes to memorize.
      </p>
      <FieldLabel htmlFor="authRegisterEmail" labelKey="auth.email" text="Email" />
      <AuthInput
        className="auth-input"
        id="authRegisterEmail"
        name="authRegisterEmail"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />
      <FieldLabel htmlFor="authRegisterPassword" labelKey="auth.password" text="Password" />
      <AuthInput
        className="auth-input"
        id="authRegisterPassword"
        name="authRegisterPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        placeholder="At least 8 characters"
        data-i18n-placeholder="chrome.passwordHint"
      />
      <AuthError id="authRegisterError" />
      <AuthStatusButton className="auth-btn primary" id="authRegisterBtn" type="submit" data-i18n-key="auth.sendVerificationLink">
        Send verification link
      </AuthStatusButton>
      <div className="auth-foot">
        <span data-i18n-key="auth.alreadyVerified">Already verified?</span>{' '}
        <a href="#" data-i18n-key="auth.signIn" onClick={(event) => handleAuthLink(event, showAuthSignin)}>Sign in</a>
      </div>
    </form>
  );
}

function MailIcon() {
  return (
    <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function VerifySentView() {
  const className = useAuthViewClass('authVerifySentView');
  return (
    <div className={className} id="authVerifySentView">
      <div className="auth-icon">
        <MailIcon />
      </div>
      <h2 className="auth-title" data-i18n-key="auth.checkInbox">Check your inbox</h2>
      <p className="auth-lede">
        <span data-i18n-key="auth.verifySentPre">We sent a verification link to </span>
        <strong id="authVerifyEmail"><AuthText id="authVerifyEmail" /></strong>
        <span data-i18n-key="auth.verifySentPost">
          . Click the button in the email to start learning with Socrates. The link expires in 24 hours.
        </span>
      </p>
      <Button className="auth-btn secondary" type="button" data-i18n-key="auth.resendLink" onClick={() => { void resendVerification(); }}>
        Resend the link
      </Button>
      <div className="auth-foot">
        <a href="#" data-i18n-key="auth.useDifferentEmail" onClick={(event) => handleAuthLink(event, showAuthSignin)}>Use a different email</a>
      </div>
    </div>
  );
}

function VerifyFailedView() {
  const className = useAuthViewClass('authVerifyFailedView');
  return (
    <div className={className} id="authVerifyFailedView">
      <div className="auth-icon auth-icon-warn">
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 className="auth-title" id="authVerifyFailedTitle"><AuthText id="authVerifyFailedTitle" /></h2>
      <p className="auth-lede" id="authVerifyFailedMsg"><AuthText id="authVerifyFailedMsg" /></p>
      <form onSubmit={(event) => handleAuthSubmit(event, resendVerification)}>
        <FieldLabel htmlFor="authResendEmail" labelKey="auth.email" text="Email" />
        <AuthInput
          className="auth-input"
          id="authResendEmail"
          name="authResendEmail"
          type="email"
          required
          placeholder="you@example.com"
        />
        <AuthError id="authVerifyFailedError" />
        <Button className="auth-btn primary" type="submit" data-i18n-key="auth.sendNewLink">
          Send a new link
        </Button>
      </form>
      <div className="auth-foot">
        <a href="#" onClick={(event) => handleAuthLink(event, showAuthSignin)}>Back to sign in</a>
      </div>
    </div>
  );
}

function VerifiedView() {
  const className = useAuthViewClass('authVerifiedView');
  return (
    <div className={className} id="authVerifiedView">
      <div className="auth-icon auth-icon-ok">
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 className="auth-title" data-i18n-key="auth.verifiedTitle">Email verified</h2>
      <p className="auth-lede" data-i18n-key="auth.verifiedMsg">
        You&apos;re signed in. Taking you to your dashboard…
      </p>
    </div>
  );
}

function BackLink() {
  return (
    <a className="auth-back-link" href="#" onClick={(event) => handleAuthLink(event, showAuthSignin)}>
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
      <span data-i18n-key="auth.backToSignIn">Back to sign in</span>
    </a>
  );
}

function ForgotPasswordView() {
  const className = useAuthViewClass('authForgotPasswordView');
  return (
    <form className={className} id="authForgotPasswordView" onSubmit={(event) => handleAuthSubmit(event, submitAuthForgotPassword)}>
      <BackLink />
      <div className="auth-icon">
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h2 className="auth-title" data-i18n-key="auth.resetTitle">Reset your password</h2>
      <p className="auth-lede" data-i18n-key="auth.resetLede">
        Enter your email and we&apos;ll send a reset link.
      </p>
      <FieldLabel htmlFor="authForgotEmail" labelKey="auth.email" text="Email" />
      <AuthInput
        className="auth-input"
        id="authForgotEmail"
        name="authForgotEmail"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />
      <AuthError id="authForgotError" />
      <AuthStatusButton className="auth-btn primary" id="authForgotBtn" type="submit" data-i18n-key="auth.sendResetLink">
        Send reset link
      </AuthStatusButton>
    </form>
  );
}

function ForgotSentView() {
  const className = useAuthViewClass('authForgotSentView');
  return (
    <div className={className} id="authForgotSentView">
      <div className="auth-icon">
        <MailIcon />
      </div>
      <h2 className="auth-title" data-i18n-key="auth.checkInbox">Check your inbox</h2>
      <p className="auth-lede">
        <span data-i18n-key="auth.forgotSentPre">If an account exists for </span>
        <strong id="authForgotSentEmail"><AuthText id="authForgotSentEmail" /></strong>
        <span data-i18n-key="auth.forgotSentPost">
          , we sent a password reset link. The link expires in 1 hour.
        </span>
      </p>
      <div className="auth-foot">
        <a href="#" data-i18n-key="auth.backToSignIn" onClick={(event) => handleAuthLink(event, showAuthSignin)}>Back to sign in</a>
      </div>
    </div>
  );
}

function ResetPasswordView() {
  const className = useAuthViewClass('authResetPasswordView');
  return (
    <form className={className} id="authResetPasswordView" onSubmit={(event) => handleAuthSubmit(event, submitAuthResetPassword)}>
      <div className="auth-icon auth-icon-ok">
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h2 className="auth-title" data-i18n-key="auth.setNewPassword">Set new password</h2>
      <p className="auth-lede" data-i18n-key="auth.setNewPasswordLede">
        Choose a new password for your account.
      </p>
      {/* a11y: password managers expect a username/email field on the same
          form so the new password can be associated with an account. The
          reset link carries the token + email, so this field stays hidden
          but part of the form. */}
      <Label className="auth-label sr-only-old" htmlFor="authResetEmail">Email</Label>
      <AuthInput
        className="auth-input sr-only-opacity"
        id="authResetEmail"
        type="email"
        autoComplete="username"
        tabIndex={-1}
        aria-hidden="true"
      />
      <FieldLabel htmlFor="authResetPassword" labelKey="auth.newPassword" text="New password" />
      <AuthInput
        className="auth-input"
        id="authResetPassword"
        name="authResetPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        placeholder="At least 8 characters"
        data-i18n-placeholder="chrome.passwordHint"
      />
      <FieldLabel htmlFor="authResetConfirm" labelKey="auth.confirmPassword" text="Confirm password" />
      <AuthInput
        className="auth-input"
        id="authResetConfirm"
        name="authResetConfirm"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        placeholder="Repeat your password"
        data-i18n-placeholder="chrome.repeatPassword"
      />
      <AuthError id="authResetError" />
      <AuthStatusButton className="auth-btn primary" id="authResetBtn" type="submit" data-i18n-key="auth.resetPassword">
        Reset password
      </AuthStatusButton>
    </form>
  );
}

function ResetSuccessView() {
  const className = useAuthViewClass('authResetSuccessView');
  return (
    <div className={className} id="authResetSuccessView">
      <div className="auth-icon auth-icon-ok">
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 className="auth-title" data-i18n-key="auth.passwordUpdated">Password updated</h2>
      <p className="auth-lede" data-i18n-key="auth.passwordUpdatedLede">
        Your password has been reset successfully. Sign in with your new password.
      </p>
      <Button className="auth-btn primary" type="button" data-i18n-key="auth.signIn" onClick={() => showAuthSignin()}>
        Sign in
      </Button>
    </div>
  );
}

function CodeLoginView() {
  const className = useAuthViewClass('authCodeLoginView');
  const codeWrapVisible = useAuthVisible('authCodeCodeWrap', false);
  const sentMessageVisible = useAuthVisible('authCodeSentMsg', false);
  const sendButtonVisible = useAuthVisible('authCodeSendBtn', true);
  const loginButtonVisible = useAuthVisible('authCodeLoginBtn', false);
  const resendVisible = useAuthVisible('authCodeResendWrap', false);
  return (
    <div className={className} id="authCodeLoginView">
      <BackLink />
      <div className="auth-icon">
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M12 11v4" />
          <circle cx="12" cy="8" r=".5" fill="currentColor" />
        </svg>
      </div>
      <h2 className="auth-title" data-i18n-key="auth.codeLoginTitle">Email code login</h2>
      <p className="auth-lede" data-i18n-key="auth.codeLoginLede">
        Enter your email to receive an 8-character login code.
      </p>
      <FieldLabel htmlFor="authCodeEmail" labelKey="auth.email" text="Email" />
      <AuthInput
        className="auth-input"
        id="authCodeEmail"
        name="authCodeEmail"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />
      <div id="authCodeCodeWrap" className={codeWrapVisible ? '' : 'hidden'}>
        <FieldLabel htmlFor="authCodeInput" labelKey="auth.codeLabel" text="8-character code" />
        <AuthInput
          className="auth-input auth-code-input"
          id="authCodeInput"
          name="authCodeInput"
          type="text"
          inputMode="text"
          pattern="[A-HJ-KM-NP-Z2-9]{8}"
          maxLength={8}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCD2345"
        />
        <p className={`auth-msg${sentMessageVisible ? '' : ' hidden'}`} id="authCodeSentMsg">
          <span data-i18n-key="auth.codeSentPre">We sent a code to </span>
          <strong id="authCodeSentEmail"><AuthText id="authCodeSentEmail" /></strong>
          <span data-i18n-key="auth.codeSentPost">. It expires in 10 minutes.</span>
        </p>
      </div>
      <AuthError id="authCodeError" />
      <AuthStatusButton className={`auth-btn primary${sendButtonVisible ? '' : ' hidden'}`} id="authCodeSendBtn" type="button" data-i18n-key="auth.sendCode" onClick={() => { void submitAuthSendCode(); }}>
        Send code
      </AuthStatusButton>
      <AuthStatusButton className={`auth-btn primary${loginButtonVisible ? '' : ' hidden'}`} id="authCodeLoginBtn" type="button" data-i18n-key="auth.logIn" onClick={() => { void submitAuthLoginWithCode(); }}>
        Log in
      </AuthStatusButton>
      <div className={`auth-foot${resendVisible ? '' : ' hidden'}`} id="authCodeResendWrap">
        <a href="#" data-i18n-key="auth.resendCode" onClick={(event) => handleAuthLink(event, () => { void resendAuthCode(); })}>Resend code</a>
      </div>
      <div className="auth-foot">
        <a href="#" data-i18n-key="auth.backToSignIn" onClick={(event) => handleAuthLink(event, showAuthSignin)}>Back to sign in</a>
      </div>
    </div>
  );
}
