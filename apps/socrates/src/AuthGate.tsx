import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ThemeMode } from '@socrates/theme';
import { getThemePaletteHex } from '@socrates/theme';

// Login gate for the Universal App. Networking stays outside: the caller
// passes `onLogin(email, password)` wired to `@socrates/api` auth + storage.
// No document/window/localStorage here — platform storage is injected above.
export function AuthGate({
  mode = 'light',
  pending = false,
  error = null,
  onLogin,
  onGuest,
}: {
  mode?: ThemeMode;
  pending?: boolean;
  error?: string | null;
  onLogin(email: string, password: string): void;
  onGuest(): void;
}) {
  const p = getThemePaletteHex(mode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const canSubmit = email.trim().length > 3 && password.length > 0 && !pending;
  return (
    <View style={[styles.wrap, { backgroundColor: p.bg.page }]}>
      <View style={[styles.card, { borderColor: p.border.default, backgroundColor: p.bg.raised }]}>
        <Text style={[styles.brand, { color: p.text.primary }]}>Socrates</Text>
        <Text style={[styles.sub, { color: p.text.muted }]}>Sign in to sync chats across Web + Android</Text>
        <Text accessibilityLabel="Email label" style={[styles.label, { color: p.text.secondary }]}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={p.text.muted}
          style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]}
        />
        <Text style={[styles.label, { color: p.text.secondary }]}>Password</Text>
        <TextInput
          accessibilityLabel="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={p.text.muted}
          style={[styles.input, { borderColor: p.border.default, color: p.text.primary }]}
          onSubmitEditing={() => canSubmit && onLogin(email.trim(), password)}
        />
        {error ? <Text style={[styles.error, { color: p.danger }]}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          disabled={!canSubmit}
          onPress={() => onLogin(email.trim(), password)}
          style={[styles.primary, { backgroundColor: p.text.primary, opacity: canSubmit ? 1 : 0.4 }]}
        >
          <Text style={[styles.primaryText, { color: p.onAccent }]}>{pending ? 'Signing in…' : 'Sign in'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Continue without login" onPress={onGuest} style={styles.ghost}>
          <Text style={[styles.ghostText, { color: p.text.muted }]}>Continue without login</Text>
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
  primary: { marginTop: 16, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryText: { fontWeight: '600', fontSize: 16 },
  ghost: { marginTop: 10, paddingVertical: 10, alignItems: 'center' },
  ghostText: { fontSize: 14 },
});
