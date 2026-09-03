import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from './AnimatedPressable';
import { colors } from '../theme/theme';

/* Error fallback is intentionally dark-themed regardless of the app's
 * current mode — error screens read as "console output", and a global
 * token flip during a render crash would compound the confusion. The
 * values still come from the canonical palette so a token edit in
 * `@socrates/theme` propagates here. */

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught React rendering crash:', error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <Ionicons name="alert-circle-outline" size={36} color={colors.accent} />
            </View>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              The application encountered an unexpected rendering error. It has been safely intercepted to prevent a crash.
            </Text>

            {this.state.error ? (
              <View style={styles.errorBox}>
                <Text numberOfLines={4} style={styles.errorText}>
                  {this.state.error.message || String(this.state.error)}
                </Text>
              </View>
            ) : null}

            <AnimatedPressable onPress={this.resetError} style={styles.retryButton}>
              <Text style={styles.retryText}>Reload Application</Text>
            </AnimatedPressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  errorBox: {
    width: '100%',
    backgroundColor: colors.backgroundSunken,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  retryButton: {
    width: '100%',
    height: 46,
    backgroundColor: colors.accent,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
  },
});

