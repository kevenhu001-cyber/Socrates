import { i18n } from './workspaceUi';

interface LibraryEmptyStateProps {
  query: string;
  chip: 'recommend' | 'favorite' | 'folder' | 'images' | 'all';
}

export function LibraryEmptyState({ query, chip }: LibraryEmptyStateProps) {
  return (
    <div className="workspace-empty">
      {query ? (
        <><strong>{i18n('library.noMatch', 'No matching items')}</strong><span>{i18n('library.noMatchDesc', 'Try a different search.')}</span></>
      ) : chip === 'images' ? (
        <><strong>{i18n('library.emptyImages', 'No images yet')}</strong><span>{i18n('library.emptyImagesDesc', 'Images you add will appear here.')}</span></>
      ) : (
        <><strong>{i18n('library.emptyFiles', '你的资料库已就绪')}</strong><span>{i18n('library.emptyFilesDesc', '上传文件，或在对话中添加附件。')}</span></>
      )}
    </div>
  );
}
