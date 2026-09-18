import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
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
import { sharesApi, type ShareVisibility } from '../data/api/client';

export interface SharePayload {
  /** Session to share — enables the create/revoke flow against
   * `/sessions/:id/share`. Optional so url-only callers (artifact
   * shares, etc.) can still reuse the modal as a copy sheet. */
  sessionId?: string;
  url?: string;
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

function VisibilityOption({
  vis,
  currentVis,
  title,
  desc,
  onSelect,
  testID,
  colors,
  typography,
}: {
  vis: ShareVisibility;
  currentVis: ShareVisibility;
  title: string;
  desc: string;
  onSelect: (vis: ShareVisibility) => void;
  testID: string;
  colors: ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
}) {
  const selected = vis === currentVis;
  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      onPress={() => onSelect(vis)}
      style={[
        styles.opt,
        {
          backgroundColor: selected ? withAlpha(colors.accent, 0.08) : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
        },
      ]}
    >
      <View style={[styles.optRadio, { borderColor: selected ? colors.accent : colors.textMuted }]}>
        {selected ? <View style={[styles.optRadioDot, { backgroundColor: colors.accent }]} /> : null}
      </View>
      <View style={styles.optBody}>
        <Text style={[styles.optTitle, { color: colors.text, fontFamily: typography.medium }]}>
          {title}
        </Text>
        <Text style={[styles.optDesc, { color: colors.textMuted, fontFamily: typography.body }]}>
          {desc}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

/* P0 1:1 — replaces the former full-screen `ShareScreen` route with the
 * modal frontend uses: `.share-overlay` scrim + `.share-modal`
 * (`90%; max-width:400px; padding:24/20/20; radius:16px`,
 * `slideUp .2s var(--ease-out)`, `frontend/src/styles.css:2603-2605`).
 * Ported from `frontend/src/react/shareModal/ShareModal.tsx` +
 * `frontend/src/ui/share.js`: public/private radio group, create link,
 * copy, revoke, status/error rows, against the same
 * `/api/sessions/:id/share` endpoints. */
export function ShareModal() {
  const { colors, typography } = useTheme();
  const t = useT();
  const payload = useSyncExternalStore(subscribeShare, getShare, getShare);
  const [rendered, setRendered] = useState<SharePayload | null>(null);
  const [visibility, setVisibility] = useState<ShareVisibility>('public');
  const [shareUrl, setShareUrl] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  /* Mirror web `openShareModal`: each open resets the link/status/error
   * and defaults visibility to public. */
  useEffect(() => {
    if (!payload) {
      setRendered(null);
      return;
    }
    setRendered(payload);
    setVisibility('public');
    setShareUrl(payload.url || '');
    setStatus('');
    setError('');
  }, [payload]);

  const selectVis = useCallback((vis: ShareVisibility) => {
    setVisibility(vis);
  }, []);

  const createLink = useCallback(async () => {
    if (!rendered?.sessionId) return;
    setError('');
    setStatus(t('share.creating'));
    try {
      const share = await sharesApi.create(rendered.sessionId, visibility);
      if (share && share.token) {
        /* The server returns `url: '/a/<token>'`; the web builds
         * `?share=<token>` on the SPA origin instead, so keep the same
         * recipient-facing shape here. */
        setShareUrl(sharesApi.absoluteUrl(share.url || `?share=${encodeURIComponent(share.token)}`));
        setStatus(t('share.ready'));
      } else {
        setError(t('share.failed'));
      }
    } catch (e) {
      setError(`${t('share.errorPrefix')}${e instanceof Error ? e.message : t('share.networkError')}`);
    }
  }, [rendered?.sessionId, visibility, t]);

  const revokeLink = useCallback(async () => {
    if (!rendered?.sessionId || !shareUrl) return;
    try {
      await sharesApi.revoke(rendered.sessionId);
      setShareUrl('');
      setStatus(t('share.revoked'));
    } catch (e) {
      setError(`${t('share.revokeErrorPrefix')}${e instanceof Error ? e.message : t('share.networkError')}`);
    }
  }, [rendered?.sessionId, shareUrl, t]);

  if (!rendered) return null;

  const hasLink = !!shareUrl;

  const copy = async () => {
    await setClipboardText(shareUrl);
    setStatus(t('share.copied'));
    toast.show(t('share.copied'), 'success');
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
          {t('share.title')}
        </Text>
        <AnimatedPressable
          testID="share-close"
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={closeShare}
          style={styles.close}
        >
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </AnimatedPressable>
      </View>

      {rendered.sessionId ? (
        <View style={styles.visibility} accessibilityRole="radiogroup">
          <VisibilityOption
            vis="public"
            currentVis={visibility}
            title={t('share.publicTitle')}
            desc={t('share.publicDesc')}
            onSelect={selectVis}
            testID="share-vis-public"
            colors={colors}
            typography={typography}
          />
          <VisibilityOption
            vis="private"
            currentVis={visibility}
            title={t('share.privateTitle')}
            desc={t('share.privateDesc')}
            onSelect={selectVis}
            testID="share-vis-private"
            colors={colors}
            typography={typography}
          />
        </View>
      ) : null}

      {rendered.title && !hasLink ? (
        <Text style={[styles.label, { color: colors.textMuted, fontFamily: typography.body }]}>
          {rendered.title}
        </Text>
      ) : null}

      {hasLink ? (
        <>
          {/* Bordered surface box with the URL and a compact accent copy
           * button — matches the web `.share-link` row. */}
          <View style={[styles.urlBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text selectable numberOfLines={2} style={[styles.url, { color: colors.textMuted, fontFamily: typography.body }]}>
              {shareUrl}
            </Text>
            <AnimatedPressable
              testID="share-copy"
              accessibilityRole="button"
              onPress={() => {
                void copy();
              }}
              style={[styles.copyButton, { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.copyButtonText, { color: colors.textInverse, fontFamily: typography.medium }]}>
                {t('share.copy')}
              </Text>
            </AnimatedPressable>
          </View>
          <View style={styles.actions}>
            <AnimatedPressable
              testID="share-native"
              accessibilityRole="button"
              onPress={() => {
                void native.share(shareUrl);
              }}
              style={[styles.button, { backgroundColor: colors.surfaceHover }]}
            >
              <Text style={[styles.buttonText, { color: colors.text, fontFamily: typography.medium }]}>
                {t('common.share')}
              </Text>
            </AnimatedPressable>
          </View>
        </>
      ) : null}

      {hasLink && rendered.sessionId ? (
        <View style={styles.revokeArea}>
          <AnimatedPressable
            testID="share-revoke"
            accessibilityRole="button"
            onPress={() => {
              void revokeLink();
            }}
          >
            <Text style={[styles.revokeText, { color: colors.danger, fontFamily: typography.body }]}>
              {`× ${t('share.revoke')}`}
            </Text>
          </AnimatedPressable>
        </View>
      ) : null}

      {error ? (
        <Text testID="share-error" style={[styles.errorText, { color: colors.danger, fontFamily: typography.body }]}>
          {error}
        </Text>
      ) : null}

      {status ? (
        <Text testID="share-status" style={[styles.statusText, { color: colors.textMuted, fontFamily: typography.body }]}>
          {status}
        </Text>
      ) : null}

      {rendered.sessionId ? (
        <View style={styles.createArea}>
          <AnimatedPressable
            testID="share-create"
            accessibilityRole="button"
            onPress={() => {
              void createLink();
            }}
            style={[styles.button, { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.buttonText, { color: colors.textInverse, fontFamily: typography.medium }]}>
              {t('share.create')}
            </Text>
          </AnimatedPressable>
        </View>
      ) : null}
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
    fontSize: 16,
  },
  close: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibility: {
    marginTop: 12,
    gap: 8,
  },
  opt: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
  },
  optRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  optRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  optBody: {
    flex: 1,
    minWidth: 0,
  },
  optTitle: {
    fontSize: 14,
  },
  optDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  label: {
    fontSize: 12,
    marginTop: 12,
  },
  urlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    marginTop: 12,
  },
  url: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 19,
  },
  copyButton: {
    minHeight: 34,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    flexShrink: 0,
  },
  copyButtonText: {
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  button: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  buttonText: {
    fontSize: 13,
  },
  revokeArea: {
    alignItems: 'center',
    marginTop: 8,
  },
  revokeText: {
    fontSize: 13,
  },
  errorText: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  createArea: {
    alignItems: 'center',
    marginTop: 4,
  },
});
