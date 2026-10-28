import { Input as ShadcnInput } from '../ui/shadcn/input';
import { Button as UiButton } from '../ui/Button';
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
        <ShadcnInput
          className="share-link-input"
          id="shareLinkInput"
          name="shareLinkInput"
          type="text"
          readOnly
          onClick={(event) => (event.target as HTMLInputElement).select()}
          aria-label={shareText('sidebar.shareLink', 'Share link')}
          value={shareUrl}
        />
        <UiButton type="button" className="share-copy-btn" id="shareCopyBtn" onClick={onCopy}>
          {shareText('share.copy', 'Copy')}
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
