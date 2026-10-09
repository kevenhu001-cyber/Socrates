import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import type { Session } from '@socrates/contracts';
import { useChatStore } from '@socrates/chat';
import type { ShareDialogVisibility } from './ShareDialog';
import { api, appWebOrigin } from './runtime';
import { copyText } from './clipboard';
import { uuidScope } from './sessionIdentity';
import { appStringsNow } from './strings';

/** Owns the create/copy/revoke lifecycle for a conversation share link. */
export function useSessionSharing(active: Session | null) {
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSessionId, setShareSessionId] = useState<string | null>(null);
  const [shareVisibility, setShareVisibility] = useState<ShareDialogVisibility>('public');
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [shareError, setShareError] = useState('');
  const [shareBusy, setShareBusy] = useState(false);

  const reset = useCallback(() => {
    setShareOpen(false);
    setShareSessionId(null);
    setShareVisibility('public');
    setShareToken(null);
    setShareUrl('');
    setShareStatus('');
    setShareError('');
    setShareBusy(false);
  }, []);

  const openShare = useCallback(() => {
    if (!active) return;
    setShareOpen(true);
    setShareVisibility('public');
    setShareSessionId(null);
    setShareToken(null);
    setShareUrl('');
    setShareStatus(appStringsNow().shareSaving);
    setShareError('');
    setShareBusy(true);
    void (async () => {
      try {
        let sessionId = uuidScope(active.id);
        if (!sessionId) {
          const saved = await api.sessions.save(active);
          useChatStore.getState().adoptSessionId(active.id, saved);
          sessionId = uuidScope(saved.id);
        }
        if (!sessionId) throw new Error(appStringsNow().shareNone);
        setShareSessionId(sessionId);
        setShareStatus('');
      } catch (error) {
        setShareError(error instanceof Error ? error.message : appStringsNow().shareCreateFailed);
        setShareStatus('');
      } finally {
        setShareBusy(false);
      }
    })();
  }, [active]);

  const createShare = useCallback(async () => {
    if (!shareSessionId || shareBusy) return;
    setShareBusy(true);
    setShareError('');
    setShareStatus(appStringsNow().shareCreating);
    try {
      const result = await api.sessions.createShare(shareSessionId, shareVisibility);
      const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : appWebOrigin;
      const url = `${origin}?share=${encodeURIComponent(result.token)}`;
      setShareToken(result.token);
      setShareUrl(url);
      setShareStatus(appStringsNow().shareReady);
    } catch (error) {
      setShareError(`${appStringsNow().shareCreateFailed}: ${error instanceof Error ? error.message : 'network error'}`);
      setShareStatus('');
    } finally {
      setShareBusy(false);
    }
  }, [shareBusy, shareSessionId, shareVisibility]);

  const copyShare = useCallback(async () => {
    if (!shareUrl || shareBusy) return;
    setShareBusy(true);
    setShareError('');
    setShareStatus(appStringsNow().shareCopying);
    try {
      await copyText(shareUrl);
      setShareStatus(appStringsNow().shareCopied);
    } catch (error) {
      setShareError(`${appStringsNow().shareCopyFailed}: ${error instanceof Error ? error.message : 'clipboard unavailable'}`);
      setShareStatus('');
    } finally {
      setShareBusy(false);
    }
  }, [shareBusy, shareUrl]);

  const revokeShare = useCallback(async () => {
    if (!shareSessionId || !shareToken || shareBusy) return;
    setShareBusy(true);
    setShareError('');
    setShareStatus(appStringsNow().shareRevoking);
    try {
      await api.sessions.revokeShare(shareSessionId);
      setShareToken(null);
      setShareUrl('');
      setShareStatus(appStringsNow().shareNoLink);
    } catch (error) {
      setShareError(`${appStringsNow().shareRevokeFailed}: ${error instanceof Error ? error.message : 'network error'}`);
      setShareStatus('');
    } finally {
      setShareBusy(false);
    }
  }, [shareBusy, shareSessionId, shareToken]);

  const closeShare = useCallback(() => setShareOpen(false), []);

  return {
    shareOpen,
    shareVisibility,
    shareUrl,
    shareBusy,
    shareStatus,
    shareError,
    setShareVisibility,
    reset,
    openShare,
    createShare,
    copyShare,
    revokeShare,
    closeShare,
  };
}
