import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { BrandMark } from '../components/BrandMark';
import { appStore } from '../stores/appStore';
import { AUTH_BASE_URL, authApi } from '../data/api/client';
import { native } from '../native/native';
import { getInitialLink, parseLink, subscribeToLinks } from '../native/links';
import { deleteItem, setItem } from '../platform/secureStorage';
import { isValidLoginCode, normalizeLoginCode } from '../data/auth/loginCode';

type AuthView = 'signin' | 'register' | 'verifySent' | 'verifyFailed' | 'verifying' | 'forgot' | 'forgotSent' | 'reset' | 'resetSuccess' | 'code';

function AuthField({ label, ...props }: TextInputProps & { label: string }) {
  const { colors, radius, typography } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textMuted, fontFamily: typography.medium }]}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.textSubtle}
        style={[styles.input, { color: colors.text, backgroundColor: '#202020', borderColor: colors.border, borderRadius: radius.sm, fontFamily: typography.body }, props.style]}
      />
    </View>
  );
}

function AuthButton({ label, busy, secondary = false, icon, onPress, disabled, testID }: { label: string; busy?: boolean; secondary?: boolean; icon?: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; disabled?: boolean; testID?: string }) {
  const { colors, radius, typography } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      testID={testID}
      disabled={busy || disabled}
      onPress={onPress}
      style={[styles.button, { borderRadius: radius.sm }, secondary ? { borderColor: colors.border, borderWidth: 1, backgroundColor: 'transparent' } : { backgroundColor: colors.accent }]}
    >
      {busy ? <ActivityIndicator color={secondary ? colors.text : colors.white} /> : (
        <View style={styles.buttonCopy}>
          {icon ? <Ionicons name={icon} size={19} color={secondary ? colors.text : colors.white} /> : null}
          <Text style={[styles.buttonText, { color: secondary ? colors.text : colors.white, fontFamily: typography.medium }]}>{label}</Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

function StateIcon({ name, success = false, warning = false }: { name: React.ComponentProps<typeof Ionicons>['name']; success?: boolean; warning?: boolean }) {
  const { colors } = useTheme();
  const color = warning ? colors.danger : success ? colors.success : colors.accent;
  return <View style={[styles.stateIcon, { backgroundColor: `${color}20` }]}><Ionicons name={name} size={36} color={color} /></View>;
}

export function AuthScreen() {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const [view, setView] = useState<AuthView>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [guest, setGuest] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const show = (next: AuthView) => { setError(''); setView(next); };

  const rememberGuest = async () => {
    if (guest) await setItem('socrates.auth.guest-mode', 'true').catch(() => undefined);
    else await deleteItem('socrates.auth.guest-mode').catch(() => undefined);
  };

  const verify = useCallback(async (token: string) => {
    setView('verifying');
    setError('');
    try {
      const user = await authApi.verifyEmail(token);
      await appStore.loginWithUser(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('auth.verifyFailedBody'));
      setView('verifyFailed');
    }
  }, [t]);

  const handleUrl = useCallback(async (url: string | null) => {
    if (!url) return;
    const params = parseLink(url).queryParams || {};
    const oauthError = params.error;
    if (typeof oauthError === 'string' && oauthError) {
      setError(`${t('auth.githubFailed')}: ${oauthError}`);
      return;
    }
    const exchangeToken = params.exchangeToken;
    if (typeof exchangeToken === 'string' && exchangeToken) {
      setBusy(true);
      try { await appStore.loginWithUser(await authApi.oauthExchange(exchangeToken)); }
      catch (caught) { setError(caught instanceof Error ? caught.message : t('auth.githubFailed')); }
      finally { setBusy(false); }
      return;
    }
    const token = params.token;
    if (typeof token === 'string' && token) {
      await verify(token);
      return;
    }
    const reset = params.reset_token;
    if (typeof reset === 'string' && reset) {
      setResetToken(reset);
      show('reset');
    }
  }, [t, verify]);

  useEffect(() => {
    void getInitialLink().then(handleUrl);
    const subscription = subscribeToLinks((url) => { void handleUrl(url); });
    return () => subscription.remove();
  }, [handleUrl]);

  const submitSignIn = async () => {
    if (!email.trim() || !password) { setError(t('auth.needBoth')); return; }
    setBusy(true); setError('');
    try { await rememberGuest(); await appStore.login(email.trim(), password); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('auth.cannotSignIn')); }
    finally { setBusy(false); }
  };

  const submitRegister = async () => {
    if (!email.trim() || password.length < 8) { setError(t('auth.passwordTooShort')); return; }
    setBusy(true); setError('');
    try { await authApi.register(email.trim(), password); setView('verifySent'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('auth.registerFailed')); }
    finally { setBusy(false); }
  };

  const resendVerification = async () => {
    if (!email.trim()) { setError(t('auth.pleaseEnterEmail')); return; }
    setBusy(true); setError('');
    try { await authApi.resendVerification(email.trim()); setView('verifySent'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('auth.resendFailed')); }
    finally { setBusy(false); }
  };

  const submitForgot = async () => {
    if (!email.trim()) { setError(t('auth.pleaseEnterEmail')); return; }
    setBusy(true); setError('');
    try { await authApi.forgotPassword(email.trim()); setView('forgotSent'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('auth.resetRequestFailed')); }
    finally { setBusy(false); }
  };

  const sendCode = async () => {
    if (!email.trim()) { setError(t('auth.pleaseEnterEmail')); return; }
    setBusy(true); setError('');
    try { await authApi.sendCode(email.trim()); setCodeSent(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('auth.codeSendFailed')); }
    finally { setBusy(false); }
  };

  const submitCode = async () => {
    const normalizedCode = normalizeLoginCode(code);
    if (!isValidLoginCode(normalizedCode)) { setError(t('auth.codeInvalid')); return; }
    setBusy(true); setError('');
    try { await rememberGuest(); await appStore.loginWithUser(await authApi.loginWithCode(email.trim(), normalizedCode)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('auth.cannotSignIn')); }
    finally { setBusy(false); }
  };

  const submitReset = async () => {
    if (password.length < 8) { setError(t('auth.passwordTooShort')); return; }
    if (password !== confirmPassword) { setError(t('auth.passwordsDontMatch')); return; }
    setBusy(true); setError('');
    try { await authApi.resetPassword(resetToken, password); setView('resetSuccess'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('auth.resetFailed')); }
    finally { setBusy(false); }
  };

  const signInWithGithub = async () => {
    setBusy(true); setError('');
    try {
      const redirectUrl = 'socrates://auth/callback';
      const result = await native.openOAuth(`${AUTH_BASE_URL}/auth/oauth/github/mobile/start?redirect_uri=${encodeURIComponent(redirectUrl)}`, redirectUrl);
      if (result.type !== 'success' || !result.url) return;
      await handleUrl(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('auth.githubFailed'));
    } finally { setBusy(false); }
  };

  const backLink = <AnimatedPressable onPress={() => show('signin')} style={styles.backLink}><Ionicons name="arrow-back" size={15} color={colors.textMuted} /><Text style={[styles.backText, { color: colors.textMuted, fontFamily: typography.body }]}>{t('auth.backToSignIn')}</Text></AnimatedPressable>;
  const guestControl = (
    <AnimatedPressable accessibilityRole="checkbox" accessibilityState={{ checked: guest }} onPress={() => setGuest((value) => !value)} style={styles.guestRow}>
      <View style={[styles.checkbox, { borderColor: guest ? colors.accent : colors.borderStrong, backgroundColor: guest ? colors.accent : 'transparent' }]}>{guest ? <Ionicons name="checkmark" size={14} color={colors.textInverse} /> : null}</View>
      <Text style={[styles.guestText, { color: colors.textMuted, fontFamily: typography.body }]}>{t('auth.guestMode')}</Text>
    </AnimatedPressable>
  );

  let content: React.ReactNode;
  if (view === 'signin' || view === 'register') {
    content = (
      <>
        <View style={[styles.tabs, { borderBottomColor: colors.border }]}> 
          {(['signin', 'register'] as const).map((tab) => (
            <AnimatedPressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: view === tab }} onPress={() => show(tab)} style={styles.tab}>
              <Text style={[styles.tabText, { color: view === tab ? colors.text : colors.textMuted, fontFamily: typography.medium }]}>{tab === 'signin' ? t('auth.signIn') : t('auth.createAccount')}</Text>
              {view === tab ? <View style={[styles.activeLine, { backgroundColor: colors.accent }]} /> : null}
            </AnimatedPressable>
          ))}
        </View>
        {view === 'signin' ? (
          <>
            <AuthField testID="auth-email-input" label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" />
            <AuthField label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="••••••••" />
            <AnimatedPressable onPress={() => show('forgot')} style={styles.inlineRight}><Text style={[styles.inlineLink, { color: colors.accent, fontFamily: typography.body }]}>{t('auth.forgotPassword')}</Text></AnimatedPressable>
            {error ? <Text style={[styles.error, { color: colors.danger, fontFamily: typography.body }]}>{error}</Text> : null}
            {guestControl}
            <AuthButton testID="auth-sign-in-button" label={t('auth.signIn')} busy={busy} onPress={() => { void submitSignIn(); }} />
            <View style={styles.separator}><View style={[styles.separatorLine, { backgroundColor: colors.border }]} /><Text style={[styles.separatorText, { color: colors.textSubtle, fontFamily: typography.body }]}>{t('auth.or')}</Text><View style={[styles.separatorLine, { backgroundColor: colors.border }]} /></View>
            <AuthButton label={t('auth.github')} busy={busy} secondary icon="logo-github" onPress={() => { void signInWithGithub(); }} />
            <AnimatedPressable onPress={() => show('code')} style={styles.centerLink}><Text style={[styles.inlineLink, { color: colors.accent, fontFamily: typography.body }]}>{t('auth.codeLogin')}</Text></AnimatedPressable>
            <Text style={[styles.foot, { color: colors.textSubtle, fontFamily: typography.body }]}>{t('auth.noAccount')} <Text onPress={() => show('register')} style={{ color: colors.accent }}>{t('auth.createOne')}</Text></Text>
          </>
        ) : (
          <>
            <Text style={[styles.lede, { color: colors.textMuted, fontFamily: typography.body }]}>{t('auth.registerLede')}</Text>
            <AuthField label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" />
            <AuthField label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder={t('auth.atLeastEight')} />
            {error ? <Text style={[styles.error, { color: colors.danger, fontFamily: typography.body }]}>{error}</Text> : null}
            <AuthButton label={t('auth.sendVerification')} busy={busy} onPress={() => { void submitRegister(); }} />
            <Text style={[styles.foot, { color: colors.textSubtle, fontFamily: typography.body }]}>{t('auth.alreadyVerified')} <Text onPress={() => show('signin')} style={{ color: colors.accent }}>{t('auth.signIn')}</Text></Text>
          </>
        )}
      </>
    );
  } else if (view === 'verifySent') {
    content = <><StateIcon name="mail-outline" /><Text style={[styles.stateTitle, { color: colors.text, fontFamily: typography.display }]}>{t('auth.checkInbox')}</Text><Text style={[styles.lede, { color: colors.textMuted, fontFamily: typography.body }]}>{t('auth.verifySentBody', { email })}</Text>{error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}<AuthButton label={t('auth.resendLink')} busy={busy} secondary onPress={() => { void resendVerification(); }} /><AnimatedPressable onPress={() => show('signin')} style={styles.centerLink}><Text style={[styles.inlineLink, { color: colors.accent }]}>{t('auth.differentEmail')}</Text></AnimatedPressable></>;
  } else if (view === 'verifyFailed') {
    content = <><StateIcon name="alert-circle-outline" warning /><Text style={[styles.stateTitle, { color: colors.text, fontFamily: typography.display }]}>{t('auth.verifyFailedTitle')}</Text><Text style={[styles.lede, { color: colors.textMuted, fontFamily: typography.body }]}>{error || t('auth.verifyFailedBody')}</Text><AuthField label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" /><AuthButton label={t('auth.sendNewLink')} busy={busy} onPress={() => { void resendVerification(); }} />{backLink}</>;
  } else if (view === 'verifying') {
    content = <View style={styles.verifying}><ActivityIndicator color={colors.accent} /><Text style={[styles.stateTitle, { color: colors.text, fontFamily: typography.display }]}>{t('auth.verifying')}</Text></View>;
  } else if (view === 'forgot' || view === 'forgotSent') {
    content = view === 'forgot' ? <>{backLink}<StateIcon name="lock-closed-outline" /><Text style={[styles.stateTitle, { color: colors.text, fontFamily: typography.display }]}>{t('auth.resetTitle')}</Text><Text style={[styles.lede, { color: colors.textMuted, fontFamily: typography.body }]}>{t('auth.resetLede')}</Text><AuthField label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />{error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}<AuthButton label={t('auth.sendResetLink')} busy={busy} onPress={() => { void submitForgot(); }} /></> : <><StateIcon name="mail-outline" /><Text style={[styles.stateTitle, { color: colors.text, fontFamily: typography.display }]}>{t('auth.checkInbox')}</Text><Text style={[styles.lede, { color: colors.textMuted, fontFamily: typography.body }]}>{t('auth.resetSentBody', { email })}</Text>{backLink}</>;
  } else if (view === 'reset' || view === 'resetSuccess') {
    content = view === 'reset' ? <><StateIcon name="lock-open-outline" success /><Text style={[styles.stateTitle, { color: colors.text, fontFamily: typography.display }]}>{t('auth.setNewPassword')}</Text><Text style={[styles.lede, { color: colors.textMuted, fontFamily: typography.body }]}>{t('auth.setNewPasswordBody')}</Text><AuthField label={t('auth.newPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder={t('auth.atLeastEight')} /><AuthField label={t('auth.confirmPassword')} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" placeholder={t('auth.repeatPassword')} />{error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}<AuthButton label={t('auth.resetPassword')} busy={busy} onPress={() => { void submitReset(); }} /></> : <><StateIcon name="checkmark" success /><Text style={[styles.stateTitle, { color: colors.text, fontFamily: typography.display }]}>{t('auth.passwordUpdated')}</Text><Text style={[styles.lede, { color: colors.textMuted, fontFamily: typography.body }]}>{t('auth.passwordUpdatedBody')}</Text><AuthButton label={t('auth.signIn')} onPress={() => show('signin')} /></>;
  } else {
    content = <>{backLink}<StateIcon name="keypad-outline" /><Text style={[styles.stateTitle, { color: colors.text, fontFamily: typography.display }]}>{t('auth.emailCodeLogin')}</Text><Text style={[styles.lede, { color: colors.textMuted, fontFamily: typography.body }]}>{t('auth.emailCodeLede')}</Text><AuthField testID="auth-code-email-input" label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />{codeSent ? <><AuthField testID="auth-login-code-input" label={t('auth.sixDigitCode')} value={code} onChangeText={(value) => setCode(normalizeLoginCode(value))} autoCapitalize="characters" autoCorrect={false} autoComplete="one-time-code" maxLength={8} placeholder="ABCD2345" style={styles.codeInput} /><Text style={[styles.codeMessage, { color: colors.textMuted, fontFamily: typography.body }]}>{t('auth.codeSentBody', { email })}</Text></> : null}{error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}{guestControl}<AuthButton testID="auth-code-submit-button" label={codeSent ? t('auth.logIn') : t('auth.sendCode')} busy={busy} onPress={() => { void (codeSent ? submitCode() : sendCode()); }} />{codeSent ? <AnimatedPressable onPress={() => { void sendCode(); }} style={styles.centerLink}><Text style={[styles.inlineLink, { color: colors.accent }]}>{t('auth.resendCode')}</Text></AnimatedPressable> : null}</>;
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
            <View style={styles.brand}><BrandMark size={25} /><Text style={[styles.brandText, { color: colors.text, fontFamily: typography.semibold }]}>Socrates</Text></View>
            {content}
          </View>
          <Text style={[styles.footnote, { color: colors.textSubtle, fontFamily: typography.body }]}>{t('auth.footnote')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 24 },
  card: { width: '100%', maxWidth: 420, alignSelf: 'center', borderWidth: 1, paddingHorizontal: 16, paddingTop: 27, paddingBottom: 24 },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 22 },
  brandText: { fontSize: 18 },
  tabs: { height: 52, flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 22 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14 },
  activeLine: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2 },
  field: { marginTop: 7 },
  label: { fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8 },
  input: { minHeight: 42, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  inlineRight: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center' },
  inlineLink: { fontSize: 12 },
  guestRow: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: { width: 17, height: 17, borderRadius: 3, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  guestText: { fontSize: 13 },
  button: { minHeight: 42, marginTop: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonCopy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontSize: 14 },
  separator: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 12 },
  separatorLine: { flex: 1, height: StyleSheet.hairlineWidth },
  separatorText: { fontSize: 11 },
  centerLink: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  foot: { textAlign: 'center', fontSize: 12, marginTop: 8 },
  footnote: { width: '100%', maxWidth: 420, alignSelf: 'center', fontSize: 12, lineHeight: 18, marginTop: 18 },
  error: { minHeight: 18, fontSize: 12, lineHeight: 17, marginTop: 6 },
  lede: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 10 },
  stateIcon: { width: 64, height: 64, borderRadius: 32, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  stateTitle: { textAlign: 'center', fontSize: 21, lineHeight: 28, marginBottom: 8 },
  backLink: { minHeight: 40, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  backText: { fontSize: 12 },
  verifying: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 22 },
  codeInput: { fontSize: 22, letterSpacing: 8, textAlign: 'center' },
  codeMessage: { textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 8 },
});
