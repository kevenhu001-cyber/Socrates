import { RadioGroup } from '../ui/v3';
import type { ShareVisibility } from '../../legacy/shareState.ts';
import { shareText } from './shareText';

export function ShareVisibilityOptions({
  visibility,
  onSelect,
}: {
  visibility: ShareVisibility;
  onSelect: (visibility: ShareVisibility) => void;
}) {
  const choices = [
    {
      value: 'public',
      label: shareText('share.publicTitle', 'Anyone with the link'),
      description: shareText(
        'share.publicDesc',
        'No sign-in required. Anyone who has the link can view this conversation.',
      ),
    },
    {
      value: 'private',
      label: shareText('share.privateTitle', 'Only you'),
      description: shareText(
        'share.privateDesc',
        'Must be logged into your account to view. Still shared via link.',
      ),
    },
  ] as const;

  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="sr-only">
        {shareText('share.visibilityLabel', 'Link visibility')}
      </legend>
      <RadioGroup
        direction="col"
        className="share-visibility flex flex-col gap-2"
        aria-label={shareText('share.visibilityLabel', 'Link visibility')}
        value={visibility}
        onChange={(next) => {
          if (next === 'public' || next === 'private') onSelect(next);
        }}
      >
        {choices.map(({ value, label, description }) => (
          <RadioGroup.Item
            key={value}
            value={value}
            block
            className="rounded-lg border border-border px-3.5 py-2.5 transition-colors hover:bg-muted/40"
          >
            <div className="flex flex-col gap-0.5 text-left">
              <span className="text-sm font-medium text-foreground">{label}</span>
              <span className="text-xs text-muted-foreground">{description}</span>
            </div>
          </RadioGroup.Item>
        ))}
      </RadioGroup>
    </fieldset>
  );
}
