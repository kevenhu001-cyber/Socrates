import { Tabs, TabsList, TabsTrigger } from '../../ui/shadcn/tabs';
import { cn } from 'cn';
import type { useWorkspaceDispatch } from './workspace.hooks';
import { i18n } from './workspaceUi';

interface LibraryCategoryTabsProps {
  chip: 'recommend' | 'favorite' | 'folder' | 'images' | 'all';
  onChipChange: (chip: LibraryCategoryTabsProps['chip']) => void;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}

export function LibraryCategoryTabs({ chip, onChipChange, dispatch }: LibraryCategoryTabsProps) {
  const categories = [
    { id: 'recommend', label: i18n('library.tabRecommend', '推荐') },
    { id: 'favorite', label: i18n('library.tabFavorite', '收藏') },
    { id: 'folder', label: i18n('library.tabFolder', '文件夹') },
    { id: 'images', label: i18n('library.filter.images', '图片') },
    { id: 'all', label: i18n('library.tabAll', '全部') },
  ] as const;

  return (
    <Tabs value={chip} onValueChange={(value) => {
      onChipChange(value as LibraryCategoryTabsProps['chip']);
      if (value === 'images') dispatch.switchTab('files');
    }}>
    <TabsList className="library-chips-bar" aria-label={i18n('sidebar.library.title', '资料库')}>
      {categories.map((category) => (
        <TabsTrigger
          key={category.id}
          type="button"
          value={category.id}
          className={cn('library-chip', chip === category.id && 'active')}
        >
          {category.label}
        </TabsTrigger>
      ))}
    </TabsList>
    </Tabs>
  );
}
