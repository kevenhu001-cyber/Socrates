import { Input as ShadcnInput } from '../ui/shadcn/input';
import { Button as UiButton } from '../ui/Button';
import { useCallback, useEffect, useRef, useState } from 'react';
import { shareText } from './shareText';

export function ShareLinkPanel({
  hasLink,
  shareUrl,
  error,
  status,
  onRevoke,
  onCreate,
}: {
  hasLink: boolean;
  shareUrl: string;
  error: string;
  status: string;
  onRevoke: () => void;
  onCreate: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<'copied' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /* Copying belongs to the panel: it renders the link field, so it can
     select it for the legacy selection-copy fallback when the async
     clipboard API is unavailable (a plain-HTTP origin, for instance). */
  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
    } catch {
      const input = inputRef.current;
      if (input) {
        input.select();
        try {
          copied = document.execCommand('copy');
        } catch {
          copied = false;
        }
      }
    }
    setCopyState(copied ? 'copied' : 'failed');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyState(null), 1200);
  }, [shareUrl]);

  const copyLabel = copyState === 'copied'
    ? shareText('tool.copied', 'Copied')
    : copyState === 'failed'
      ? shareText('tool.copyFailed', 'Copy failed')
      : shareText('share.copy', 'Copy');

  return (
    <>
      <div className={`share-link-area${hasLink ? '' : ' hidden'}`} id="shareLinkArea">
        <ShadcnInput
          className="share-link-input"
          id="shareLinkInput"
          name="shareLinkInput"
          type="text"
          readOnly
          ref={inputRef}
          onClick={(event) => event.currentTarget.select()}
          aria-label={shareText('sidebar.shareLink', 'Share link')}
          value={shareUrl}
        />
        <UiButton type="button" className="share-copy-btn" id="shareCopyBtn" onClick={() => { void handleCopy(); }}>
          {copyLabel}
        </UiButton>
      </div>

      <div
        className={hasLink ? '' : 'hidden'}
        id="shareRevokeArea"
        style={hasLink ? { textAlign: 'center' } : undefined}
      >
        <UiButton type="button" className="share-revoke" onClick={onRevoke}>
          {'× ' + shareText('share.revoke', 'Revoke share link')}
        </UiButton>
      </div>

      <div className={`share-error${error ? '' : ' hidden'}`} id="shareError">{error}</div>
      <div className={`share-status${status ? '' : ' hidden'}`} id="shareStatus">{status}</div>

      <div id="shareCreateArea" style={{ textAlign: 'center', marginTop: 4 }}>
        <UiButton variant="outline"
          type="button"
          className="btn"
          id="shareCreateBtn"
          onClick={onCreate}
          style={{ marginTop: 8 }}
        >
          {shareText('share.create', 'Create share link')}
        </UiButton>
      </div>
    </>
  );
}
