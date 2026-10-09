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

export function ProviderTextField({
  id,
  field,
  label,
  placeholder,
  value,
  error,
  type = 'text',
  autoComplete,
  inputRef,
  onChange,
  defaultValue,
}: ProviderTextFieldProps) {
  const descriptionId = `provider-${id}-${field}-error`;
  return (
    <>
      <input
        ref={inputRef}
        className="settings-input"
        data-field={field}
        type={type}
        autoComplete={autoComplete}
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? descriptionId : undefined}
        placeholder={placeholder}
        {...(value === undefined ? { defaultValue } : { value })}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <span id={descriptionId} className="settings-field-error" role="alert">{error}</span> : null}
    </>
  );
}
