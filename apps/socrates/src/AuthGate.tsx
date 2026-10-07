import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ThemeMode } from '@socrates/theme';
import { getThemePaletteHex } from '@socrates/theme';
import { useAppStrings } from './strings';

export type AuthGateMode = 'password' | 'code' | 'register' | 'forgot';

// Login gate for the Universal App. Networking stays outside: the caller
// passes delegates wired to `@socrates/api` auth + storage. Password login
// and emailed-code login yield mobile token pairs and sign in directly;
// register/forgot use the shared web credential endpoints (verification and
// reset links open the website — the user signs in here afterwards).
// No document/window/localStorage here — platform storage is injected above.
export function AuthGate({
  mode = 'light',
  pending = false,
  error = null,
  notice = null,
  onLogin,
  onSendCode,
  onLoginWithCode,
  onRegister,
  onResendVerification,
  onForgotPassword,
  onGuest,
}: {
  mode?: ThemeMode;
  pending?: boolean;
  error?: string | null;
  notice?: string | null;
  onLogin(email: string, password: string): void;
  onSendCode(email: string): void;
  onLoginWithCode(email: string, code: string): void;
  onRegister(email: string, password: string): void;
  onResendVerification(email: string): void;
  onForgotPassword(email: string): void;
  onGuest(): void;
}) {
  const p = getThemePaletteHex(mode);
  const s = useAppStrings();
  const [gate, setGate] = useState<AuthGateMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const emailOk = email.trim().length > 3;
  const switchTo = (next: AuthGateMode) => setGate(next);
  const link = (label: string, target: AuthGateMode) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => switchTo(target)} style={styles.ghost}>
      <Text style={[styles.ghostText, { color: p.text.secondary }]}>{label}</Text>
    </Pressable>
  );
  const submit = (label: string, enabled: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!enabled}
      onPress={onPress}
      style={[styles.primary, { backgroundColor: p.text.primary, opacity: enabled ? 1 : 0.4 }]}
    >
      <Text style={[styles.primaryText, { color: p.onAccent }]}>{pending ? s.working : label}</Text>
    </Pressable>
  );
  const emailField = (
    <>
      <Text accessibilityLabel="Email label" style={[styles.label, { color: p.text.secondary }]}>{s.emailLabel}</Text>
      <TextInput
        accessibilityLabel={s.emailLabel}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={p.text.muted}
        style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]}
      />
    </>
  );
  return (
    <View style={[styles.wrap, { backgroundColor: p.bg.page }]}>
      <View style={[styles.card, { borderColor: p.border.default, backgroundColor: p.bg.raised }]}>
        <Text style={[styles.brand, { color: p.text.primary }]}>{s.signInPrompt}</Text>
        <Text style={[styles.sub, { color: p.text.muted }]}>{s.signInSub}</Text>
        {gate === 'password' ? (
          <>
            {emailField}
            <Text style={[styles.label, { color: p.text.secondary }]}>{s.passwordLabel}</Text>
            <TextInput
              accessibilityLabel={s.passwordLabel}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={p.text.muted}
              style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]}
              onSubmitEditing={() => emailOk && password.length > 0 && !pending && onLogin(email.trim(), password)}
            />
            {submit(s.signIn, emailOk && password.length > 0 && !pending, () => onLogin(email.trim(), password))}
            {link(s.useCodeInstead, 'code')}
            {link(s.createAccountLink, 'register')}
            {link(s.forgotPasswordLink, 'forgot')}
          </>
        ) : null}
        {gate === 'code' ? (
          <>
            {emailField}
            {submit(s.emailMeCode, emailOk && !pending, () => onSendCode(email.trim()))}
            <Text style={[styles.label, { color: p.text.secondary }]}>{s.loginCodeLabel}</Text>
            <TextInput
              accessibilityLabel={s.loginCodeLabel}
              autoCapitalize="characters"
              value={code}
              onChangeText={setCode}
              placeholder={s.codePlaceholder}
              placeholderTextColor={p.text.muted}
              style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]}
              onSubmitEditing={() => emailOk && code.trim().length > 0 && !pending && onLoginWithCode(email.trim(), code.trim())}
            />
            {submit(s.verifyAndSignIn, emailOk && code.trim().length > 0 && !pending, () => onLoginWithCode(email.trim(), code.trim()))}
            {link(s.backToPassword, 'password')}
          </>
        ) : null}
        {gate === 'register' ? (
          <>
            {emailField}
            <Text style={[styles.label, { color: p.text.secondary }]}>{s.newPasswordLabel}</Text>
            <TextInput
              accessibilityLabel={s.newPasswordInput}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={p.text.muted}
              style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]}
            />
            {submit(s.createAccount, emailOk && password.length >= 8 && !pending, () => onRegister(email.trim(), password))}
            <Pressable accessibilityRole="button" accessibilityLabel={s.resendVerification} disabled={!emailOk || pending} onPress={() => onResendVerification(email.trim())} style={styles.ghost}>
              <Text style={[styles.ghostText, { color: p.text.secondary }]}>{s.resendVerification}</Text>
            </Pressable>
            <Text style={[styles.hint, { color: p.text.muted }]}>{s.registerHint}</Text>
            {link(s.backToSignIn, 'password')}
          </>
        ) : null}
        {gate === 'forgot' ? (
          <>
            {emailField}
            {submit(s.emailResetLink, emailOk && !pending, () => onForgotPassword(email.trim()))}
            <Text style={[styles.hint, { color: p.text.muted }]}>{s.forgotHint}</Text>
            {link(s.backToSignIn, 'password')}
          </>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: p.danger }]}>{error}</Text> : null}
        {notice ? <Text style={[styles.notice, { color: p.text.secondary }]}>{notice}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={s.continueWithoutLogin} onPress={onGuest} style={styles.ghost}>
          <Text style={[styles.ghostText, { color: p.text.muted }]}>{s.continueWithoutLogin}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, borderWidth: 1, borderRadius: 16, padding: 20 },
  brand: { fontSize: 22, fontWeight: '700' },
  sub: { marginTop: 4, marginBottom: 16 },
  label: { fontSize: 13, marginTop: 10, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  error: { marginTop: 10 },
  notice: { marginTop: 10 },
  hint: { fontSize: 13, marginTop: 10 },
  primary: { marginTop: 16, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryText: { fontWeight: '600', fontSize: 16 },
  ghost: { marginTop: 10, paddingVertical: 10, alignItems: 'center' },
  ghostText: { fontSize: 14 },
});
