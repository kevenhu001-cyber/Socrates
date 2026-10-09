import type { ReactNode } from 'react';
import { getLegacyActions, t } from '../legacy/gateway.ts';
import { clearRecentsFilter } from '../../sidebar/sidebar.service';

interface SessionListEmptyStateProps {
  searchQuery: string;
  filter: string | null;
  fetchFailed: boolean;
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="recents-empty">
      <div className="recents-empty-text">{children}</div>
    </div>
  );
}

export function SessionListEmptyState({
  searchQuery,
  filter,
  fetchFailed,
}: SessionListEmptyStateProps) {
  const sessionActions = getLegacyActions().sessions;
  let content: ReactNode;

  if (searchQuery) {
    const [before, after] = t('session.noSearchMatch').split('{query}');
    content = (
      <>
        {before}<strong>&ldquo;{searchQuery}&rdquo;</strong>{after}<br />
        <a href="#" onClick={(event) => {
          event.preventDefault();
          sessionActions.setRecentsSearch('');
        }}>{t('session.clearSearch')}</a> {t('session.showAllHint')}
      </>
    );
  } else if (fetchFailed && !filter) {
    content = (
      <>
        {t('session.loadListFailed')}<br />
        <a href="#" onClick={(event) => {
          event.preventDefault();
          sessionActions.retryRecentsFetch();
        }}>{t('session.retry')}</a>
      </>
    );
  } else if (filter) {
    const filterLabel = filter.indexOf('project:') === 0 ? 'Project' : '#' + filter;
    const [before, after] = t('session.noFilterMatch').split('{filter}');
    content = (
      <>
        {before}<strong>{filterLabel}</strong>{after}<br />
        <a href="#" onClick={(event) => {
          event.preventDefault();
          clearRecentsFilter();
        }}>{t('session.clearFilter')}</a> {t('session.showAllHint')}
      </>
    );
  } else {
    content = <>{t('session.empty')}<br />{t('session.emptyHint')}</>;
  }

  return <div className="recents-list-content"><EmptyState>{content}</EmptyState></div>;
}
