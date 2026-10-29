import type { ChangeEvent } from 'react';
import { NativeControl } from '../../ui/NativeControl';
import { uploadLibraryFiles } from './workspace.service';

export function LibraryUploadInput() {
  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (input.files?.length) await uploadLibraryFiles(input.files);
    input.value = '';
  };

  return <NativeControl id="libraryUploadInput" type="file" multiple hidden onChange={handleChange} />;
}
