import { SettingsRow } from '../layout/SettingsRow';
import { Select } from '../ui/v3';

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
          id={id}
          options={options}
          value={value}
          onChange={(option) => onValueChange(option.value)}
          variant="outline"
          size="md"
          block={false}
          align="end"
          triggerClassName="min-w-36"
        />
      }
    />
  );
}
