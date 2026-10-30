import { RadioGroup, RadioGroupItem } from '../ui/shadcn/radio-group';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet, FieldTitle } from '../ui/shadcn/field';
import type { ShareVisibility } from '../../ui/shareState.ts';
import { shareText } from './shareText';

export function ShareVisibilityOptions({ visibility, onSelect }: {
  visibility: ShareVisibility;
  onSelect: (visibility: ShareVisibility) => void;
}) {
  const choices = [
    { value: 'public', label: shareText('share.publicTitle', 'Anyone with the link'), description: shareText('share.publicDesc', 'No sign-in required. Anyone who has the link can view this conversation.') },
    { value: 'private', label: shareText('share.privateTitle', 'Only you'), description: shareText('share.privateDesc', 'Must be logged into your account to view. Still shared via link.') },
  ];
  return (
    <FieldSet>
      <FieldLegend className="sr-only">{shareText('share.visibilityLabel', 'Link visibility')}</FieldLegend>
      <RadioGroup className="share-visibility" aria-label={shareText('share.visibilityLabel', 'Link visibility')} value={visibility} onValueChange={(next) => {
        if (next === 'public' || next === 'private') onSelect(next);
      }}>
        {choices.map(({ value, label, description }) => (
          <FieldLabel key={value} htmlFor={`share-visibility-${value}`}>
            <Field orientation="horizontal">
              <RadioGroupItem id={`share-visibility-${value}`} value={value} aria-label={label} />
              <FieldContent>
                <FieldTitle>{label}</FieldTitle>
                <FieldDescription>{description}</FieldDescription>
              </FieldContent>
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}
