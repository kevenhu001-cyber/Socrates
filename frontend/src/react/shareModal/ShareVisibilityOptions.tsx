import type { ShareVisibility } from './types';
import { shareText } from './shareText';

function VisibilityOption({
  vis,
  currentVis,
  labelKey,
  labelFallback,
  descKey,
  descFallback,
  onSelect,
}: {
  vis: ShareVisibility;
  currentVis: ShareVisibility;
  labelKey: string;
  labelFallback: string;
  descKey: string;
  descFallback: string;
  onSelect: (vis: ShareVisibility) => void;
}) {
  const selected = vis === currentVis;
  return (
    <div
      className={`share-opt${selected ? ' selected' : ''}`}
      role="radio"
      tabIndex={0}
      aria-checked={selected ? 'true' : 'false'}
      onClick={() => onSelect(vis)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(vis);
        }
      }}
    >
      <div className="share-opt-radio">
        <span className="share-opt-radio-dot" />
      </div>
      <div className="share-opt-body">
        <div className="share-opt-title">{shareText(labelKey, labelFallback)}</div>
        <div className="share-opt-desc">{shareText(descKey, descFallback)}</div>
      </div>
    </div>
  );
}

export function ShareVisibilityOptions({
  visibility,
  onSelect,
}: {
  visibility: ShareVisibility;
  onSelect: (visibility: ShareVisibility) => void;
}) {
  return (
    <div className="share-visibility" role="radiogroup" aria-label={shareText('share.visibilityLabel', 'Link visibility')}>
      <VisibilityOption
        vis="public"
        currentVis={visibility}
        labelKey="share.publicTitle"
        labelFallback="Anyone with the link"
        descKey="share.publicDesc"
        descFallback="No sign-in required. Anyone who has the link can view this conversation."
        onSelect={onSelect}
      />
      <VisibilityOption
        vis="private"
        currentVis={visibility}
        labelKey="share.privateTitle"
        labelFallback="Only you"
        descKey="share.privateDesc"
        descFallback="Must be logged into your account to view. Still shared via link."
        onSelect={onSelect}
      />
    </div>
  );
}
