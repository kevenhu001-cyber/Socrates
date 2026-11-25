import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/shadcn/button';
import { openCmdK } from '../../legacy/cmdK.ts';
import { Input } from '../ui/shadcn/input';
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
  useEffect(() => {
    if (storeQuery === lastSentRef.current) return;
    lastSentRef.current = storeQuery;
    setDraft(storeQuery);
  }, [storeQuery]);

  return (
    <div className="sidebar-search-row-inner" data-sidebar-view={activePanel}>
      <div className="sidebar-search">
        <svg
          className="sidebar-search-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <Input
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
          onFocus={showRecents}
        />
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="sidebar-search-kbd"
          aria-label={i18n('chrome.openSearch', 'Open global search')}
          title={i18n('chrome.openSearch', 'Open global search')}
          onClick={() => openCmdK()}
        >
          <kbd aria-hidden="true">⌘K</kbd>
        </Button>
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
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
          data-icon="inline-start"
        >
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
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
          data-icon="inline-start"
        >
          <path d="M8 3.5h8A2.5 2.5 0 0 1 18.5 6v13.5a.75.75 0 0 1-1.2.6L12 16l-5.3 4.1a.75.75 0 0 1-1.2-.6V6A2.5 2.5 0 0 1 8 3.5Z" />
        </svg>
        <span className="tab-badge" id="mistakesTabBadge">
          {mistakeCount > 0 ? mistakeCount : ''}
        </span>
      </Button>
    </div>
  );
}
