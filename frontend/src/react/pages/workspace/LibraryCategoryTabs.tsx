import { PageTabs } from '../../ui/page/PageTabs';
import type { useWorkspaceDispatch } from './workspace.hooks';
import { i18n } from './workspaceUi';

interface LibraryCategoryTabsProps {
  chip: 'recommend' | 'favorite' | 'folder' | 'images' | 'all';
  onChipChange: (chip: LibraryCategoryTabsProps['chip']) => void;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}

export function LibraryCategoryTabs({ chip, onChipChange, dispatch }: LibraryCategoryTabsProps) {
  const categories = [
    { value: 'recommend', label: i18n('library.tabRecommend', '推荐') },
    { value: 'favorite', label: i18n('library.tabFavorite', '收藏') },
    { value: 'folder', label: i18n('library.tabFolder', '文件夹') },
    { value: 'images', label: i18n('library.filter.images', '图片') },
    { value: 'all', label: i18n('library.tabAll', '全部') },
  ] as const;

  return (
    <PageTabs
      value={chip}
      ariaLabel={i18n('sidebar.library.title', '资料库')}
      items={categories}
      onChange={(value) => {
        onChipChange(value);
        if (value === 'images') dispatch.switchTab('files');
      }}
    />
  );
}
