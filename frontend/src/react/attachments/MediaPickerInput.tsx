import { Input } from '../ui/shadcn/input';

export function MediaPickerInput({
  id,
  accept,
  capture,
  multiple,
  onChange,
}: {
  id: string;
  accept: string;
  capture?: boolean | 'user' | 'environment';
  multiple: boolean;
  onChange(files: File[]): void;
}) {
  return <Input
    id={id}
    type="file"
    accept={accept}
    capture={capture}
    multiple={multiple}
    hidden
    tabIndex={-1}
    aria-hidden="true"
    onChange={(event) => onChange(Array.from(event.currentTarget.files || []))}
  />;
}
