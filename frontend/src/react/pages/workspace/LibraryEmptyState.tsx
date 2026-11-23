import { i18n } from './workspaceUi';
import { Button } from '../../ui/shadcn/button';
import { PageEmptyState } from '../../ui/page/PageEmptyState';

import { triggerLibraryUpload } from './LibraryUploadInput';

interface LibraryEmptyStateProps {
  query: string;
  chip: 'recommend' | 'favorite' | 'folder' | 'images' | 'all';
  canUpload: boolean;
}

export function LibraryEmptyState({ query, chip, canUpload }: LibraryEmptyStateProps) {
  if (query) {
    return (
      <PageEmptyState
        title={i18n('library.noMatch', 'No matching items')}
        description={i18n('library.noMatchDesc', 'Try a different search.')}
      />
    );
  }
  if (chip === 'images') {
    return (
      <PageEmptyState
        title={i18n('library.emptyImages', 'No images yet')}
        description={i18n('library.emptyImagesDesc', 'Images you add will appear here.')}
      />
    );
  }
  return (
    <PageEmptyState
      title={i18n('library.emptyFiles', '你的资料库已就绪')}
      description={i18n('library.emptyFilesDesc', '上传文件，或在对话中添加附件。')}
      action={
        canUpload ? (
          <Button type="button" onClick={() => triggerLibraryUpload()}>
            {i18n('library.upload', 'Upload file')}
          </Button>
        ) : undefined
      }
    />
  );
}
