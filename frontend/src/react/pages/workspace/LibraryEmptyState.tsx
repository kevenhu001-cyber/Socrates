import { i18n } from './workspaceUi';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '../../ui/shadcn/empty';

interface LibraryEmptyStateProps {
  query: string;
  chip: 'recommend' | 'favorite' | 'folder' | 'images' | 'all';
}

export function LibraryEmptyState({ query, chip }: LibraryEmptyStateProps) {
  return (
    <Empty className="workspace-empty"><EmptyHeader>
      {query ? (
        <><EmptyTitle>{i18n('library.noMatch', 'No matching items')}</EmptyTitle><EmptyDescription>{i18n('library.noMatchDesc', 'Try a different search.')}</EmptyDescription></>
      ) : chip === 'images' ? (
        <><EmptyTitle>{i18n('library.emptyImages', 'No images yet')}</EmptyTitle><EmptyDescription>{i18n('library.emptyImagesDesc', 'Images you add will appear here.')}</EmptyDescription></>
      ) : (
        <><EmptyTitle>{i18n('library.emptyFiles', '你的资料库已就绪')}</EmptyTitle><EmptyDescription>{i18n('library.emptyFilesDesc', '上传文件，或在对话中添加附件。')}</EmptyDescription></>
      )}
    </EmptyHeader></Empty>
  );
}
