import { SettingsRow } from '../layout/SettingsRow';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/shadcn/select';

/** A labelled, keyboard-navigable preference; labels remain localized while
 * only the stable option value is persisted by its owning service. */
export function PreferenceSelect({
  id,
  label,
  value,
  options,
  onValueChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
}) {
  return (
    <SettingsRow
      htmlFor={id}
      label={label}
      className="settings-choice"
      control={
        <Select
          items={options}
          value={value}
          onValueChange={(next) => {
            if (next !== null) onValueChange(next);
          }}
        >
          <SelectTrigger id={id} className="min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false}>
            <SelectGroup>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      }
    />
  );
}
