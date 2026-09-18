import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import { Overlay } from './Overlay';
import { toast } from './Toast';
import { setClipboardText } from '../native/clipboard';
import { native } from '../native/native';

export interface SharePayload {
  url: string;
  title?: string;
}

let current: SharePayload | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => {
    listener();
  });
}

export function openShare(payload: SharePayload): void {
  current = payload;
  emit();
}

export function closeShare(): void {
  current = null;
  emit();
}

function getShare(): SharePayload | null {
  return current;
}

function subscribeShare(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const shareModal = {
  open: openShare,
  close: closeShare,
};

/* P0 1:1 — replaces the former full-screen `ShareScreen` route with the
 * modal frontend uses: `.share-overlay` scrim + `.share-modal`
 * (`90%; max-width:400px; padding:24/20/20; radius:16px`,
 * `slideUp .2s var(--ease-out)`, `frontend/src/styles.css:2603-2605`).
 * Visibility tiers and revoke need backend support (`sharesApi` only
 * exposes create/get) and stay documented gaps. */
export function ShareModal() {
  const { colors, typography } = useTheme();
  const t = useT();
  const payload = useSyncExternalStore(subscribeShare, getShare, getShare);
  const [rendered, setRendered] = useState<SharePayload | null>(null);

  useEffect(() => {
    if (!payload) {
      setRendered(null);
      return undefined;
    }
    setRendered(payload);
    return undefined;
  }, [payload]);

  if (!rendered) return null;

  const copy = async () => {
    await setClipboardText(rendered.url);
    toast.show(t('share.copied') || 'Link copied', 'success');
  };

  return (
    <Overlay
      visible
      onClose={closeShare}
      maxWidth={400}
      testID="share-modal"
      style={[styles.modal, { backgroundColor: colors.surfaceRaised, borderColor: withAlpha(colors.border, 0.15) }]}
    >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>
              {t('share.title') || 'Share conversation'}
            </Text>
            <AnimatedPressable
              testID="share-close"
              accessibilityRole="button"
              accessibilityLabel={t('common.close') || 'Close'}
              onPress={closeShare}
              style={styles.close}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </AnimatedPressable>
          </View>
          <Text style={[styles.label, { color: colors.textMuted, fontFamily: typography.body }]}>
            {rendered.title || t('share.link')}
          </Text>
          <Text selectable style={[styles.url, { color: colors.text, fontFamily: typography.body }]}>
            {rendered.url}
          </Text>
          <View style={styles.actions}>
            <AnimatedPressable
              testID="share-copy"
              accessibilityRole="button"
              onPress={() => {
                void copy();
              }}
              style={[styles.button, { backgroundColor: colors.accent, borderRadius: 8 }]}
            >
              <Text style={[styles.buttonText, { color: colors.textInverse, fontFamily: typography.medium }]}>
                {t('share.copy') || 'Copy link'}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              testID="share-native"
              accessibilityRole="button"
              onPress={() => {
                void native.share(rendered.url);
              }}
              style={[styles.button, { backgroundColor: colors.surfaceHover, borderRadius: 8 }]}
            >
              <Text style={[styles.buttonText, { color: colors.text, fontFamily: typography.medium }]}>
                {t('common.share') || 'Share'}
              </Text>
            </AnimatedPressable>
          </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  modal: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15,
  },
  close: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    marginTop: 12,
  },
  url: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
  },
  button: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  buttonText: {
    fontSize: 13,
  },
});
