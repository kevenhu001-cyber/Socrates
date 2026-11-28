import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/shadcn/button';
import { Input } from '../ui/v3';
import { Icon } from '../../legacy/Icon';
import { i18n } from '../../ui/legacyI18n.ts';
import { useAllSessionMistakes } from '../tutor/useAllSessionMistakes';
import { renderRecents, setRecentsSearch } from '../../legacy/recentsView.ts';
import {
  setSidebarPanelView,
  toggleSidebarPanelView,
  useSidebarStore,
} from '../../sidebar/sidebar.store.ts';
import { useSessionListSearchQuery } from '../session-list/sessionList.store.ts';

/** The search field and tutor-only view actions share one React-owned row. */
export function SidebarSearchRow() {
  /* RN-14: the badge counts every session's mistakes, the same list the mistake book shows. */
  const mistakeCount = useAllSessionMistakes().length;
  const storeQuery = useSessionListSearchQuery();
  const activePanel = useSidebarStore((snapshot) => snapshot.activePanel);
  const showRecents = () => {
    setSidebarPanelView('recents');
    renderRecents();
  };
  const toggleView = (view: 'knowledge' | 'mistakes') => {
    if (toggleSidebarPanelView(view) === 'recents') renderRecents();
  };

  /* The field is uncontrolled between keystrokes and adopts the store value
     only when it changes from somewhere else (the empty state's "Clear
     search" link, a session switch). Binding `value` straight to the store
     made every keystroke a round trip through the frame-coalesced publisher:
     React re-applied the committed value after the caret had already moved,
     and the browser pushed the caret to the end — typing in the middle of the
     word visibly jumped. Keeping the draft local means the DOM is never
     rewritten while the reader types, so the caret stays where they put it.

     External changes are told apart from our own echo by value, not by a
     "user is typing" flag: the publisher is async, so a flag would still be
     set when a legitimate outside write (clear-search, session switch)
     arrives and the field would silently keep the stale draft. */
  const [draft, setDraft] = useState(storeQuery);
  const lastSentRef = useRef(storeQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const clearSearch = () => {
    lastSentRef.current = '';
    setDraft('');
    setRecentsSearch('');
    inputRef.current?.focus();
  };
  useEffect(() => {
    if (storeQuery === lastSentRef.current) return;
    lastSentRef.current = storeQuery;
    setDraft(storeQuery);
  }, [storeQuery]);

  return (
    <div className="sidebar-search-row-inner" data-sidebar-view={activePanel}>
      <div className="sidebar-search">
        <Icon name="search" size={16} className="sidebar-search-icon" />
        <Input
          ref={inputRef}
          type="text"
          id="sidebarSearch"
          name="sidebarSearch"
          value={draft}
          autoComplete="off"
          spellCheck={false}
          placeholder={i18n('sidebar.filterRecents', 'Filter recent chats')}
          data-i18n-placeholder="sidebar.filterRecents"
          aria-label={i18n('sidebar.filterRecents', 'Filter recent chats')}
          data-i18n-aria="sidebar.filterRecents"
          onChange={(event) => {
            const next = event.currentTarget.value;
            lastSentRef.current = next;
            setDraft(next);
            setRecentsSearch(next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && draft) {
              event.preventDefault();
              event.stopPropagation();
              clearSearch();
            }
          }}
          onFocus={showRecents}
        />
        {draft ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-5 w-5 shrink-0 rounded-full p-0 text-muted-foreground hover:text-foreground"
            aria-label={i18n('common.clear', 'Clear')}
            title={i18n('common.clear', 'Clear')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={clearSearch}
          >
            <Icon name="close" size={12} />
          </Button>
        ) : null}
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
        <Icon name="knowledge" size={18} data-icon="inline-start" />
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
        <Icon name="bookmark" size={18} data-icon="inline-start" />
        <span className="tab-badge" id="mistakesTabBadge">
          {mistakeCount > 0 ? mistakeCount : ''}
        </span>
      </Button>
    </div>
  );
}
