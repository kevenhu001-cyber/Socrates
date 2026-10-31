import { Button } from '../ui/shadcn/button';
import { Input } from '../ui/shadcn/input';
import { i18n } from '../legacy/gateway';
import { useKbStore } from '../../store/index.ts';
import { renderRecents, setRecentsSearch } from '../../ui/recentsView.ts';
import { setSidebarPanelView, toggleSidebarPanelView, useSidebarStore } from '../../sidebar/sidebar.store.ts';
import { useSessionListSearchQuery } from '../session-list/sessionList.store.ts';

/** The search field and tutor-only view actions share one React-owned row. */
export function SidebarSearchRow() {
  const mistakeCount = useKbStore((snapshot) => snapshot.mistakes.length);
  const searchQuery = useSessionListSearchQuery();
  const activePanel = useSidebarStore((snapshot) => snapshot.activePanel);
  const showRecents = () => {
    setSidebarPanelView('recents');
    renderRecents();
  };
  const toggleView = (view: 'knowledge' | 'mistakes') => {
    if (toggleSidebarPanelView(view) === 'recents') renderRecents();
  };

  return (
    <div className="sidebar-search-row-inner" data-sidebar-view={activePanel}>
      <div className="sidebar-search">
        <svg className="sidebar-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <circle cx="10.75" cy="10.75" r="6.75" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <Input
          type="text"
          id="sidebarSearch"
          name="sidebarSearch"
          value={searchQuery}
          autoComplete="off"
          spellCheck={false}
          placeholder={i18n('sidebar.searchPlaceholder', 'Search chats')}
          data-i18n-placeholder="sidebar.searchPlaceholder"
          aria-label={i18n('sidebar.searchPlaceholder', 'Search chats')}
          data-i18n-aria="sidebar.searchPlaceholder"
          onChange={(event) => setRecentsSearch(event.currentTarget.value)}
          onFocus={showRecents}
        />
      </div>
      <Button
        id="tabKnowledge"
        aria-pressed={activePanel === 'knowledge'}
        className={`sidebar-view-btn tutor-only${activePanel === 'knowledge' ? ' active' : ''}`}
        type="button"
        variant="ghost"
        size="icon-sm"
        title={i18n('sidebar.knowledge', 'Knowledge')}
        data-i18n-title="sidebar.knowledge"
        aria-label={i18n('sidebar.knowledge', 'Knowledge')}
        data-i18n-aria="sidebar.knowledge"
        onClick={() => toggleView('knowledge')}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-icon="inline-start">
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="18" cy="8" r="2.5" />
          <circle cx="10.5" cy="18" r="2.5" />
          <path d="m8.5 6.4 7 1.2M6.9 8.4l2.7 7.2m6.9-5.7-4.4 6.2" />
        </svg>
      </Button>
      <Button
        id="tabMistakes"
        aria-pressed={activePanel === 'mistakes'}
        className={`sidebar-view-btn tutor-only${activePanel === 'mistakes' ? ' active' : ''}`}
        type="button"
        variant="ghost"
        size="icon-sm"
        title={i18n('sidebar.mistakes', 'Mistakes')}
        data-i18n-title="sidebar.mistakes"
        aria-label={i18n('sidebar.mistakes', 'Mistakes')}
        data-i18n-aria="sidebar.mistakes"
        onClick={() => toggleView('mistakes')}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-icon="inline-start">
          <path d="M8 3.5h8A2.5 2.5 0 0 1 18.5 6v13.5a.75.75 0 0 1-1.2.6L12 16l-5.3 4.1a.75.75 0 0 1-1.2-.6V6A2.5 2.5 0 0 1 8 3.5Z" />
        </svg>
        <span className="tab-badge" id="mistakesTabBadge">{mistakeCount > 0 ? mistakeCount : ''}</span>
      </Button>
    </div>
  );
}
