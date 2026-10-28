import { Input } from '../ui/shadcn/input';
import { Field, FieldError, FieldLabel } from '../ui/shadcn/field';
interface ProviderTextFieldProps {
  id: string;
  field: 'label' | 'url' | 'key' | 'model';
  label: string;
  placeholder: string;
  value?: string;
  defaultValue?: string;
  error?: string;
  type?: 'text' | 'password';
  autoComplete?: string;
  inputRef?: (element: HTMLInputElement | null) => void;
  onChange: (value: string) => void;
}

export function ProviderTextField({ id, field, label, placeholder, value, error, type = 'text', autoComplete, inputRef, onChange, defaultValue }: ProviderTextFieldProps) {
  const inputId = `provider-${id}-${field}`;
  const descriptionId = `${inputId}-error`;
  return <Field data-invalid={Boolean(error)}>
    <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
    <Input id={inputId} ref={inputRef} data-field={field} type={type} autoComplete={autoComplete}
      aria-invalid={Boolean(error)} aria-describedby={error ? descriptionId : undefined}
      placeholder={placeholder} {...(value === undefined ? { defaultValue } : { value })}
      onChange={(event) => onChange(event.target.value)} />
    {error ? <FieldError id={descriptionId}>{error}</FieldError> : null}
  </Field>;
}
