import { shareText } from './shareText';

export function ShareLinkPanel({
  hasLink,
  shareUrl,
  error,
  status,
  onCopy,
  onRevoke,
  onCreate,
}: {
  hasLink: boolean;
  shareUrl: string;
  error: string;
  status: string;
  onCopy: () => void;
  onRevoke: () => void;
  onCreate: () => void;
}) {
  return (
    <>
      <div className={`share-link-area${hasLink ? '' : ' hidden'}`} id="shareLinkArea">
        <input
          className="share-link-input"
          id="shareLinkInput"
          name="shareLinkInput"
          type="text"
          readOnly
          onClick={(event) => (event.target as HTMLInputElement).select()}
          aria-label={shareText('sidebar.shareLink', 'Share link')}
          value={shareUrl}
        />
        <button type="button" className="share-copy-btn" id="shareCopyBtn" onClick={onCopy}>
          {shareText('share.copy', 'Copy')}
        </button>
      </div>

      <div
        className={hasLink ? '' : 'hidden'}
        id="shareRevokeArea"
        style={hasLink ? { textAlign: 'center' } : undefined}
      >
        <button type="button" className="share-revoke" onClick={onRevoke}>
          {'× ' + shareText('share.revoke', 'Revoke share link')}
        </button>
      </div>

      <div className={`share-error${error ? '' : ' hidden'}`} id="shareError">{error}</div>
      <div className={`share-status${status ? '' : ' hidden'}`} id="shareStatus">{status}</div>

      <div id="shareCreateArea" style={{ textAlign: 'center', marginTop: 4 }}>
        <button
          type="button"
          className="settings-btn primary"
          id="shareCreateBtn"
          onClick={onCreate}
          style={{ marginTop: 8 }}
        >
          {shareText('share.create', 'Create share link')}
        </button>
      </div>
    </>
  );
}
